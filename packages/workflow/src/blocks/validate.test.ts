import { describe, it, expect, beforeEach } from "vitest";
import { ValidationBlock } from "./validate.js";
import { WorkflowContext } from "../engine/context.js";
import type { WorkflowBlock } from "@inspect/shared";

function makeBlock(params: Record<string, unknown>): WorkflowBlock {
  return {
    id: "validate-1",
    type: "validation",
    label: "Validate Block",
    parameters: params,
  };
}

describe("ValidationBlock", () => {
  let validator: ValidationBlock;
  let context: WorkflowContext;

  beforeEach(() => {
    validator = new ValidationBlock();
    context = new WorkflowContext();
  });

  describe("variable comparison - equality operators", () => {
    it("passes when variable equals expected value (eq)", async () => {
      context.set("status", "active");
      const block = makeBlock({ variable: "status", expected: "active", operator: "eq" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
      expect(result.actual).toBe("active");
      expect(result.expected).toBe("active");
    });

    it("fails when variable does not equal expected value (eq)", async () => {
      context.set("status", "inactive");
      const block = makeBlock({ variable: "status", expected: "active", operator: "eq" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.actual).toBe("inactive");
    });

    it("passes when variable does not equal expected value (ne)", async () => {
      context.set("count", 5);
      const block = makeBlock({ variable: "count", expected: 10, operator: "ne" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("performs deep equality for objects", async () => {
      context.set("data", { a: 1, b: 2 });
      const block = makeBlock({ variable: "data", expected: { a: 1, b: 2 }, operator: "eq" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("variable comparison - numeric operators", () => {
    it("passes when variable is greater than expected (gt)", async () => {
      context.set("score", 85);
      const block = makeBlock({ variable: "score", expected: 70, operator: "gt" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("fails when variable is not greater than expected (gt)", async () => {
      context.set("score", 50);
      const block = makeBlock({ variable: "score", expected: 70, operator: "gt" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
    });

    it("passes for less-than comparison (lt)", async () => {
      context.set("latency", 100);
      const block = makeBlock({ variable: "latency", expected: 200, operator: "lt" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes for greater-than-or-equal comparison (gte)", async () => {
      context.set("version", 3);
      const block = makeBlock({ variable: "version", expected: 3, operator: "gte" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes for less-than-or-equal comparison (lte)", async () => {
      context.set("retries", 2);
      const block = makeBlock({ variable: "retries", expected: 3, operator: "lte" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("variable comparison - string/array operators", () => {
    it("passes when string contains substring (contains)", async () => {
      context.set("message", "Hello, world!");
      const block = makeBlock({ variable: "message", expected: "world", operator: "contains" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes when array contains element (contains)", async () => {
      context.set("tags", ["alpha", "beta", "gamma"]);
      const block = makeBlock({ variable: "tags", expected: "beta", operator: "contains" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes when string matches regex (matches)", async () => {
      context.set("email", "user@example.com");
      const block = makeBlock({
        variable: "email",
        expected: "^\\w+@\\w+\\.\\w+$",
        operator: "matches",
      });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("fails when string does not match regex (matches)", async () => {
      context.set("email", "not-an-email");
      const block = makeBlock({
        variable: "email",
        expected: "^\\w+@\\w+\\.\\w+$",
        operator: "matches",
      });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
    });
  });

  describe("variable comparison - existence and type operators", () => {
    it("passes when variable exists (exists)", async () => {
      context.set("token", "abc123");
      const block = makeBlock({ variable: "token", operator: "exists" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("fails when variable does not exist (exists)", async () => {
      const block = makeBlock({ variable: "missing", operator: "exists" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
    });

    it("passes when variable does not exist (not_exists)", async () => {
      const block = makeBlock({ variable: "missing", operator: "not_exists" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("validates type correctly (type)", async () => {
      context.set("count", 42);
      const block = makeBlock({ variable: "count", expected: "number", operator: "type" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("detects array type (type)", async () => {
      context.set("items", [1, 2, 3]);
      const block = makeBlock({ variable: "items", expected: "array", operator: "type" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("variable comparison - truthy/falsy/empty operators", () => {
    it("passes for truthy value (truthy)", async () => {
      context.set("flag", true);
      const block = makeBlock({ variable: "flag", operator: "truthy" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes for falsy value (falsy)", async () => {
      context.set("flag", 0);
      const block = makeBlock({ variable: "flag", operator: "falsy" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes for empty array (empty)", async () => {
      context.set("items", []);
      const block = makeBlock({ variable: "items", operator: "empty" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("passes for non-empty string (not_empty)", async () => {
      context.set("name", "Alice");
      const block = makeBlock({ variable: "name", operator: "not_empty" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("unknown operator", () => {
    it("returns failure for unknown operator", async () => {
      context.set("x", 1);
      const block = makeBlock({ variable: "x", expected: 1, operator: "modulo" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Unknown operator");
    });
  });

  describe("expression-based validation", () => {
    it("evaluates a truthy JS expression", async () => {
      context.set("x", 10);
      context.set("y", 5);
      const block = makeBlock({ condition: "x > y" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
      expect(result.condition).toBe("x > y");
    });

    it("evaluates a falsy JS expression", async () => {
      context.set("x", 3);
      context.set("y", 10);
      const block = makeBlock({ condition: "x > y" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
    });

    it("returns failure on expression evaluation error", async () => {
      const block = makeBlock({ condition: "undefinedFunc()" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Condition evaluation error");
    });
  });

  describe("fallback validation (lastOutput)", () => {
    it("passes when lastOutput is truthy", async () => {
      context.set("lastOutput", "some result");
      const block = makeBlock({});
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
    });

    it("fails when lastOutput is falsy", async () => {
      context.set("lastOutput", "");
      const block = makeBlock({});
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
    });
  });

  describe("custom failure message", () => {
    it("uses custom message on failure", async () => {
      context.set("val", 1);
      const block = makeBlock({
        variable: "val",
        expected: 2,
        operator: "eq",
        message: "Values must match!",
      });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.message).toBe("Values must match!");
    });
  });

  describe("page validation", () => {
    it("delegates to page validator when pageCondition is set", async () => {
      validator.setPageValidator(async (condition) => {
        return condition === "document.title === 'Home'";
      });
      const block = makeBlock({ pageCondition: "document.title === 'Home'" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Page validation passed");
    });

    it("returns failure when page validator returns false", async () => {
      validator.setPageValidator(async () => false);
      const block = makeBlock({ pageCondition: "page.loaded" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Page validation failed");
    });

    it("handles page validator errors gracefully", async () => {
      validator.setPageValidator(async () => {
        throw new Error("Browser not available");
      });
      const block = makeBlock({ pageCondition: "page.ready" });
      const result = await validator.execute(block, context);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Browser not available");
    });
  });
});
