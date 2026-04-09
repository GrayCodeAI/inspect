// ──────────────────────────────────────────────────────────────────────────────
// @inspect/session-recording - Session recording with rrweb
// ──────────────────────────────────────────────────────────────────────────────

// Session Recorder
export {
  RecordingConfig,
  type RecordingConfig as RecordingConfigT,
  defaultRecordingConfig,
  type RRWebEvent,
  type RecordingSession,
  SessionRecorder,
} from "./session-recorder.js";

// Errors
export {
  RecordingStartError,
  RecordingStopError,
  RecordingNotFoundError,
  RecordingAlreadyActiveError,
  RrwebLoadError,
  ReplayExportError,
} from "./errors.js";

// Replay Validator
export {
  ReplayValidator,
  type ReplayValidationResult,
  type ReplayValidationStep,
} from "./replay-validator.js";

// Test Service
export { TestService } from "./test-service.js";
