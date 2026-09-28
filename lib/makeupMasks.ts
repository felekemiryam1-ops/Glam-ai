/**
 * lib/makeupMasks.ts — build makeup region masks from face landmarks
 *
 * Converts the labeled landmark groups from lib/faceLandmarks.ts into
 * black/white PNG masks. Originally built for FLUX Fill (fal-ai/flux-pro/v1/fill,
 * which only edits pixels inside a mask's white region) — that generative
 * masked-editing path was tried and reverted (see lib/imageGen.ts's header)
 * because Fill's output quality was inconsistent. The masks themselves were
 * always reliable; only the generative fill step was the problem. Masks are
 * built as SVG polygons (rendered via sharp/libvips — no canvas dependency
 * needed) and then Gaussian-blurred so edited regions blend in rather than
 * showing a hard cutout edge.
 *
 * Regions:
 *   - eyes:   convex hull of (eye contour ∪ eyebrow), expanded slightly,
 *             with the iris punched out as a hole so the eyeball itself
 *             is never regenerated — only eyelid/socket skin.
 *   - lips:   convex hull of the lips contour.
 *   - cheeks: a soft ellipse per side anchored between the eye's outer
 *             corner, the mouth corner, and the face-oval boundary —
 *             there's no dedicated "cheek" landmark group, so this is
 *             built geometrically from groups we do have, deliberately
 *             kept soft/diffuse since real blush placement is not a hard
 *             anatomical boundary either.
 *
 * The `cheeks` mask is now actually in use — buildColorOverlay() (below)
 * turns it into a deterministic alpha-composited blush layer, applied
 * directly by lib/imageGen.ts rather than through a second generative call.
 */

import sharp from "sharp";
import type { FaceLandmarks, Point } from "./faceLandmarks";

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Standard monotone-chain convex hull. Input order doesn't matter. */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function centroid(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** Scale a polygon outward/inward from its own centroid by `factor`. */
function expandFromCentroid(points: Point[], factor: number): Point[] {
  const c = centroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

function pathD(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(1)},${first.y.toFixed(1)} ${rest
    .map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")} Z`;
}

/** A soft ellipse polygon (approximated as an N-gon) for the cheek region. */
function ellipsePolygon(cx: number, cy: number, rx: number, ry: number, segments = 24): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
  }
  return pts;
}

// ── Mask rasterization ──────────────────────────────────────────────────────

/**
 * Render one or more filled subpaths (with holes cut via evenodd) to a
 * blurred black/white PNG mask matching the source image dimensions.
 */
async function rasterizeMask(
  subpaths: string[],
  width: number,
  height: number,
  blurPx: number
): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="black"/>
    <path fill-rule="evenodd" fill="white" d="${subpaths.join(" ")}"/>
  </svg>`;

  let img = sharp(Buffer.from(svg)).ensureAlpha().flatten({ background: "black" }).grayscale();
  if (blurPx > 0) {
    img = img.blur(blurPx);
  }
  return img.png().toBuffer();
}

// ── Region mask builders ────────────────────────────────────────────────────

const EYE_MASK_BLUR = 6; // px — soft feather so the edit blends at the boundary
const LIP_MASK_BLUR = 3; // lips need a tighter edge — less feather
const CHEEK_MASK_BLUR = 16; // blush is inherently soft/diffuse — heavy feather; wide enough that raising peak opacity doesn't read as a harder edge

export interface RegionMasks {
  eyes: Buffer;
  cheeks: Buffer;
  lips: Buffer;
}

export async function buildRegionMasks(landmarks: FaceLandmarks): Promise<RegionMasks> {
  const { width, height, leftEye, rightEye, leftEyebrow, rightEyebrow, leftIris, rightIris, lips, faceOval } =
    landmarks;

  // ── Eyes: (eye ∪ eyebrow) hull, expanded, minus iris holes ──────────────
  const leftEyeOuter = expandFromCentroid(convexHull([...leftEye, ...leftEyebrow]), 1.12);
  const rightEyeOuter = expandFromCentroid(convexHull([...rightEye, ...rightEyebrow]), 1.12);
  const leftIrisHole = leftIris.length >= 3 ? expandFromCentroid(convexHull(leftIris), 1.4) : [];
  const rightIrisHole = rightIris.length >= 3 ? expandFromCentroid(convexHull(rightIris), 1.4) : [];

  const eyesMask = await rasterizeMask(
    [pathD(leftEyeOuter), pathD(leftIrisHole), pathD(rightEyeOuter), pathD(rightIrisHole)],
    width,
    height,
    EYE_MASK_BLUR
  );

  // ── Lips: hull of the lips contour ───────────────────────────────────────
  const lipsHull = convexHull(lips);
  const lipsMask = await rasterizeMask([pathD(lipsHull)], width, height, LIP_MASK_BLUR);

  // ── Cheeks: soft ellipse anchored between eye outer-corner, mouth ───────
  // corner, and the face-oval boundary — there's no dedicated landmark
  // group for "cheek," so this is built geometrically from groups we do
  // have. Kept generous + heavily blurred since blush placement is soft
  // by nature, not a hard anatomical region.
  const faceCentroid = centroid(faceOval);
  const faceWidth = Math.max(...faceOval.map((p) => p.x)) - Math.min(...faceOval.map((p) => p.x));

  // `imageSide` is determined by actual pixel position (not the semantic
  // "subject's left/right" landmark naming), so the outward offset always
  // pushes toward the correct temple regardless of naming convention.
  function cheekEllipse(eyeGroup: Point[]): Point[] {
    const eyeC = centroid(eyeGroup);
    const imageSide: "left" | "right" = eyeC.x < faceCentroid.x ? "left" : "right";
    const mouthCorner =
      imageSide === "left"
        ? lips.reduce((a, b) => (a.x < b.x ? a : b)) // leftmost lip point
        : lips.reduce((a, b) => (a.x > b.x ? a : b)); // rightmost lip point
    const cx = (eyeC.x + mouthCorner.x) / 2 + (imageSide === "left" ? -1 : 1) * faceWidth * 0.13;
    const cy = (eyeC.y + mouthCorner.y) / 2 + faceWidth * 0.06;
    const rx = faceWidth * 0.075;
    const ry = Math.abs(mouthCorner.y - eyeC.y) * 0.28 + faceWidth * 0.02;
    return ellipsePolygon(cx, cy, rx, ry);
  }

  const leftCheek = cheekEllipse(leftEye);
  const rightCheek = cheekEllipse(rightEye);

  const cheeksMask = await rasterizeMask(
    [pathD(leftCheek), pathD(rightCheek)],
    width,
    height,
    CHEEK_MASK_BLUR
  );

  return { eyes: eyesMask, cheeks: cheeksMask, lips: lipsMask };
}

// ── Deterministic chroma tint (blush compositing) ───────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Shortest-arc hue interpolation — handles the 0°/360° wraparound correctly. */
function lerpHueDeg(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (((a + diff * t) % 360) + 360) % 360;
}

/**
 * Applies `hex` as a color/chroma tint to `baseImage`, through
 * `grayscaleMask` (e.g. RegionMasks.cheeks), preserving the base image's own
 * lightness — and therefore all skin texture, pores, and shading — exactly,
 * pixel for pixel, at every strength.
 *
 * This replaced an earlier flat-RGBA alpha-composite approach: blending
 * every masked pixel toward one constant flat color (varying only opacity)
 * compresses that region's natural luminance variation relative to the
 * untouched skin around it — which is what reads as a "painted patch"
 * rather than a real cosmetic tint, no matter how low the opacity. Real
 * blush shifts hue/saturation; it doesn't touch the skin's own light/shadow
 * pattern. So here, only H and S move toward the blush color's H and S,
 * blended in by the mask's own feathered value scaled to `peakStrength`
 * (0 at the feathered edge, up to peakStrength at the mask's most solid
 * point) — L always comes directly from the original pixel, completely
 * untouched, regardless of strength. Unmasked pixels (mask value 0) are
 * left byte-identical.
 *
 * Still deterministic, not generative — for the same reason a plain alpha
 * composite was chosen originally: isolated prompt tests proved Kontext
 * cannot reliably control translucency via text, so this stays entirely in
 * our own, exactly-controllable image processing.
 */

// How much the saturation TARGET is pushed above the blush hex's own raw
// saturation. Locked at 1.0 (no boost) — the recommended color's exact own
// saturation is used, unmodified. A boosted value (tried at 1.7×) visibly
// overshot into an artificial/oversaturated look on a real photo; getting
// blush more visible is handled via mask strength/coverage instead (see
// BLUSH_PEAK_STRENGTH in lib/imageGen.ts), not by inflating the color.
const SATURATION_BOOST = 1.0;

export async function applyChromaTint(
  baseImage: Buffer,
  grayscaleMask: Buffer,
  hex: string,
  peakStrength: number
): Promise<Buffer> {
  const { data: base, info } = await sharp(baseImage).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const { data: mask, info: maskInfo } = await sharp(grayscaleMask)
    .resize(width, height)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const clean = hex.replace("#", "");
  const blushR = parseInt(clean.slice(0, 2), 16);
  const blushG = parseInt(clean.slice(2, 4), 16);
  const blushB = parseInt(clean.slice(4, 6), 16);
  const [blushH, blushS] = rgbToHsl(blushR, blushG, blushB);
  // The saturation TARGET is the hex's own raw saturation (SATURATION_BOOST
  // is locked at 1.0 — see its own comment for why). Hue and saturation
  // both target the recommended color's exact HSL values; only how far
  // toward them each pixel moves is controlled, by `strength` below.
  const targetS = Math.min(1, blushS * SATURATION_BOOST);

  const out = Buffer.from(base);
  for (let i = 0; i < width * height; i++) {
    const maskGray = mask[i * maskInfo.channels];
    if (maskGray === 0) continue;

    const strength = (maskGray / 255) * peakStrength;
    const idx = i * channels;
    const [h, s, l] = rgbToHsl(out[idx], out[idx + 1], out[idx + 2]);
    const [r2, g2, b2] = hslToRgb(lerpHueDeg(h, blushH, strength), s + (targetS - s) * strength, l);
    out[idx] = r2;
    out[idx + 1] = g2;
    out[idx + 2] = b2;
  }

  return sharp(out, { raw: { width, height, channels } }).jpeg({ quality: 92 }).toBuffer();
}
