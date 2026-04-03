export { TestScriptGenerator, GenerationError, ValidationError } from "./test-generator.js";
export type { TestSpec, GeneratedTest, GenerationConfig } from "./test-generator.js";

// User session recording and code generation
export {
  UserSessionRecorder,
  RecordedAction,
  UserSessionRecording,
  RecordingOptions,
} from "./user-session-recorder.js";
export { CodegenFromRecording } from "./codegen-from-recording.js";
