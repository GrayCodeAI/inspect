import { describe, it, expect } from "vitest";
import { WorkflowContext } from "./context.js";
import type { WorkflowParameter } from "@inspect/core";

describe("WorkflowContext", () => {
  describe("basic variable management", () => {
    it("sets and gets a variable", () => {
      const ctx = new WorkflowContext();
      ctx.set("name", "Alice");

      expect(ctx.get("name")).toBe("Alice");
    });

    it("returns undefined for missing variables", () => {
      const ctx = new WorkflowContext();

      expect(ctx.get("missing")).toBeUndefined();
    });

    it("checks if a variable exists with has()", () => {
      const ctx = new WorkflowContext();
      ctx.set("key", "value");

      expect(ctx.has("key")).toBe(true);
      expect(ctx.has("other")).toBe(false);
    });

    it("deletes a variable", () => {
      const ctx = new WorkflowContext();
      ctx.set("temp", 123);

      expect(ctx.delete("temp")).toBe(true);
      expect(ctx.has("temp")).toBe(false);
      expect(ctx.delete("nonexistent")).toBe(false);
    });

    it("reports correct size", () => {
      const ctx = new WorkflowContext();

      expect(ctx.size).toBe(0);
      ctx.set("a", 1);
      ctx.set("b", 2);
      expect(ctx.size).toBe(2);
    });

    it("converts to a plain object", () => {
      const ctx = new WorkflowContext({ x: 10, y: 20 });
      const obj = ctx.toObject();

      expect(obj).toEqual({ x: 10, y: 20 });
    });
  });

  describe("initial parameters and schema defaults", () => {
    it("initializes with provided parameters", () => {
      const ctx = new WorkflowContext({ greeting: "hello", count: 5 });

      expect(ctx.get("greeting")).toBe("hello");
      expect(ctx.get("count")).toBe(5);
    });

    it("applies schema defaults", () => {
      const schema: Record<string, WorkflowParameter> = {
        retries: { type: "number", default: 3 },
        verbose: { type: "boolean", default: false },
      };
      const ctx = new WorkflowContext(undefined, schema);

      expect(ctx.get("retries")).toBe(3);
      expect(ctx.get("verbose")).toBe(false);
    });

    it("initial params override schema defaults", () => {
      const schema: Record<string, WorkflowParameter> = {
        retries: { type: "number", default: 3 },
      };
      const ctx = new WorkflowContext({ retries: 10 }, schema);

      expect(ctx.get("retries")).toBe(10);
    });
  });

  describe("merge", () => {
    it("merges additional parameters into context", () => {
      const ctx = new WorkflowContext({ a: 1 });
      ctx.merge({ b: 2, c: 3 });

      expect(ctx.get("a")).toBe(1);
      expect(ctx.get("b")).toBe(2);
      expect(ctx.get("c")).toBe(3);
    });

    it("overwrites existing values on merge", () => {
      const ctx = new WorkflowContext({ a: 1 });
      ctx.merge({ a: 99 });

      expect(ctx.get("a")).toBe(99);
    });
  });

  describe("strict mode", () => {
    it("throws when a required parameter is missing", () => {
      const schema: Record<string, WorkflowParameter> = {
        apiKey: { type: "string", required: true },
      };

      expect(() => new WorkflowContext(undefined, schema, true)).toThrow(
        "Required workflow parameter 'apiKey' is missing",
      );
    });

    it("does not throw when a required parameter is provided", () => {
      const schema: Record<string, WorkflowParameter> = {
        apiKey: { type: "string", required: true },
      };

      expect(
        () => new WorkflowContext({ apiKey: "secret" }, schema, true),
      ).not.toThrow();
    });

    it("validates type on set in strict mode", () => {
      const schema: Record<string, WorkflowParameter> = {
        count: { type: "number" },
      };
      const ctx = new WorkflowContext(undefined, schema, true);

      expect(() => ctx.set("count", "not-a-number")).toThrow(
        "expected type 'number'",
      );
    });

    it("allows correct type on set in strict mode", () => {
      const schema: Record<string, WorkflowParameter> = {
        count: { type: "number" },
      };
      const ctx = new WorkflowContext(undefined, schema, true);
      ctx.set("count", 42);

      expect(ctx.get("count")).toBe(42);
    });

    it("validates array type in strict mode", () => {
      const schema: Record<string, WorkflowParameter> = {
        items: { type: "array" },
      };
      const ctx = new WorkflowContext(undefined, schema, true);

      expect(() => ctx.set("items", "not-an-array")).toThrow(
        "expected type 'array'",
      );
      ctx.set("items", [1, 2, 3]);
      expect(ctx.get("items")).toEqual([1, 2, 3]);
    });

    it("validates object type in strict mode", () => {
      const schema: Record<string, WorkflowParameter> = {
        config: { type: "object" },
      };
      const ctx = new WorkflowContext(undefined, schema, true);

      expect(() => ctx.set("config", "string")).toThrow(
        "expected type 'object'",
      );
      ctx.set("config", { key: "val" });
      expect(ctx.get("config")).toEqual({ key: "val" });
    });
  });

  describe("template rendering", () => {
    it("renders simple variable placeholders", () => {
      const ctx = new WorkflowContext({ name: "Alice", age: 30 });
      const rendered = ctx.render("Hello, {{name}}! Age: {{age}}.");

      expect(rendered).toBe("Hello, Alice! Age: 30.");
    });

    it("renders dot-notation nested variables", () => {
      const ctx = new WorkflowContext({ user: { name: "Bob", role: "admin" } });
      const rendered = ctx.render("User: {{user.name}}, Role: {{user.role}}");

      expect(rendered).toBe("User: Bob, Role: admin");
    });

    it("renders missing variables as empty string in non-strict mode", () => {
      const ctx = new WorkflowContext();
      const rendered = ctx.render("Value: {{missing}}.");

      expect(rendered).toBe("Value: .");
    });

    it("throws on missing variables in strict mode", () => {
      const ctx = new WorkflowContext(undefined, undefined, true);

      expect(() => ctx.render("Value: {{missing}}.")).toThrow(
        "Template variable 'missing' is not defined",
      );
    });

    it("renders objects as JSON", () => {
      const ctx = new WorkflowContext({ data: { x: 1 } });
      const rendered = ctx.render("Data: {{data}}");

      expect(rendered).toBe('Data: {"x":1}');
    });
  });

  describe("template rendering - #each blocks", () => {
    it("iterates over an array with {{#each}}", () => {
      const ctx = new WorkflowContext({ items: ["a", "b", "c"] });
      const rendered = ctx.render("{{#each items}}[{{this}}]{{/each}}");

      expect(rendered).toBe("[a][b][c]");
    });

    it("provides @index in each blocks", () => {
      const ctx = new WorkflowContext({ items: ["x", "y"] });
      const rendered = ctx.render("{{#each items}}{{@index}}:{{this}} {{/each}}");

      expect(rendered).toBe("0:x 1:y ");
    });

    it("accesses object properties with {{this.prop}}", () => {
      const ctx = new WorkflowContext({
        users: [
          { name: "Alice" },
          { name: "Bob" },
        ],
      });
      const rendered = ctx.render("{{#each users}}{{this.name}},{{/each}}");

      expect(rendered).toBe("Alice,Bob,");
    });

    it("renders empty string for non-array in non-strict mode", () => {
      const ctx = new WorkflowContext({ notArray: "string" });
      const rendered = ctx.render("Before{{#each notArray}}item{{/each}}After");

      expect(rendered).toBe("BeforeAfter");
    });
  });

  describe("template rendering - #if blocks", () => {
    it("renders truthy branch of {{#if}}", () => {
      const ctx = new WorkflowContext({ showGreeting: true });
      const rendered = ctx.render("{{#if showGreeting}}Hello!{{/if}}");

      expect(rendered).toBe("Hello!");
    });

    it("renders else branch when falsy", () => {
      const ctx = new WorkflowContext({ loggedIn: false });
      const rendered = ctx.render(
        "{{#if loggedIn}}Welcome back{{else}}Please log in{{/if}}",
      );

      expect(rendered).toBe("Please log in");
    });

    it("renders nothing for falsy without else", () => {
      const ctx = new WorkflowContext({ show: false });
      const rendered = ctx.render("Start{{#if show}}Middle{{/if}}End");

      expect(rendered).toBe("StartEnd");
    });
  });

  describe("child context / scoping", () => {
    it("creates a child that inherits parent values", () => {
      const parent = new WorkflowContext({ shared: "value" });
      const child = parent.createChild();

      expect(child.get("shared")).toBe("value");
    });

    it("child modifications do not affect parent", () => {
      const parent = new WorkflowContext({ count: 1 });
      const child = parent.createChild();
      child.set("count", 99);
      child.set("childOnly", true);

      expect(parent.get("count")).toBe(1);
      expect(parent.has("childOnly")).toBe(false);
    });

    it("creates a child with additional parameters", () => {
      const parent = new WorkflowContext({ a: 1 });
      const child = parent.createChild({ b: 2 });

      expect(child.get("a")).toBe(1);
      expect(child.get("b")).toBe(2);
      expect(parent.has("b")).toBe(false);
    });
  });
});
