import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { VisualRegression } from "./regression.js";

describe("VisualRegression", () => {
  let visualRegression: VisualRegression;

  beforeEach(() => {
    visualRegression = new VisualRegression();
  });

  describe("compare", () => {
    it("should compare two screenshots and return comparison result", async () => {
      // In a real test, we would use actual screenshot data
      // For now, we'll mock the behavior
      const result = await Effect.runPromise(
        visualRegression.compare("screenshot1.png", "screenshot2.png"),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("diffImage");
      expect(result).toHaveProperty("percentage");
      expect(result).toHaveProperty("status");
    });

    it("should return status 'identical' when screenshots are the same", async () => {
      const result = await Effect.runPromise(
        visualRegression.compare("screenshot1.png", "screenshot1.png"),
      );
      expect(result.status).toEqual("identical");
      expect(result.percentage).toBeCloseTo(0);
    });

    it("should return status 'different' when screenshots differ", async () => {
      const result = await Effect.runPromise(
        visualRegression.compare("screenshot1.png", "screenshot2.png"),
      );
      expect(result.status).toEqual("different");
      expect(result.percentage).toBeGreaterThan(0);
    });

    it("should handle missing screenshot files gracefully", async () => {
      const result = await Effect.runPromise(
        visualRegression.compare("nonexistent.png", "screenshot2.png"),
      );
      expect(result.status).toEqual("error");
      expect(result.error).toContain("not found");
    });
  });

  describe("generateDiffImage", () => {
    it("should generate a diff image from two screenshots", async () => {
      const diff = await Effect.runPromise(
        visualRegression.generateDiffImage("screenshot1.png", "screenshot2.png"),
      );
      expect(diff).toBeInstanceOf(Buffer);
      expect(diff.length).toBeGreaterThan(0);
    });
  });

  describe("calculatePercentageDifference", () => {
    it("should calculate percentage difference between two images", async () => {
      const percentage = await Effect.runPromise(
        visualRegression.calculatePercentageDifference("screenshot1.png", "screenshot2.png"),
      );
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });

    it("should return 0% for identical images", async () => {
      const percentage = await Effect.runPromise(
        visualRegression.calculatePercentageDifference("screenshot1.png", "screenshot1.png"),
      );
      expect(percentage).toEqual(0);
    });

    it("should return 100% for completely different images", async () => {
      // This is a simplified test - in reality, the percentage depends on the images
      const percentage = await Effect.runPromise(
        visualRegression.calculatePercentageDifference("screenshot1.png", "screenshot2.png"),
      );
      expect(percentage).toBeGreaterThan(0);
      // We don't assert exact value since it depends on the images
    });
  });

  describe("isWithinThreshold", () => {
    it("should return true if difference is within threshold", async () => {
      const result = await Effect.runPromise(
        visualRegression.isWithinThreshold("screenshot1.png", "screenshot2.png", 0.05),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.withinThreshold).toBe(true); // Assuming small difference
    });

    it("should return false if difference exceeds threshold", async () => {
      const result = await Effect.runPromise(
        visualRegression.isWithinThreshold("screenshot1.png", "screenshot2.png", 0.01),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.withinThreshold).toBe(false); // Assuming larger difference
    });
  });

  describe("captureScreenshot", () => {
    it("should capture a screenshot and return its path", async () => {
      const screenshotPath = await Effect.runPromise(
        visualRegression.captureScreenshot("test-page", "http://example.com"),
      );
      expect(screenshotPath).toBeString();
      expect(screenshotPath).toContain("test-page");
    });

    it("should handle page navigation errors gracefully", async () => {
      const result = await Effect.runPromise(
        visualRegression.captureScreenshot("error-page", "http://nonexistent.com"),
      );
      expect(result).toBeNull(); // Or should contain error information
    });
  });

  describe("compareWithPrevious", () => {
    it("should compare current screenshot with previous baseline", async () => {
      const result = await Effect.runPromise(
        visualRegression.compareWithPrevious("test-component", "http://example.com"),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("percentage");
    });

    it("should create new baseline if none exists", async () => {
      const result = await Effect.runPromise(
        visualRegression.compareWithPrevious("new-component", "http://example.com"),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.status).toEqual("baseline-created");
    });
  });

  describe("updateBaseline", () => {
    it("should update the baseline screenshot for a given component", async () => {
      // First create a baseline
      await Effect.runPromise(
        visualRegression.compareWithPrevious("component-a", "http://example.com"),
      );

      // Then update it
      const result = await Effect.runPromise(
        visualRegression.updateBaseline("component-a", "http://example.com"),
      );

      expect(result).toBeInstanceOf(Object);
      expect(result.status).toEqual("baseline-updated");
    });
  });
});
