import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { ErrorClassifier, ErrorCategory, ClassifiedError } from "./error-classifier.js";

describe("ErrorClassifier", () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe("classify", () => {
    it("should classify navigation timeout errors as timeout", async () => {
      const error = new Error("Navigation timed out after 30s");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("timeout");
      expect(result.message).toContain("Navigation timed out");
    });

    it("should classify element not found errors as element_not_found", async () => {
      const error = new Error("Element #submit-button not found");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("element_not_found");
      expect(result.message).toContain("Element not found");
    });

    it("should classify element not visible errors as element_not_visible", async () => {
      const error = new Error("Element is not visible");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("element_not_visible");
      expect(result.message).toContain("not visible");
    });

    it("should classify element not interactable errors as element_not_interactable", async () => {
      const error = new Error("Element is not interactable");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("element_not_interactable");
      expect(result.message).toContain("not interactable");
    });

    it("should classify page crash errors as page_crash", async () => {
      const error = new Error("Page crashed");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("page_crash");
      expect(result.message).toContain("crashed");
    });

    it("should classify network errors as network_error", async () => {
      const error = new Error("Failed to fetch");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("network_error");
      expect(result.message).toContain("Failed to fetch");
    });

    it("should classify selector stale errors as selector_stale", async () => {
      const error = new Error("stale element reference");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("selector_stale");
      expect(result.message).toContain("stale");
    });

    it("should classify captcha errors as captcha_detected", async () => {
      const error = new Error("captcha verification failed");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("captcha_detected");
      expect(result.message).toContain("captcha");
    });

    it("should classify auth errors as auth_required", async () => {
      const error = new Error("Unauthorized");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("auth_required");
      expect(result.message).toContain("Unauthorized");
    });

    it("should classify rate limit errors as rate_limited", async () => {
      const error = new Error("Too many requests");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("rate_limited");
      expect(result.message).toContain("Too many requests");
    });

    it("should classify unknown errors as unknown", async () => {
      const error = new Error("Some unexpected error");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("unknown");
      expect(result.message).toContain("unexpected error");
    });

    it("should handle errors with multiple potential categories", async () => {
      // This test ensures the classifier picks the most specific match
      const error = new Error("Element not found: #submit-button");
      const result = await Effect.runPromise(classifier.classify(error));
      expect(result.category).toEqual("element_not_found");
    });
  });

  describe("classifyBatch", () => {
    it("should classify multiple errors efficiently", async () => {
      const errors = [
        new Error("Navigation timed out"),
        new Error("Element not found"),
        new Error("Page crashed"),
      ];

      const results = await Effect.runPromise(classifier.classifyBatch(errors));
      expect(results).toHaveLength(3);
      expect(results[0].category).toEqual("timeout");
      expect(results[1].category).toEqual("element_not_found");
      expect(results[2].category).toEqual("page_crash");
    });

    it("should return empty array for empty input", async () => {
      const results = await Effect.runPromise(classifier.classifyBatch([]));
      expect(results).toEqual([]);
    });
  });

  describe("getCategory", () => {
    it("should return category for known error patterns", async () => {
      expect(await Effect.runPromise(classifier.getCategory(new Error("Timeout")))).toEqual(
        "timeout",
      );
      expect(
        await Effect.runPromise(classifier.getCategory(new Error("Element not found"))),
      ).toEqual("element_not_found");
      expect(await Effect.runPromise(classifier.getCategory(new Error("Page crash")))).toEqual(
        "page_crash",
      );
      expect(await Effect.runPromise(classifier.getCategory(new Error("Network error")))).toEqual(
        "network_error",
      );
    });

    it("should return unknown for unrecognized errors", async () => {
      expect(await Effect.runPromise(classifier.getCategory(new Error("Unknown error")))).toEqual(
        "unknown",
      );
    });
  });
});
