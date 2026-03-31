// @inspect/agent-watchdogs — All watchdog implementations
// Split from @inspect/agent to follow Single Responsibility Principle

export {
  WatchdogManager,
  type WatchdogType,
  type WatchdogEvent,
  type WatchdogConfig,
  type Watchdog,
  type WatchdogCallback,
} from "./watchdogs/manager.js";

export { CaptchaWatchdog } from "./watchdogs/captcha.js";
export { DownloadWatchdog, type TrackedDownload } from "./watchdogs/downloads.js";
export { PopupWatchdog, type TrackedPopup, type PopupRule } from "./watchdogs/popups.js";
export { CrashWatchdog, type CrashInfo } from "./watchdogs/crashes.js";
export { DOMWatchdog, type DOMMutation } from "./watchdogs/dom.js";
export {
  PermissionsWatchdog,
  type PermissionRequest,
  type PermissionRule,
} from "./watchdogs/permissions.js";
