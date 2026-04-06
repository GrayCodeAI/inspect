import { describe, it, expect } from "vitest";
import { validateBody, CreateTaskSchema } from "./validation.js";

describe("validation", () => {
  describe("validateBody", () => {
    it("should validate valid task creation", () => {
      const validInput = {
        prompt: "Test task",
        url: "https://example.com",
      };

      const result = validateBody(CreateTaskSchema, validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe("Test task");
        expect(result.data.url).toBe("https://example.com");
        expect(result.data.maxSteps).toBe(25); // default value
      }
    });

    it("should reject invalid task creation", () => {
      const invalidInput = {
        prompt: "", // empty prompt should fail
        url: "not-a-url",
      };

      const result = validateBody(CreateTaskSchema, invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("prompt");
        expect(result.error).toContain("url");
      }
    });
  });
});
