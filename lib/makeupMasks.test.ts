import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { applyChromaTint } from "./makeupMasks";

// applyChromaTint is the deterministic (non-generative) piece of the blush
// pipeline. Its core guarantee — the reason it replaced an earlier flat
// alpha-composite approach that read as a painted patch — is that
// LIGHTNESS is never touched, at any strength: only hue/saturation move
// toward the blush color. These tests verify that guarantee directly
// against synthetic images, without needing a real face or landmarks.
//
// Images are built in 8x8-pixel blocks (JPEG's minimum coding unit) with a
// distinct flat color/mask value per block, sampling each block's center
// pixel — small enough for a fast test, large enough that JPEG's DCT
// quantization doesn't blur one block's result into its neighbor's.

const BLOCK = 8;
const CENTER = Math.floor(BLOCK / 2);

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

/** Builds a `blocks.length`×1 grid of BLOCK×BLOCK tiles, one flat RGB color each. */
async function makeBlockImage(blocks: Array<[number, number, number]>): Promise<Buffer> {
  const width = BLOCK * blocks.length;
  const height = BLOCK;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = blocks[Math.floor(x / BLOCK)];
      const i = (y * width + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

/** Builds a matching `blocks.length`×1 grid of BLOCK×BLOCK grayscale mask tiles. */
async function makeBlockMask(values: number[]): Promise<Buffer> {
  const width = BLOCK * values.length;
  const height = BLOCK;
  const raw = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw[y * width + x] = values[Math.floor(x / BLOCK)];
    }
  }
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function readBlockCenterRgb(jpeg: Buffer, blockIndex: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const x = blockIndex * BLOCK + CENTER;
  const y = CENTER;
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("applyChromaTint", () => {
  it("leaves unmasked blocks (mask value 0) untouched", async () => {
    const base = await makeBlockImage([[180, 140, 120]]); // a skin-ish tone
    const mask = await makeBlockMask([0]);
    const tinted = await applyChromaTint(base, mask, "#E5CABE", 0.4);
    const [r, g, b] = await readBlockCenterRgb(tinted, 0);
    expect(Math.abs(r - 180)).toBeLessThan(2);
    expect(Math.abs(g - 140)).toBeLessThan(2);
    expect(Math.abs(b - 120)).toBeLessThan(2);
  });

  it("preserves lightness exactly at a fully-masked block, regardless of strength — this is the actual fix", async () => {
    const base = await makeBlockImage([[210, 150, 130]]);
    const mask = await makeBlockMask([255]);
    const [, , originalL] = rgbToHsl(210, 150, 130);

    for (const strength of [0.1, 0.3, 0.5, 0.8]) {
      const tinted = await applyChromaTint(base, mask, "#8B4A6B", strength); // a very different hue
      const [r, g, b] = await readBlockCenterRgb(tinted, 0);
      const [, , tintedL] = rgbToHsl(r, g, b);
      expect(Math.abs(tintedL - originalL)).toBeLessThan(0.02);
    }
  });

  it("shifts hue toward the blush color, more so at higher strength", async () => {
    const base = await makeBlockImage([[200, 180, 170]]); // a fairly neutral warm tone
    const mask = await makeBlockMask([255]);
    const blushHex = "#E85A8A"; // a distinctly pink/rose hue, far from the base
    const [blushH] = rgbToHsl(0xe8, 0x5a, 0x8a);

    const low = await applyChromaTint(base, mask, blushHex, 0.15);
    const high = await applyChromaTint(base, mask, blushHex, 0.6);
    const [lowH] = rgbToHsl(...(await readBlockCenterRgb(low, 0)));
    const [highH] = rgbToHsl(...(await readBlockCenterRgb(high, 0)));

    expect(hueDistance(highH, blushH)).toBeLessThan(hueDistance(lowH, blushH));
  });

  it("a weaker mask value produces a proportionally smaller shift than a stronger one, at the same peak strength", async () => {
    const base = await makeBlockImage([[200, 180, 170], [200, 180, 170]]);
    const mask = await makeBlockMask([128, 255]); // half-strength block, full-strength block
    const blushHex = "#E85A8A";
    const [blushH] = rgbToHsl(0xe8, 0x5a, 0x8a);

    const tinted = await applyChromaTint(base, mask, blushHex, 0.5);
    const [hHalf] = rgbToHsl(...(await readBlockCenterRgb(tinted, 0)));
    const [hFull] = rgbToHsl(...(await readBlockCenterRgb(tinted, 1)));

    expect(hueDistance(hFull, blushH)).toBeLessThan(hueDistance(hHalf, blushH));
  });

  it("saturation converges toward the blush hex's own exact raw saturation — never inflated beyond it (SATURATION_BOOST locked at 1.0)", async () => {
    // A saturation boost above the hex's own raw value was tried (1.7x) and
    // visibly overshot into an artificial/oversaturated look on a real
    // photo. The color must render at its own true saturation — visibility
    // is a mask-strength/coverage concern, not a color-inflation one — so at
    // high strength, the result should land very close to the hex's own raw
    // saturation, and never exceed it by a meaningful margin.
    const blushHex = "#D5BDB1"; // low-saturation dusty peach, same family as real derived blush colors
    const [, blushRawS] = rgbToHsl(0xd5, 0xbd, 0xb1);
    const base = await makeBlockImage([[190, 165, 150]]); // skin already close in hue/saturation to the blush
    const mask = await makeBlockMask([255]);

    const tinted = await applyChromaTint(base, mask, blushHex, 0.95); // near-full strength
    const [, resultS] = rgbToHsl(...(await readBlockCenterRgb(tinted, 0)));

    expect(resultS).toBeLessThanOrEqual(blushRawS + 0.02); // small JPEG-rounding tolerance, never truly exceeded
    expect(Math.abs(resultS - blushRawS)).toBeLessThan(0.05); // converges close to the hex's true saturation
  });
});
