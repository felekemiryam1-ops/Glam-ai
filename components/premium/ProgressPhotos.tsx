"use client";

/**
 * Progress Photos — Premium.
 * Reads/writes app/api/progress-photos. Zero AI calls — this component
 * never sends a photo anywhere except the upload endpoint above, and that
 * endpoint never analyzes it (see that route's header comment).
 */

import { useEffect, useRef, useState } from "react";
import { Plus, GitCompare } from "lucide-react";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";

interface Photo {
  id: string;
  imageUrl: string;
  note: string | null;
  takenAt: string;
}

export function ProgressPhotos() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchStartedRef = useRef(false);

  async function load() {
    const res = await fetch("/api/progress-photos");
    if (res.ok) {
      const data = await res.json();
      setPhotos(data.photos);
    }
  }

  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    load();
  }, []);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const b64 = result.split(",")[1];
          if (!b64) reject(new Error("Could not read file."));
          else resolve(b64);
        };
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/progress-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Upload failed. Please try again.");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  if (photos === null) return <p style={{ fontSize: "13px", color: MUTED }}>Loading…</p>;

  const compared = compareIds.map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {compared.length === 2 && (
        <div style={{ marginBottom: "18px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, margin: "0 0 8px" }}>
            Comparing
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            {compared
              .slice()
              .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
              .map((p) => (
                <div key={p.id} style={{ flex: 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="Progress photo" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: "10px" }} />
                  <p style={{ fontSize: "11px", color: MUTED, margin: "4px 0 0" }}>{new Date(p.takenAt).toLocaleDateString()}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(76px,1fr))", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            aspectRatio: "3/4",
            borderRadius: "10px",
            border: `1.5px dashed ${BORDER}`,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: uploading ? "default" : "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <Plus size={18} style={{ color: PINK }} />
        </button>
        {photos.map((p) => {
          const selected = compareIds.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggleCompare(p.id)}
              style={{
                position: "relative",
                aspectRatio: "3/4",
                borderRadius: "10px",
                overflow: "hidden",
                padding: 0,
                border: selected ? `2px solid ${PINK}` : "2px solid transparent",
                cursor: "pointer",
                background: "none",
              }}
              title={new Date(p.takenAt).toLocaleDateString()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt="Progress photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          );
        })}
      </div>

      {photos.length >= 2 && (
        <p style={{ fontSize: "11.5px", color: MUTED, display: "flex", alignItems: "center", gap: "5px", margin: "0 0 8px" }}>
          <GitCompare size={12} />
          Tap two photos to compare
        </p>
      )}
      {error && <p style={{ fontSize: "12.5px", color: "#C4487A", margin: 0 }}>{error}</p>}
      {uploading && <p style={{ fontSize: "12.5px", color: INK, margin: 0 }}>Uploading…</p>}
    </div>
  );
}
