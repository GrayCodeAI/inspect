import { describe, it, expect } from "vitest";
import {
  RecordingStartError,
  RecordingStopError,
  RecordingNotFoundError,
  RecordingAlreadyActiveError,
  RrwebLoadError,
  ReplayExportError,
} from "./errors.js";

describe("Session Recording Errors", () => {
  describe("RecordingStartError", () => {
    it("should have correct _tag", () => {
      const error = new RecordingStartError({ sessionId: "sess-1", cause: "timeout" });
      expect(error._tag).toBe("RecordingStartError");
    });

    it("should include sessionId and cause", () => {
      const error = new RecordingStartError({ sessionId: "sess-1", cause: "timeout" });
      expect(error.sessionId).toBe("sess-1");
      expect(error.cause).toBe("timeout");
    });

    it("should have descriptive message", () => {
      const error = new RecordingStartError({ sessionId: "sess-1", cause: "timeout" });
      expect(error.message).toContain("sess-1");
      expect(error.message).toContain("timeout");
    });
  });

  describe("RecordingStopError", () => {
    it("should have correct _tag", () => {
      const error = new RecordingStopError({ sessionId: "sess-2", cause: "page closed" });
      expect(error._tag).toBe("RecordingStopError");
    });

    it("should have descriptive message", () => {
      const error = new RecordingStopError({ sessionId: "sess-2", cause: "page closed" });
      expect(error.message).toContain("sess-2");
    });
  });

  describe("RecordingNotFoundError", () => {
    it("should have correct _tag", () => {
      const error = new RecordingNotFoundError({ sessionId: "sess-3" });
      expect(error._tag).toBe("RecordingNotFoundError");
    });

    it("should have descriptive message", () => {
      const error = new RecordingNotFoundError({ sessionId: "sess-3" });
      expect(error.message).toContain("sess-3");
    });
  });

  describe("RecordingAlreadyActiveError", () => {
    it("should have correct _tag", () => {
      const error = new RecordingAlreadyActiveError({ sessionId: "sess-4" });
      expect(error._tag).toBe("RecordingAlreadyActiveError");
    });

    it("should have descriptive message", () => {
      const error = new RecordingAlreadyActiveError({ sessionId: "sess-4" });
      expect(error.message).toContain("sess-4");
    });
  });

  describe("RrwebLoadError", () => {
    it("should have correct _tag", () => {
      const error = new RrwebLoadError({ cause: "network error" });
      expect(error._tag).toBe("RrwebLoadError");
    });

    it("should have descriptive message", () => {
      const error = new RrwebLoadError({ cause: "network error" });
      expect(error.message).toContain("network error");
    });
  });

  describe("ReplayExportError", () => {
    it("should have correct _tag", () => {
      const error = new ReplayExportError({ sessionId: "sess-5", cause: "disk full" });
      expect(error._tag).toBe("ReplayExportError");
    });

    it("should have descriptive message", () => {
      const error = new ReplayExportError({ sessionId: "sess-5", cause: "disk full" });
      expect(error.message).toContain("sess-5");
      expect(error.message).toContain("disk full");
    });
  });
});
