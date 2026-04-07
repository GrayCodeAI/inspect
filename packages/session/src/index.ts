// ──────────────────────────────────────────────────────────────────────────────
// @inspect/session - Session recording and replay
// ──────────────────────────────────────────────────────────────────────────────

export { collectEvents, collectAllEvents, loadSession, SessionRecorder } from "./recorder.js";

export { RrVideoConvertError, RrVideo } from "./rrvideo.js";

export { RecorderInjectionError, SessionLoadError, RrVideoError } from "./errors.js";

export { buildReplayViewerHtml } from "./replay-viewer.js";

export type { eventWithTime, CollectResult } from "./types.js";
