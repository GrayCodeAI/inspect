// @inspect/orchestrator — Session Recording Adapter

import { Effect } from "effect";
import { SessionRecorder } from "./session-recorder.js";

/**
 * Adapter that wraps a SessionRecorder to match the ExecutionDeps.recording interface.
 */
import { Effect } from "effect";
import { SessionRecorder } from "./session-recorder.js";

/**
 * Adapter that wraps a SessionRecorder to match the ExecutionDeps.recording interface.
 */
export class SessionRecorderAdapter {
  private recordingId: string | null = null;

  constructor(private readonly recorder: SessionRecorder, private readonly page: any) {}

  start(): Effect.Effect<void> {
    return Effect.gen(function* (env) {
      const recordingId = yield* Effect.tryPromise(() =>
        this.recorder.startRecording(this.page)
      );
      this.recordingId = recordingId;
      yield* Effect.succeed(undefined);
    });
  }

  stop(): Effect.Effect<unknown[]> {
    return Effect.gen(function* (env) {
      if (!this.recordingId) {
        return [];
      }
      const recording = yield* Effect.tryPromise(() =>
        this.recorder.stopRecording(this.recordingId)
      );
      this.recordingId = null;
      if (!recording) {
        return [];
      }
      return recording.events;
    });
  }

  save(planId: string): Effect.Effect<string> {
    return Effect.gen(function* (env) {
      if (!this.recordingId) {
        throw new Error("No active recording");
      }
      // Export as JSON string
      const json = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "json")
      );
      // Write to file
      const fs = require("node:fs").promises;
      const outputPath = `${planId}-recording.json`;
      yield* Effect.tryPromise(() => fs.writeFile(outputPath, json, "utf8"));
      return outputPath;
    });
  }

  generateViewer(outputPath: string): Effect.Effect<string> {
    return Effect.gen(function* (env) {
      if (!this.recorder) {
        throw new Error("No active recording");
      }
      const html = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "html")
      );
      // Write HTML to file
      const fs = require("node:fs").promises;
      yield* Effect.tryPromise(() => fs.writeFile(outputPath, html, "utf8"));
      return outputPath;
    });
  }
}

  stop(): Effect.Effect<unknown[]> {
    return Effect.gen(function* (env) {
      if (!this.recordingId) {
        return [];
      }
      const recording = yield* Effect.tryPromise(() => this.recorder.stopRecording(this.recordingId));
      this.recordingId = null;
      if (!recording) {
        return [];
      }
      return recording.events;
    }).provide(env);
  }

  save(planId: string): Effect.Effect<string> {
    return Effect.gen(function* (env) {
      if (!this.recordingId) {
        throw new Error("No active recording");
      }
      const path = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "json"),
      );
      // Write JSON to file system
      const fs = yield* Effect.environment(env).FileSystem;
      const events = yield* this.recorder.getRecording(this.recordingId); // Need to implement getRecording?
      // Actually, exportRecording returns the JSON string directly
      const json = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "json"),
      );
      const outputPath = `${planId}-recording.json`;
      yield* fs.writeFile(outputPath, json);
      return outputPath;
    }).provide(env);
  }

  generateViewer(outputPath: string): Effect.Effect<string> {
    return Effect.gen(function* (env) {
      if (!this.recordingId) {
        throw new Error("No active recording");
      }
      const html = yield* Effect.tryPromise(() =>
        this.recorder.exportRecording(this.recordingId, "html"),
      );
      // Write HTML to file
      const fs = yield* Effect.environment(env).FileSystem;
      yield* fs.writeFile(outputPath, html);
      return outputPath;
    }).provide(env);
  }
}
}