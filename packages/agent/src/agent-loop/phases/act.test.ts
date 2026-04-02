/**
 * Tests for act phase
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { actPhase } from "./act.js";
import type { ActInput } from "./act.js";

describe("act phase", () => {
  let mockPage: any;
  let baseInput: ActInput;

  beforeEach(() => {
    mockPage = {
      click: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    baseInput = {
      page: mockPage,
      actions: [
        {
          type: "click",
          params: { selector: ".button" },
        },
      ],
      browserState: {
        url: "https://example.com",
        title: "Example",
        timestamp: Date.now(),
      },
      timeout: 5000,
      maxRetries: 3,
    };
  });

  it("should execute successful actions", async () => {
    const result = await actPhase(baseInput);

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.overallSuccess).toBe(true);
  });

  it("should track execution duration", async () => {
    const result = await actPhase(baseInput);

    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(result.results[0].duration).toBeGreaterThanOrEqual(0);
  });

  it("should handle multiple actions", async () => {
    const input: ActInput = {
      ...baseInput,
      actions: [
        { type: "click", params: { selector: ".btn1" } },
        { type: "type", params: { selector: ".input", text: "hello" } },
        { type: "click", params: { selector: ".btn2" } },
      ],
    };

    const result = await actPhase(input);

    expect(result.results.length).toBe(3);
  });

  it("should mark action success or failure", async () => {
    const result = await actPhase(baseInput);

    expect(result.results[0]).toHaveProperty("success");
    expect(typeof result.results[0].success).toBe("boolean");
  });

  it("should return final browser state", async () => {
    const result = await actPhase(baseInput);

    expect(result.finalBrowserState).toBeDefined();
    expect(result.finalBrowserState.url).toBeDefined();
  });

  it("should handle empty actions array", async () => {
    const input: ActInput = {
      ...baseInput,
      actions: [],
    };

    const result = await actPhase(input);

    expect(result.results.length).toBe(0);
  });
});
