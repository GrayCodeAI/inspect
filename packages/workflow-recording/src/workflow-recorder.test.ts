import { Effect } from "effect";
import { WorkflowRecorder } from "@inspect/workflow-recording";
import { describe, it, assert } from "@effect/vitest";

describe("WorkflowRecorder", () => {
  it("should create and manage workflow recordings", () => {
    return Effect.gen(function* () {
      const recorder = new WorkflowRecorder();
      const workflow = yield* recorder.create(
        "test-workflow",
        "https://example.com",
        "Test workflow",
      );
      assert.ok(workflow);
      assert.equal(workflow.name, "test-workflow");
      assert.equal(workflow.id.startsWith("workflow-"), true);

      // Start recording
      yield* recorder.startRecording(workflow.id);
      assert.ok(workflow);

      // Add a mock event
      yield* recorder.addEvent(workflow.id, {
        type: 1,
        data: { message: "test" },
        timestamp: Date.now(),
      });

      // Stop recording
      yield* recorder.stopRecording(workflow.id);

      // Get workflow
      const retrieved = yield* recorder.get(workflow.id);
      assert.ok(retrieved);

      // Check active recordings
      const active = yield* recorder.isRecording(workflow.id);
      assert.equal(active, false);

      // Delete workflow
      yield* recorder.delete(workflow.id);
      const deleted = yield* recorder.get(workflow.id);
      assert.equal(deleted === null, true);
    }).pipe(Effect.provide(WorkflowRecorder.layer));
  });
});
