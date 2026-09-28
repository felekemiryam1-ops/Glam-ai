"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const PHOTO_TIPS = [
  "Face clearly visible, looking at the camera",
  "Natural or even lighting — avoid harsh shadows",
  "In-focus and clear, not blurry or pixelated",
  "Recent photo showing your current hair and skin",
];

const INCLUDES = [
  "Your warm, cool or neutral colour direction",
  "Your personalized makeup style",
  "Your three most flattering colours",
  "Your number one beauty first move",
];

/**
 * Compute SHA-256 of a base64 string using the Web Crypto API.
 * Still needed — the hash is stored now and used at makeup-checkout time
 * to cryptographically bind the image to the payment.
 */
async function computeImageHash(base64: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(base64);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize EXIF orientation before the photo ever reaches an AI pipeline.
 * Phones/cameras often store a photo's pixels "as sensor-captured" plus an
 * EXIF Orientation tag telling viewers how to rotate it for display — most
 * image-processing/AI code ignores that tag and reads raw pixels, so a
 * portrait selfie can arrive at the model sideways or upside down.
 *
 * `createImageBitmap(file, { imageOrientation: "from-image" })` decodes the
 * file with the EXIF rotation already baked into the returned bitmap's
 * pixels; drawing that to a canvas and re-exporting gives us image bytes
 * with NO orientation tag ambiguity left — what you see is what's stored.
 *
 * This runs once, right at upload, before the hash used to cryptographically
 * bind the image to payment is computed — so the same corrected bytes flow
 * through the entire pipeline (preview, checkout, generate-makeup) with no
 * risk of a hash mismatch from re-encoding later.
 *
 * Returns null if the browser can't do this (very old browsers) — callers
 * should fall back to the raw file rather than block the upload.
 */
async function normalizeOrientation(
  file: File
): Promise<{ dataUrl: string; base64: string; mimeType: string } | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Request the original type (normalize the legacy "image/jpg" alias);
    // some browsers (e.g. Safari for WebP) silently fall back to PNG if the
    // requested type isn't supported for export — so we read the ACTUAL
    // encoded type back out of the resulting data URL rather than assuming
    // the request was honored.
    const requestedType = file.type === "image/jpg" ? "image/jpeg" : file.type;
    const quality = requestedType === "image/jpeg" ? 0.95 : undefined;
    const dataUrl = canvas.toDataURL(requestedType, quality);
    const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;

    return { dataUrl, base64, mimeType };
  } catch {
    return null;
  }
}

function UploadPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wasCancelled = searchParams.get("cancelled") === "true";

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  // The actual encoded type after orientation normalization — may differ
  // from imageFile.type (e.g. Safari re-encodes unsupported export types as
  // PNG). This is what's sent to the server, not imageFile.type.
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"hashing" | "analyzing">("hashing");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Show cancelled message briefly
  const [showCancelled, setShowCancelled] = useState(wasCancelled);
  useEffect(() => {
    if (showCancelled) {
      const t = setTimeout(() => setShowCancelled(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showCancelled]);

  const validateAndSetImage = useCallback(async (file: File) => {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be under 10MB. Please try a smaller file.");
      return;
    }

    setImageFile(file);

    // Normalize EXIF orientation before this photo goes anywhere near an AI
    // pipeline — see normalizeOrientation() above.
    const normalized = await normalizeOrientation(file);
    if (normalized) {
      setImagePreview(normalized.dataUrl);
      setImageBase64(normalized.base64);
      setImageMimeType(normalized.mimeType);
      return;
    }

    // Fallback for browsers that can't do the above — better to upload
    // un-normalized than to block the flow entirely.
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      const base64 = result.split(",")[1];
      setImageBase64(base64);
      setImageMimeType(file.type);
    };
    reader.onerror = () => {
      setError("Failed to read image. Please try again.");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetImage(file);
    // Reset input so same file can be re-selected after removal
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSetImage(file);
    },
    [validateAndSetImage]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  /**
   * New V2 flow:
   * 1. Compute SHA-256 hash (still needed for later paid step)
   * 2. Store image + hash in sessionStorage
   * 3. Call /api/preview (free, no payment)
   * 4. Store the GlamPreview result in sessionStorage
   * 5. Navigate to /preview to display the free result
   */
  const handleGetPreview = async () => {
    if (!imageBase64 || !imageFile) return;
    setIsLoading(true);
    setLoadingStep("hashing");
    setError(null);

    // Falls back to the raw file's declared type only if normalization
    // failed client-side (see normalizeOrientation) — the server still
    // re-detects the real type from magic bytes regardless.
    const mimeType = imageMimeType ?? imageFile.type;

    try {
      // Compute SHA-256 — needed later when the user proceeds to paid checkout
      const imageHash = await computeImageHash(imageBase64);
      setLoadingStep("analyzing");

      // Persist image data across the navigation
      // (stays available when user clicks "$4.99" on the preview page)
      sessionStorage.setItem("glamai_image_base64", imageBase64);
      sessionStorage.setItem("glamai_image_mime", mimeType);
      sessionStorage.setItem("glamai_image_hash", imageHash);

      // Clear any stale data from a previous session
      sessionStorage.removeItem("glamai_preview");
      sessionStorage.removeItem("glamai_report");
      sessionStorage.removeItem("glamai_report_session_id");

      // Call the free preview API
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.preview) {
        if (data.rateLimited) {
          throw new Error("You've used all your free previews for this hour. Please try again later.");
        }
        throw new Error(data.error || "Preview failed. Please try again.");
      }

      // Cache the preview result
      sessionStorage.setItem("glamai_preview", JSON.stringify(data.preview));
      // Face Map data (local landmark detection, no AI cost) — stored
      // separately since it's returned alongside `preview`, not nested in it.
      sessionStorage.setItem("glamai_face_map", JSON.stringify(data.faceMap ?? []));
      if (data.imageWidth) sessionStorage.setItem("glamai_image_width", String(data.imageWidth));
      if (data.imageHeight) sessionStorage.setItem("glamai_image_height", String(data.imageHeight));

      // Navigate to the preview results page
      router.push("/preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const hasPhoto = !!imagePreview;
  const ctaDisabled = !hasPhoto || isLoading;
  const ctaBg = isLoading ? "#c8799a" : hasPhoto ? "#242024" : "#c9bfc4";
  const ctaLabel = isLoading
    ? loadingStep === "hashing"
      ? "Preparing your photo…"
      : "Finding your glam direction…"
    : "Get My Free Glam Preview";

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024", overflowX: "hidden" }}>

      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px clamp(20px,5vw,64px)",
          borderBottom: "1px solid #F1E6EA",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>
        <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "#c48a9a", margin: 0 }}>
          Free Preview
        </p>
      </nav>

      {/* Cancelled notice */}
      {showCancelled && (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
          <div
            className="animate-fade-in"
            style={{
              marginTop: "24px",
              padding: "16px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              color: "#92400E",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            Payment was cancelled. Your photo is still here — try again when you&apos;re ready.
          </div>
        </div>
      )}

      {/* Hero */}
      <section style={{ padding: "clamp(56px,9vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: "var(--font-cormorant)",
              fontWeight: 300,
              fontSize: "clamp(2.2rem,5vw,3.4rem)",
              lineHeight: 1.15,
              margin: "0 0 20px",
            }}
          >
            Upload your photo
          </h1>
          <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#777177", maxWidth: "520px", margin: "0 0 56px", fontWeight: 300 }}>
            A clear, well-lit photo gets you your personalized Glam Direction — completely free.
          </p>
        </div>
      </section>

      {/* Upload area */}
      <section style={{ padding: "0 clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

          {hasPhoto ? (
            <div className="animate-scale-in" style={{ maxWidth: "560px" }}>
              <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", aspectRatio: "4/3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview!}
                  alt="Your uploaded photo"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px" }}>
                <p style={{ fontSize: "14px", color: "#777177", margin: 0 }}>
                  {imageFile ? `Photo ready · ${(imageFile.size / 1024 / 1024).toFixed(2)} MB` : "Photo ready"}
                </p>
                <button
                  onClick={() => replaceInputRef.current?.click()}
                  style={{ background: "none", border: "none", fontSize: "13px", color: "#E88BA8", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)" }}
                >
                  Replace
                </button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Replace photo"
                />
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              aria-label="Upload photo"
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              style={{
                maxWidth: "640px",
                border: `1px dashed ${isDragging ? "#E88BA8" : "#E3C9D4"}`,
                borderRadius: "8px",
                padding: "clamp(56px,8vw,88px) 32px",
                textAlign: "center",
                cursor: "pointer",
                background: isDragging ? "#FFF4F7" : "#FDFAFB",
                transition: "all 0.2s ease",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Choose photo file"
              />
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#FCE7EF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                <div style={{ width: "22px", height: "22px", border: "2px solid #E88BA8", borderRadius: "4px" }} />
              </div>
              <p style={{ fontSize: "17px", fontWeight: 400, margin: "0 0 6px" }}>
                {isDragging ? "Drop your photo here" : "Drag & drop your photo"}
              </p>
              <p style={{ fontSize: "14px", color: "#777177", margin: "0 0 28px" }}>or click to browse your files</p>
              <span style={{ display: "inline-block", padding: "12px 28px", borderRadius: "9999px", background: "#242024", color: "#FFFFFF", fontSize: "14px", fontWeight: 600 }}>
                Choose Photo
              </span>
              <p style={{ fontSize: "12px", color: "#a49da2", margin: "24px 0 0" }}>JPG · PNG · WebP · Max 10MB</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="animate-fade-in"
              style={{
                maxWidth: "640px",
                marginTop: "16px",
                padding: "16px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                fontSize: "14px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#DC2626",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>{error}</span>
            </div>
          )}

          {/* CTA */}
          <div style={{ maxWidth: "640px", marginTop: "40px" }}>
            <button
              onClick={handleGetPreview}
              disabled={ctaDisabled}
              style={{
                width: "100%",
                height: "56px",
                borderRadius: "9999px",
                border: "none",
                background: ctaBg,
                color: "#FFFFFF",
                fontFamily: "var(--font-sans)",
                fontSize: "16px",
                fontWeight: 600,
                cursor: ctaDisabled ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {ctaLabel}
            </button>
            <p style={{ textAlign: "center", fontSize: "13px", color: "#a49da2", margin: "16px 0 0" }}>
              Free · No card required · Results in seconds
            </p>
          </div>
        </div>
      </section>

      {/* Editorial info: tips + what you get */}
      <section style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "clamp(48px,6vw,80px)" }}>

          <div>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 28px" }}>
              Photo Tips
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {PHOTO_TIPS.map((tip) => (
                <p key={tip} style={{ fontSize: "16px", lineHeight: 1.6, color: "#4a454a", margin: 0, fontWeight: 300, borderTop: "1px solid #F1E6EA", paddingTop: "18px" }}>
                  {tip}
                </p>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 28px" }}>
              Your Free Preview Includes
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {INCLUDES.map((item) => (
                <p key={item} style={{ fontSize: "16px", lineHeight: 1.6, color: "#4a454a", margin: 0, fontWeight: 300, borderTop: "1px solid #F1E6EA", paddingTop: "18px" }}>
                  {item}
                </p>
              ))}
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#a49da2", margin: "28px 0 0", fontStyle: "italic" }}>
              Unlocks after your free preview — a full Makeup Glow-Up transformation for $4.99.
            </p>
          </div>

        </div>
      </section>

      <footer style={{ padding: "32px clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "19px", fontWeight: 400, margin: 0 }}>Glam AI</p>
          <div style={{ display: "flex", gap: "28px" }}>
            <a href="/privacy" style={{ fontSize: "12px", color: "#777177" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "12px", color: "#777177" }}>Terms</a>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-[#777177]">Loading...</div>
      </div>
    }>
      <UploadPageInner />
    </Suspense>
  );
}
