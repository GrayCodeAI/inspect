import { describe, it, expect } from "vitest";
import { ElementMasking, DEFAULT_MASK_SELECTORS } from "./masking.js";
import type { RawImage } from "./diff.js";

function createImage(width: number, height: number, fillR = 255, fillG = 255, fillB = 255): RawImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fillR;
    data[i * 4 + 1] = fillG;
    data[i * 4 + 2] = fillB;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe("ElementMasking", () => {
  const masking = new ElementMasking();

  describe("DEFAULT_MASK_SELECTORS", () => {
    it("has common dynamic element selectors", () => {
      expect(DEFAULT_MASK_SELECTORS.length).toBeGreaterThan(0);
      expect(DEFAULT_MASK_SELECTORS.some((s) => s.includes("time"))).toBe(true);
    });
  });

  describe("maskRegions", () => {
    it("masks a region within the image", () => {
      const img = createImage(10, 10, 255, 255, 255);
      const result = masking.maskRegions(img, [
        { x: 2, y: 2, width: 3, height: 3 },
      ]);
      // Masked pixels should differ from the original white
      const idx = (2 * 10 + 2) * 4;
      // At least the red channel should change from 255 to the mask color
      expect(result.data[idx] !== 255 || result.data[idx + 1] !== 255 || result.data[idx + 2] !== 255).toBe(true);
    });

    it("returns unchanged image for empty regions", () => {
      const img = createImage(5, 5, 100, 100, 100);
      const result = masking.maskRegions(img, []);
      expect(result.data).toEqual(img.data);
    });

    it("clamps regions to image bounds", () => {
      const img = createImage(5, 5, 200, 200, 200);
      // Region extends beyond image
      const result = masking.maskRegions(img, [
        { x: 3, y: 3, width: 10, height: 10 },
      ]);
      expect(result.width).toBe(5);
      expect(result.height).toBe(5);
    });

    it("preserves image dimensions", () => {
      const img = createImage(20, 15, 0, 0, 0);
      const result = masking.maskRegions(img, [
        { x: 0, y: 0, width: 5, height: 5 },
      ]);
      expect(result.width).toBe(20);
      expect(result.height).toBe(15);
    });
  });
});
