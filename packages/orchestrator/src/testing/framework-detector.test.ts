import { describe, it, expect } from "vitest";
import { detectFramework } from "./framework-detector.js";

describe("detectFramework", () => {
  it("should detect the current project's framework or return null", () => {
    const result = detectFramework(process.cwd());
    // This project uses pnpm + TypeScript but no frontend framework
    // so it should return null
    expect(result).toBeNull();
  });

  it("should return null for non-existent directory", () => {
    const result = detectFramework("/nonexistent/path");
    expect(result).toBeNull();
  });
});
