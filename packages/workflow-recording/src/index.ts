// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow-recording - Workflow recording and capture
// ──────────────────────────────────────────────────────────────────────────────

// Types
export {
  WorkflowEventType,
  type BaseWorkflowEvent,
  type NavigateEvent,
  type ClickEvent,
  type TypeEvent,
  type SelectEvent,
  type ScrollEvent,
  type HoverEvent,
  type KeypressEvent,
  type WaitEvent,
  type AssertionEvent,
  type WorkflowEvent,
  Workflow,
  type Workflow as WorkflowT,
  type ExportFormat,
  type WorkflowRecordingOptions,
} from "./types.js";

// Errors
export {
  WorkflowRecordingError,
  WorkflowNotFoundError,
  WorkflowAlreadyRecordingError,
  WorkflowExportError,
  InvalidWorkflowEventError,
} from "./errors.js";

// Services
export { WorkflowRecorder, defaultRecordingOptions } from "./workflow-recorder.js";
export { WorkflowExporter } from "./workflow-exporter.js";
export { WorkflowSessionStore } from "./session-store.js";
export { WorkflowBrowserCapture } from "./browser-capture.js";
