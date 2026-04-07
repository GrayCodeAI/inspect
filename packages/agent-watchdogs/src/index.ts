// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-watchdogs - Agent watchdog monitoring and event handling
// ──────────────────────────────────────────────────────────────────────────────

// Watchdog Manager
export {
  type WatchdogType,
  type WatchdogConfig,
  type Watchdog,
  type WatchdogCallback,
  WatchdogManager,
  type WatchdogEvent as WatchdogEventInfo,
} from "./watchdogs/manager.js";

// Individual Watchdogs
export {
  type DownloadConfig,
  type DownloadInfo,
  DownloadWatchdog,
} from "./watchdogs/download-watchdog.js";

export {
  type CaptchaConfig,
  type CaptchaType,
  type CaptchaDetection,
  CaptchaWatchdog,
} from "./watchdogs/captcha-watchdog.js";

export {
  type CrashConfig,
  type CrashType,
  type CrashInfo,
  CrashWatchdog,
} from "./watchdogs/crash-watchdog.js";

export {
  type PopupConfig,
  type PopupType,
  type PopupDetection,
  PopupWatchdog,
} from "./watchdogs/popup-watchdog.js";

// Watchdog Services
export {
  WatchdogEvent,
  CaptchaWatchdogService,
  PopupWatchdogService,
  CrashWatchdogService,
  DownloadWatchdogService,
} from "./watchdogs/all-watchdogs.js";

// Additional Watchdog Implementations
export {
  type TrackedPopup,
  type PopupRule,
  PopupWatchdog as PopupWatchdogImpl,
} from "./watchdogs/popups.js";
export {
  type PermissionRequest,
  type PermissionRule,
  PermissionsWatchdog,
} from "./watchdogs/permissions.js";
export {
  type TrackedDownload,
  DownloadWatchdog as DownloadWatchdogImpl,
} from "./watchdogs/downloads.js";
export { type DOMMutation, DOMWatchdog } from "./watchdogs/dom.js";
export {
  type CrashInfo as CrashInfoImpl,
  CrashWatchdog as CrashWatchdogImpl,
} from "./watchdogs/crashes.js";
export { CaptchaWatchdog as CaptchaWatchdogImpl } from "./watchdogs/captcha.js";
