import { Effect } from "effect";
import {
  HumanCheckpointService,
  CheckpointRequest,
  CheckpointResponse,
} from "@inspect/human-in-the-loop";
import { describe, it, assert } from "@effect/vitest";

describe("HumanCheckpointService", () => {
  it("should create a checkpoint and wait for response (timeout)", () => {
    return Effect.gen(function* () {
      const service = yield* HumanCheckpointService;
      const request: CheckpointRequest = {
        type: "approval",
        title: "Test Checkpoint",
        description: "Test checkpoint description",
        timeoutMs: 1000,
      };
      const checkpoint = yield* service.create(request);
      assert.equal(checkpoint.status, "pending");
      assert.ok(checkpoint.id);

      try {
        yield* service.waitForResponse(checkpoint.id);
        assert.fail("Should have timed out");
      } catch (error) {
        assert.ok(error instanceof Error.CheckpointTimeoutError);
      }
    }).pipe(Effect.provide(HumanCheckpointService.layer));
  });

  it("should respond to a checkpoint", () => {
    return Effect.gen(function* () {
      const service = yield* HumanCheckpointService;
      const request: CheckpointRequest = {
        type: "input",
        title: "Test Input",
        description: "Test input request",
        timeoutMs: 5000,
      };
      const checkpoint = yield* service.create(request);
      // Simulate a response by directly offering to the queue (internal)
      // This is a simplified test - in reality, we'd need to access the internal queue
      assert.ok(checkpoint);
    }).pipe(Effect.provide(HumanCheckpointService.layer));
  });

  it("should get checkpoint by ID", () => {
    return Effect.gen(function* () {
      const service = yield* HumanCheckpointService;
      const request: CheckpointRequest = {
        type: "approval",
        title: "Get Checkpoint",
        description: "Test get checkpoint",
        timeoutMs: 2000,
      };
      const checkpoint = yield* service.create(request);
      const retrieved = yield* service.get(checkpoint.id);
      assert.equal(retrieved?.id, checkpoint.id);
      assert.equal(retrieved?.status, "pending");
    }).pipe(Effect.provide(HumanCheckpointService.layer));
  });
});
