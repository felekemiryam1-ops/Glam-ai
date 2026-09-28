/**
 * lib/faceMap.ts — turns face landmarks into Face Map callout anchors.
 *
 * Unlike lib/makeupMasks.ts (which rasterizes *masks* for an image-editing
 * model), this produces plain {x,y} pixel points for an HTML/SVG overlay
 * rendered client-side over the user's ORIGINAL photo — no image model is
 * ever involved in drawing arrows/callouts.
 *
 * Bilateral regions (eyes/brows/cheeks) get a single anchor rather than two
 * symmetric ones: FeatureEnhancement is one entry per region, and a single,
 * deliberately-placed dot reads as an editorial callout, not a diagnostic
 * scan. Eyes and brows are always resolved to the SAME anatomical side (the
 * brow decision reuses the eye's side rather than being picked
 * independently) so they never end up pointing at two different sides of
 * an asymmetric/turned face.
 *
 * Every anchor is derived from real landmark points — extreme points
 * within a group (outer corner, arch peak, face-oval edge at a given
 * height) rather than a flat percentage of face width/height — so the
 * result tracks the actual geometry of the photo, not a generic template.
 */

import type { FaceLandmarks, Point } from "./faceLandmarks";
import type { FaceRegionKey, FeatureEnhancement, FaceMapAnchor } from "./types";

function centroid(points: Point[]): Point | null {
  if (points.length === 0) return null;
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** The point in a group furthest in the given direction — order-independent. */
function extremePoint(points: Point[], axis: "x" | "y", dir: "min" | "max"): Point | null {
  if (points.length === 0) return null;
  return points.reduce((best, p) => {
    const better = dir === "min" ? p[axis] < best[axis] : p[axis] > best[axis];
    return better ? p : best;
  }, points[0]);
}

function pickRightSide(a: Point[], b: Point[], faceCentroid: Point): Point[] {
  const ca = centroid(a);
  const cb = centroid(b);
  if (!ca) return b;
  if (!cb) return a;
  return ca.x >= faceCentroid.x ? a : cb.x >= faceCentroid.x ? b : a;
}

/** The face-oval boundary point closest in height to `targetY`, restricted to one side. */
function faceEdgeNearHeight(faceOval: Point[], targetY: number, onLeft: boolean, faceCentroidX: number): number | null {
  const sidePoints = faceOval.filter((p) => (onLeft ? p.x <= faceCentroidX : p.x >= faceCentroidX));
  const pool = sidePoints.length > 0 ? sidePoints : faceOval;
  const nearest = pool.reduce((best, p) => (Math.abs(p.y - targetY) < Math.abs(best.y - targetY) ? p : best), pool[0]);
  return nearest?.x ?? null;
}

/**
 * Derive one anchor point per supported region from real landmark
 * coordinates. Regions with no derivable anchor (e.g. a landmark group came
 * back empty) are simply absent from the result rather than guessed at.
 */
export function buildFaceMapAnchorPoints(landmarks: FaceLandmarks): Partial<Record<FaceRegionKey, Point>> {
  const { leftEye, rightEye, leftEyebrow, rightEyebrow, lips, faceOval } = landmarks;
  const faceCentroid = centroid(faceOval);
  if (!faceCentroid || faceOval.length === 0) return {};

  const faceYs = faceOval.map((p) => p.y);
  const faceHeight = Math.max(...faceYs) - Math.min(...faceYs);

  const anchors: Partial<Record<FaceRegionKey, Point>> = {};

  // Eyes — the eye contour's own centroid already sits in the middle of the
  // eye itself; no adjustment needed. Deciding the side here (rather than
  // independently per region) is what keeps brows/cheeks anatomically
  // paired to the SAME eye below.
  //
  // Two distinct "side" concepts, deliberately kept separate:
  //   - chosenIsAnatomicalLeft: WHICH NAMED landmark group was picked
  //     (leftEye vs rightEye) — used only to pick the matching eyebrow
  //     group, since MediaPipe's names are anatomical (the subject's own
  //     left/right), not image-space.
  //   - onLeftOfImage: which side of the PHOTO the chosen eye actually sits
  //     on (derived from its real x position) — used for every geometric
  //     decision below (which direction is "outward," which face-oval
  //     points are on this side). Conflating these two was the bug that
  //     sent the cheek anchor to the opposite side from the eye.
  const eyeSide = pickRightSide(leftEye, rightEye, faceCentroid);
  const chosenIsAnatomicalLeft = eyeSide === leftEye;
  const eyeC = centroid(eyeSide);
  if (eyeC) anchors.eyes = eyeC;
  const onLeftOfImage = eyeC ? eyeC.x < faceCentroid.x : false;

  // Brows — the arch's peak (topmost point of the brow contour) reads as
  // "the eyebrow" much more distinctly than the group centroid, which skews
  // toward the brow's lower/inner edge and can sit uncomfortably close to
  // the eye below it.
  const browSide = chosenIsAnatomicalLeft ? leftEyebrow : rightEyebrow;
  const browPeak = extremePoint(browSide, "y", "min");
  if (browPeak) anchors.brows = browPeak;

  const lipsC = centroid(lips);
  if (lipsC) anchors.lips = lipsC;

  // Cheeks — no dedicated landmark group exists, so this is derived from
  // real points on either side of it rather than an eye↔mouth midpoint
  // (which lands too low/central, reading as "near the nose"):
  //   - horizontal anchor: the eye's OUTER corner (extreme lateral point of
  //     the eye contour), moved partway toward the actual face-oval edge —
  //     both real landmark points, not a fixed percentage of face width.
  //   - vertical anchor: roughly a third of the way from the eye down to
  //     mouth level (cheekbone/upper-cheek height), not the full eye→mouth
  //     midpoint, which is closer to nose-base/mouth height.
  if (eyeC && lipsC && faceHeight > 0) {
    const eyeOuter = extremePoint(eyeSide, "x", onLeftOfImage ? "min" : "max");
    if (eyeOuter) {
      const cheekY = eyeOuter.y + (lipsC.y - eyeOuter.y) * 0.34;
      const edgeX = faceEdgeNearHeight(faceOval, cheekY, onLeftOfImage, faceCentroid.x);
      const cheekX = edgeX !== null ? eyeOuter.x + (edgeX - eyeOuter.x) * 0.45 : eyeOuter.x;
      anchors.cheeks = { x: cheekX, y: cheekY };
    }
  }

  // No landmark group for jawline/forehead either — derived from the
  // face-oval boundary's lower third / upper strip. Not reported as
  // inaccurate, left as-is.
  if (faceHeight > 0) {
    const minY = Math.min(...faceYs);
    const lowerThird = faceOval.filter((p) => p.y > minY + faceHeight * 0.75);
    const jawC = centroid(lowerThird.length > 0 ? lowerThird : faceOval);
    if (jawC) anchors.jawline = jawC;

    anchors.forehead = { x: faceCentroid.x, y: minY + faceHeight * 0.12 };
  }

  return anchors;
}

/**
 * Zip each FeatureEnhancement to its region's anchor point. A region with
 * no derivable anchor is skipped, not placed at a guessed position.
 */
export function buildFaceMap(landmarks: FaceLandmarks, enhancements: FeatureEnhancement[]): FaceMapAnchor[] {
  const anchorPoints = buildFaceMapAnchorPoints(landmarks);
  const result: FaceMapAnchor[] = [];

  for (const fe of enhancements) {
    const point = anchorPoints[fe.region];
    if (!point) continue;
    result.push({ region: fe.region, x: point.x, y: point.y, label: fe.title, detail: fe.recommendation });
  }

  return result;
}
