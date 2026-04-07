import { describe, it, expect } from "vitest";
import type { BrowserConfig } from "@inspect/browser";

describe("@inspect/browser", () => {
  it("should support WebKit backend configuration", () => {
    const config: BrowserConfig = {
      name: "test",
      backend: "webkit",
      headless: true,
      viewport: { width: 1280, height: 720 },
    };
    expect(config.backend).toBe("webkit");
  });
});
