// @ts-nocheck
/**
 * Tests for act phase
 */

import { Effect, Layer } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { actPhase, ActInput } from "./act.js";
import { BrowserManagerService } from "@inspect/browser";

const testLayer = BrowserManagerService.layer;

describe("act phase", () => {
  let baseInput: ActInput;

  beforeEach(() => {
    baseInput = new ActInput({
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
    });
  });

  it("should execute successful actions", async () => {
    const result = await Effect.runPromise(actPhase(baseInput).pipe(Effect.provide(testLayer)));

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.overallSuccess).toBe(true);
  });

  it("should track execution duration", async () => {
    const result = await Effect.runPromise(actPhase(baseInput).pipe(Effect.provide(testLayer)));

    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(result.results[0].duration).toBeGreaterThanOrEqual(0);
  });

  it("should handle multiple actions", async () => {
    const input = new ActInput({
      ...baseInput,
      actions: [
        { type: "click", params: { selector: ".btn1" } },
        { type: "type", params: { selector: ".input", text: "hello" } },
        { type: "click", params: { selector: ".btn2" } },
      ],
    });

    const result = await Effect.runPromise(actPhase(input).pipe(Effect.provide(testLayer)));

    expect(result.results.length).toBe(3);
  });

  it("should mark action success or failure", async () => {
    const result = await Effect.runPromise(actPhase(baseInput).pipe(Effect.provide(testLayer)));

    expect(result.results[0]).toHaveProperty("success");
    expect(typeof result.results[0].success).toBe("boolean");
  });

  it("should return final browser state", async () => {
    const result = await Effect.runPromise(actPhase(baseInput).pipe(Effect.provide(testLayer)));

    expect(result.finalBrowserState).toBeDefined();
    expect((result.finalBrowserState as { url?: string }).url).toBeDefined();
  });

  it("should handle empty actions array", async () => {
    const input = new ActInput({
      ...baseInput,
      actions: [],
    });

    const result = await Effect.runPromise(actPhase(input).pipe(Effect.provide(testLayer)));

    expect(result.results.length).toBe(0);
  });
});
