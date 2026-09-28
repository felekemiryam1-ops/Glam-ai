/**
 * lib/faceLandmarks.ts — server-side face landmark detection
 *
 * Uses Google's official @tensorflow-models/face-landmarks-detection (the
 * MediaPipe FaceMesh model) running on the pure-JS/WASM `tfjs` runtime —
 * NOT the browser-only `mediapipe` runtime, which needs a DOM/canvas that
 * doesn't exist in a Next.js API route. The `tfjs` runtime accepts a raw
 * tf.Tensor3D directly, so no headless browser or DOM polyfill is needed.
 *
 * This gives 478 3D landmarks per face, with named sub-groups for the
 * regions we need for masking: lips, leftEye/rightEye, leftEyebrow/
 * rightEyebrow, leftIris/rightIris, and faceOval.
 */

import "@tensorflow/tfjs-backend-cpu";
import * as tf from "@tensorflow/tfjs";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import sharp from "sharp";

export interface Point {
  x: number;
  y: number;
}

export interface FaceLandmarks {
  leftEye: Point[];
  rightEye: Point[];
  leftEyebrow: Point[];
  rightEyebrow: Point[];
  leftIris: Point[];
  rightIris: Point[];
  lips: Point[];
  faceOval: Point[];
  width: number;
  height: number;
}

type Detector = Awaited<ReturnType<typeof faceLandmarksDetection.createDetector>>;

// The model is loaded once per server process (cold start) and reused
// across requests — creating it is relatively expensive (~1-2s).
let detectorPromise: Promise<Detector> | null = null;

async function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.setBackend("cpu");
      await tf.ready();
      return faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        { runtime: "tfjs", refineLandmarks: true, maxFaces: 1 }
      );
    })();
  }
  return detectorPromise;
}

/**
 * Detect face landmarks in an image buffer (any format sharp can decode).
 * Throws if no face is detected — the caller should fail the generation
 * with a clear "no face detected" error rather than silently skipping
 * masking.
 */
export async function detectFaceLandmarks(imageBuffer: Buffer): Promise<FaceLandmarks> {
  const detector = await getDetector();

  const { data, info } = await sharp(imageBuffer)
    .rotate() // apply EXIF orientation before we read raw pixels
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);

  let faces: Awaited<ReturnType<Detector["estimateFaces"]>>;
  try {
    faces = await detector.estimateFaces(tensor, { flipHorizontal: false });
  } finally {
    tensor.dispose();
  }

  if (!faces.length) {
    throw new Error("No face detected in the uploaded photo");
  }

  const kps = faces[0].keypoints;
  const group = (name: string): Point[] =>
    kps.filter((k) => k.name === name).map((k) => ({ x: k.x, y: k.y }));

  return {
    leftEye: group("leftEye"),
    rightEye: group("rightEye"),
    leftEyebrow: group("leftEyebrow"),
    rightEyebrow: group("rightEyebrow"),
    leftIris: group("leftIris"),
    rightIris: group("rightIris"),
    lips: group("lips"),
    faceOval: group("faceOval"),
    width: info.width,
    height: info.height,
  };
}
