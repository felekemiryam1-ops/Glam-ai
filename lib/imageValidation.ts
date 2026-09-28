/**
 * Server-side image validation.
 *
 * Validates actual image bytes (magic bytes) rather than trusting
 * the MIME type supplied by the browser.
 */

import { createHash } from "crypto";

export interface ImageValidationResult {
  valid: boolean;
  detectedType?: "image/jpeg" | "image/png" | "image/webp";
  error?: string;
}

/**
 * Validate a base64-encoded image by checking magic bytes (file signature).
 * Call this on the server before passing any image to the AI.
 */
export function validateImageBytes(base64: string): ImageValidationResult {
  if (!base64 || typeof base64 !== "string") {
    return { valid: false, error: "No image data provided." };
  }

  // Decode just the first 16 bytes — enough to read any magic header.
  // Base64: every 4 chars = 3 bytes, so 24 chars gives us 18 bytes.
  const headerB64 = base64.slice(0, 24);
  let headerBytes: Buffer;
  try {
    headerBytes = Buffer.from(headerB64, "base64");
  } catch {
    return { valid: false, error: "Image data could not be decoded." };
  }

  if (headerBytes.length < 12) {
    return { valid: false, error: "Image data is too short to be valid." };
  }

  // JPEG: FF D8 FF
  if (headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff) {
    return { valid: true, detectedType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A  (all 8 signature bytes)
  if (
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47 &&
    headerBytes[4] === 0x0d &&
    headerBytes[5] === 0x0a &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0x0a
  ) {
    return { valid: true, detectedType: "image/png" };
  }

  // WebP: bytes 0–3 are "RIFF", bytes 8–11 are "WEBP"
  if (
    headerBytes[0] === 0x52 && // R
    headerBytes[1] === 0x49 && // I
    headerBytes[2] === 0x46 && // F
    headerBytes[3] === 0x46 && // F
    headerBytes[8] === 0x57 && // W
    headerBytes[9] === 0x45 && // E
    headerBytes[10] === 0x42 && // B
    headerBytes[11] === 0x50    // P
  ) {
    return { valid: true, detectedType: "image/webp" };
  }

  return {
    valid: false,
    error:
      "Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
  };
}

/**
 * Compute SHA-256 of a base64 string server-side (Node.js crypto).
 * Returns a lowercase hex digest.
 */
export function computeSha256Server(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}
