import { describe, it, expect } from "vitest";
import { CSVParser } from "./csv.js";

describe("CSVParser", () => {
  const parser = new CSVParser();

  describe("simple CSV parsing", () => {
    it("parses a basic CSV string with headers", () => {
      const input = "name,age,city\nAlice,30,NYC\nBob,25,LA";
      const result = parser.parse(input);
      expect(result.errors.length).toBe(0);
      expect(result.rowCount).toBe(2);
      expect(result.headers).toEqual(["name", "age", "city"]);
      expect(result.data).toEqual([
        { name: "Alice", age: "30", city: "NYC" },
        { name: "Bob", age: "25", city: "LA" },
      ]);
    });

    it("parses single-row CSV", () => {
      const input = "a,b\n1,2";
      const result = parser.parse(input);
      expect(result.rowCount).toBe(1);
      expect(result.data).toEqual([{ a: "1", b: "2" }]);
    });

    it("returns correct columnCount", () => {
      const input = "x,y,z\n1,2,3";
      const result = parser.parse(input);
      expect(result.columnCount).toBe(3);
    });
  });

  describe("quoted fields", () => {
    it("handles double-quoted fields", () => {
      const input = 'name,bio\nAlice,"Loves coding, cats"';
      const result = parser.parse(input);
      const data = result.data as Record<string, string>[];
      expect(data[0].bio).toBe("Loves coding, cats");
    });

    it("handles escaped quotes (doubled)", () => {
      const input = 'val\n"He said ""hello"""';
      const result = parser.parse(input);
      const data = result.data as Record<string, string>[];
      expect(data[0].val).toBe('He said "hello"');
    });

    it("handles newlines within quoted fields", () => {
      const input = 'msg\n"line1\nline2"';
      const result = parser.parse(input);
      const data = result.data as Record<string, string>[];
      expect(data[0].msg).toBe("line1\nline2");
    });
  });

  describe("custom delimiters", () => {
    it("parses TSV (tab-delimited)", () => {
      const input = "name\tage\nAlice\t30";
      const result = parser.parse(input, { delimiter: "\t" });
      expect(result.headers).toEqual(["name", "age"]);
      const data = result.data as Record<string, string>[];
      expect(data[0].name).toBe("Alice");
      expect(data[0].age).toBe("30");
    });

    it("parses semicolon-delimited data", () => {
      const input = "a;b;c\n1;2;3";
      const result = parser.parse(input, { delimiter: ";" });
      expect(result.headers).toEqual(["a", "b", "c"]);
      expect(result.rowCount).toBe(1);
    });
  });

  describe("headers", () => {
    it("returns headers from the first row by default", () => {
      const input = "col1,col2\nval1,val2";
      const result = parser.parse(input);
      expect(result.headers).toEqual(["col1", "col2"]);
    });

    it("uses custom header names when provided", () => {
      const input = "1,2,3\n4,5,6";
      const result = parser.parse(input, {
        headerNames: ["x", "y", "z"],
      });
      expect(result.headers).toEqual(["x", "y", "z"]);
      expect(result.rowCount).toBe(2);
    });

    it("generates column_N headers when headers=false", () => {
      const input = "1,2,3\n4,5,6";
      const result = parser.parse(input, { headers: false });
      expect(result.headers).toEqual(["column_1", "column_2", "column_3"]);
      const data = result.data as string[][];
      expect(data[0]).toEqual(["1", "2", "3"]);
    });
  });

  describe("options", () => {
    it("skips empty rows by default", () => {
      const input = "a,b\n1,2\n\n3,4";
      const result = parser.parse(input);
      expect(result.rowCount).toBe(2);
    });

    it("skips rows with skipRows option", () => {
      const input = "skip me\na,b\n1,2";
      const result = parser.parse(input, { skipRows: 1 });
      expect(result.headers).toEqual(["a", "b"]);
      expect(result.rowCount).toBe(1);
    });

    it("limits rows with maxRows option", () => {
      const input = "a\n1\n2\n3\n4\n5";
      const result = parser.parse(input, { maxRows: 2 });
      expect(result.rowCount).toBe(2);
    });

    it("trims whitespace by default", () => {
      const input = "a , b \n 1 , 2 ";
      const result = parser.parse(input);
      expect(result.headers).toEqual(["a", "b"]);
      const data = result.data as Record<string, string>[];
      expect(data[0].a).toBe("1");
      expect(data[0].b).toBe("2");
    });

    it("skips comment lines", () => {
      const input = "# comment\na,b\n1,2";
      const result = parser.parse(input, { commentChar: "#" });
      expect(result.headers).toEqual(["a", "b"]);
      expect(result.rowCount).toBe(1);
    });
  });

  describe("error handling", () => {
    it("records errors for mismatched column counts", () => {
      const input = "a,b\n1,2\n3";
      const result = parser.parse(input);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Expected 2 columns");
    });
  });

  describe("Buffer input", () => {
    it("parses CSV from a Buffer", () => {
      const buf = Buffer.from("x,y\n1,2", "utf-8");
      const result = parser.parse(buf);
      expect(result.rowCount).toBe(1);
      expect(result.headers).toEqual(["x", "y"]);
    });
  });
});
