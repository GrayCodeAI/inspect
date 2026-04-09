// @inspect/orchestrator — Session Recording Adapter

import { Effect } from "effect";
import { SessionRecorder } from "./session-recorder.js";
import { promises as fs } from "node:fs";

/**
 * Adapter that wraps a SessionRecorder to match the ExecutionDeps.recording interface.
 */
export class SessionRecorderAdapter {
  private recordingId: string | null = null;

  constructor(private readonly recorder: SessionRecorder, private readonly page: unknown) {}

  start(): Effect.Effect<void> {
    return Effect.gen(function* () {
      const recordingId = yield* Effect.tryPromise(() =>
        this.recorder.startRecording(this.page)
      );
      this.recordingId = recordingId;
      yield* Effect.succeed(undefined);
    });
  }

  stop(): Effect.Effect<unknown[]> {
    return Effect.gen(function* () {
      if (!this.recordingId) {
        return [];
      }
      const recording = yield* Effect.tryPromise(() => this.recorder.stopRecording(this.recordingId));
      this.recordingId = null;
      if (!recording) {
        return [];
      }
      return recording.events;
    });
  }

  save(planId: string): Effect.Effect<string> {
    return Effect.gen(function* () {
      if (!this.recordingId) {
        throw new Error("No active recording");
      }
      const json = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "json"),
      );
      // Write JSON to file system
      const outputPath = `${planId}-recording.json`;
      yield* Effect.tryPromise(() => fs.writeFile(outputPath, json, "utf8"));
      return outputPath;
    });
  }

  generateViewer(outputPath: string): Effect.Effect<string> {
    return Effect.gen(function* () {
      if (!this.recordingId) {
        throw new Error("No active recording");
      }
      const html = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "html"),
      );
      // Write HTML to file
      yield* Effect.tryPromise(() => fs.writeFile(outputPath, html, "utf8"));
      return outputPath;
    });
  }
}
