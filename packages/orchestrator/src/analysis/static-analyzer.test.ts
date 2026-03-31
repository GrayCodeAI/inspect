import { describe, it, expect } from "vitest";
import { StaticAnalyzer } from "./static-analyzer.js";

describe("StaticAnalyzer", () => {
  it("should analyze a project directory", () => {
    const analyzer = new StaticAnalyzer(process.cwd());
    const result = analyzer.analyze();
    expect(result).toHaveProperty("routes");
    expect(result).toHaveProperty("forms");
    expect(result).toHaveProperty("apiCalls");
    expect(result).toHaveProperty("eventHandlers");
    expect(result).toHaveProperty("importGraph");
    expect(Array.isArray(result.routes)).toBe(true);
    expect(Array.isArray(result.forms)).toBe(true);
    expect(Array.isArray(result.apiCalls)).toBe(true);
    expect(result.importGraph instanceof Map).toBe(true);
  });

  it("should build import graph", () => {
    const analyzer = new StaticAnalyzer(process.cwd());
    const result = analyzer.analyze();
    expect(result.importGraph.size).toBeGreaterThan(0);
  });

  it("should handle non-existent directory gracefully", () => {
    const analyzer = new StaticAnalyzer("/nonexistent/path");
    const result = analyzer.analyze();
    expect(result.routes).toHaveLength(0);
    expect(result.forms).toHaveLength(0);
  });
});
