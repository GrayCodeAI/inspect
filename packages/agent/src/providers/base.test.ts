import { describe, it, expect } from "vitest";
import { LLMError } from "./base.js";

describe("LLMError", () => {
  describe("constructor", () => {
    it("stores the message", () => {
      const error = new LLMError("something broke", 500);
      expect(error.message).toBe("something broke");
    });

    it("sets name to LLMError", () => {
      const error = new LLMError("fail", 500);
      expect(error.name).toBe("LLMError");
    });

    it("is an instance of Error", () => {
      const error = new LLMError("fail", 500);
      expect(error).toBeInstanceOf(Error);
    });

    it("is an instance of LLMError", () => {
      const error = new LLMError("fail", 500);
      expect(error).toBeInstanceOf(LLMError);
    });

    it("stores the status code", () => {
      const error = new LLMError("not found", 404);
      expect(error.statusCode).toBe(404);
    });

    it("stores the response body when provided", () => {
      const error = new LLMError("fail", 500, '{"error":"internal"}');
      expect(error.responseBody).toBe('{"error":"internal"}');
    });

    it("responseBody is undefined when not provided", () => {
      const error = new LLMError("fail", 500);
      expect(error.responseBody).toBeUndefined();
    });
  });

  describe("isRateLimit", () => {
    it("is true for 429 status", () => {
      const error = new LLMError("rate limited", 429);
      expect(error.isRateLimit).toBe(true);
    });

    it("is false for 500 status", () => {
      const error = new LLMError("server error", 500);
      expect(error.isRateLimit).toBe(false);
    });

    it("is false for 200 status", () => {
      const error = new LLMError("ok??", 200);
      expect(error.isRateLimit).toBe(false);
    });

    it("is false for 503 status", () => {
      const error = new LLMError("unavailable", 503);
      expect(error.isRateLimit).toBe(false);
    });
  });

  describe("isOverloaded", () => {
    it("is true for 529 status", () => {
      const error = new LLMError("overloaded", 529);
      expect(error.isOverloaded).toBe(true);
    });

    it("is true for 503 status", () => {
      const error = new LLMError("service unavailable", 503);
      expect(error.isOverloaded).toBe(true);
    });

    it("is false for 429 status", () => {
      const error = new LLMError("rate limited", 429);
      expect(error.isOverloaded).toBe(false);
    });

    it("is false for 500 status", () => {
      const error = new LLMError("server error", 500);
      expect(error.isOverloaded).toBe(false);
    });
  });

  describe("error properties", () => {
    it("statusCode is a number", () => {
      const error = new LLMError("fail", 500);
      expect(typeof error.statusCode).toBe("number");
    });

    it("isRateLimit is a boolean", () => {
      const error = new LLMError("fail", 429);
      expect(typeof error.isRateLimit).toBe("boolean");
    });

    it("isOverloaded is a boolean", () => {
      const error = new LLMError("fail", 503);
      expect(typeof error.isOverloaded).toBe("boolean");
    });
  });

  describe("stack trace", () => {
    it("has a stack trace", () => {
      const error = new LLMError("fail", 500);
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe("string");
    });
  });
});
