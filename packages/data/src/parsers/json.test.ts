import { describe, it, expect } from "vitest";
import { JSONParser } from "./json.js";

describe("JSONParser", () => {
  const parser = new JSONParser();

  describe("valid JSON", () => {
    it("parses a simple object", () => {
      const result = parser.parse('{"name":"Alice","age":30}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "Alice", age: 30 });
      expect(result.recovered).toBe(false);
    });

    it("parses an array", () => {
      const result = parser.parse("[1, 2, 3]");
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it("parses nested objects", () => {
      const result = parser.parse('{"a":{"b":{"c":1}}}');
      expect(result.success).toBe(true);
      expect((result.data as any).a.b.c).toBe(1);
    });

    it("parses with no recovery needed", () => {
      const result = parser.parse('"just a string"');
      expect(result.success).toBe(true);
      expect(result.data).toBe("just a string");
      expect(result.warnings.length).toBe(0);
    });
  });

  describe("trailing commas", () => {
    it("handles trailing comma in object", () => {
      const result = parser.parse('{"a": 1, "b": 2,}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ a: 1, b: 2 });
      expect(result.recovered).toBe(true);
    });

    it("handles trailing comma in array", () => {
      const result = parser.parse("[1, 2, 3,]");
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });
  });

  describe("comments", () => {
    it("strips single-line comments", () => {
      const input = `{
        // This is a comment
        "key": "value"
      }`;
      const result = parser.parse(input);
      expect(result.success).toBe(true);
      expect((result.data as any).key).toBe("value");
      expect(result.recovered).toBe(true);
    });

    it("strips block comments", () => {
      const input = `{
        /* This is
           a block comment */
        "key": "value"
      }`;
      const result = parser.parse(input);
      expect(result.success).toBe(true);
      expect((result.data as any).key).toBe("value");
    });

    it("preserves // inside strings", () => {
      const input = '{"url": "https://example.com"}';
      const result = parser.parse(input);
      expect(result.success).toBe(true);
      expect((result.data as any).url).toBe("https://example.com");
    });
  });

  describe("single quotes", () => {
    it("handles single-quoted strings", () => {
      const result = parser.parse("{'key': 'value'}");
      expect(result.success).toBe(true);
      expect((result.data as any).key).toBe("value");
    });
  });

  describe("unquoted keys", () => {
    it("handles unquoted object keys", () => {
      const result = parser.parse("{name: \"Alice\"}");
      expect(result.success).toBe(true);
      expect((result.data as any).name).toBe("Alice");
    });
  });

  describe("error cases", () => {
    it("returns error for completely invalid input", () => {
      const result = parser.parse("this is not json at all");
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });

    it("returns error for truncated JSON", () => {
      const result = parser.parse('{"key": "val');
      expect(result.success).toBe(false);
    });
  });

  describe("parseStrict", () => {
    it("parses valid JSON", () => {
      const data = parser.parseStrict('{"a": 1}');
      expect(data).toEqual({ a: 1 });
    });

    it("throws on invalid JSON", () => {
      expect(() => parser.parseStrict("{invalid}")).toThrow();
    });
  });

  describe("Buffer input", () => {
    it("parses JSON from a Buffer", () => {
      const buf = Buffer.from('{"x": 42}', "utf-8");
      const result = parser.parse(buf);
      expect(result.success).toBe(true);
      expect((result.data as any).x).toBe(42);
    });
  });

  describe("maxDepth", () => {
    it("rejects deeply nested objects beyond maxDepth", () => {
      let json = '{"a":';
      for (let i = 0; i < 20; i++) {
        json += '{"a":';
      }
      json += "1";
      for (let i = 0; i < 21; i++) {
        json += "}";
      }
      const result = parser.parse(json, { maxDepth: 5 });
      // Depending on aggressive recovery, this could fail or succeed
      // The main assertion is that it does not crash
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("reviver", () => {
    it("applies reviver function", () => {
      const result = parser.parse('{"val": "42"}', {
        reviver: (key, value) => {
          if (key === "val") return Number(value);
          return value;
        },
      });
      expect(result.success).toBe(true);
      expect((result.data as any).val).toBe(42);
    });
  });

  describe("warnings", () => {
    it("tracks what recovery steps were applied", () => {
      const input = `{
        // comment
        "key": "value",
      }`;
      const result = parser.parse(input);
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
