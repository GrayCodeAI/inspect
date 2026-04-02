import { Data } from "effect";

export class RecordingStartError extends Data.TaggedError("RecordingStartError")<{
  readonly sessionId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to start recording for session ${this.sessionId}: ${this.cause}`;
  }
}

export class RecordingStopError extends Data.TaggedError("RecordingStopError")<{
  readonly sessionId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to stop recording for session ${this.sessionId}: ${this.cause}`;
  }
}

export class RecordingNotFoundError extends Data.TaggedError("RecordingNotFoundError")<{
  readonly sessionId: string;
}> {
  get message(): string {
    return `No recording found for session: ${this.sessionId}`;
  }
}

export class RecordingAlreadyActiveError extends Data.TaggedError("RecordingAlreadyActiveError")<{
  readonly sessionId: string;
}> {
  get message(): string {
    return `Recording already active for session: ${this.sessionId}`;
  }
}

export class RrwebLoadError extends Data.TaggedError("RrwebLoadError")<{
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to load rrweb: ${this.cause}`;
  }
}

export class ReplayExportError extends Data.TaggedError("ReplayExportError")<{
  readonly sessionId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to export replay for session ${this.sessionId}: ${this.cause}`;
  }
}
