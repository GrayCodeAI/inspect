// ──────────────────────────────────────────────────────────────────────────────
// @inspect/codegen - Code generation from recordings
// ──────────────────────────────────────────────────────────────────────────────

export { CodegenFromRecording } from "./codegen-from-recording.js";

export {
  TestScriptGenerator,
  GenerationError,
  ValidationError,
  type TestSpec,
  type GeneratedTest,
  type GenerationConfig,
} from "./test-generator.js";

export {
  UserSessionRecorder,
  type RecordedAction,
  type UserSessionRecording,
  type RecordingOptions,
} from "./user-session-recorder.js";
