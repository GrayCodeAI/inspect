import { describe, it, expect } from "vitest";
import { VisualDiff } from "./diff.js";
import type { RawImage } from "./diff.js";

function createSolidImage(width: number, height: number, r: number, g: number, b: number, a: number = 255): RawImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

describe("VisualDiff", () => {
  const diff = new VisualDiff();

  describe("compare identical images", () => {
    it("returns matched=true and 0% mismatch", () => {
      const img = createSolidImage(10, 10, 255, 0, 0);
      const result = diff.compare(img, img);
      expect(result.matched).toBe(true);
      expect(result.mismatchPercentage).toBe(0);
    });
  });

  describe("compare completely different images", () => {
    it("returns matched=false with high mismatch", () => {
      const red = createSolidImage(10, 10, 255, 0, 0);
      const blue = createSolidImage(10, 10, 0, 0, 255);
      const result = diff.compare(red, blue);
      expect(result.matched).toBe(false);
      expect(result.mismatchPercentage).toBeGreaterThan(50);
    });
  });

  describe("compare slightly different images", () => {
    it("detects small pixel changes", () => {
      const img1 = createSolidImage(10, 10, 128, 128, 128);
      const img2data = new Uint8Array(img1.data);
      // Change a block of pixels significantly (anti-aliasing detection needs contrast)
      for (let i = 0; i < 5; i++) {
        img2data[i * 4] = 255;
        img2data[i * 4 + 1] = 0;
        img2data[i * 4 + 2] = 0;
      }
      const img2: RawImage = { data: img2data, width: 10, height: 10 };
      const result = diff.compare(img1, img2, { antiAliasing: false });
      expect(result.mismatchPercentage).toBeGreaterThan(0);
    });
  });

  describe("threshold", () => {
    it("allows minor differences within threshold", () => {
      const img1 = createSolidImage(10, 10, 100, 100, 100);
      const img2 = createSolidImage(10, 10, 101, 100, 100);
      // With a high threshold, small color differences should pass
      const result = diff.compare(img1, img2, { threshold: 50 });
      expect(result.mismatchPercentage).toBe(0);
    });
  });

  describe("maxDiffPercentage", () => {
    it("matched=true when below maxDiffPercentage", () => {
      const img1 = createSolidImage(100, 100, 128, 128, 128);
      const img2data = new Uint8Array(img1.data);
      // Change 1 pixel out of 10000
      img2data[0] = 0;
      img2data[1] = 0;
      img2data[2] = 0;
      const img2: RawImage = { data: img2data, width: 100, height: 100 };
      const result = diff.compare(img1, img2, { maxDiffPercentage: 1 });
      expect(result.matched).toBe(true);
    });
  });

  describe("dimensions", () => {
    it("reports correct dimensions", () => {
      const img = createSolidImage(20, 30, 0, 0, 0);
      const result = diff.compare(img, img);
      expect(result.dimensions.width).toBe(20);
      expect(result.dimensions.height).toBe(30);
    });
  });
});
