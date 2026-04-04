/**
 * Watchdog System
 *
 * Parallel monitors for captcha, popups, crashes, and downloads.
 * Inspired by browser-use watchdog pattern.
 */

export {
  CaptchaWatchdog,
  type CaptchaConfig,
  type CaptchaDetection,
  type CaptchaType,
} from "./captcha-watchdog";

export {
  PopupWatchdog,
  type PopupConfig,
  type PopupDetection,
  type PopupType,
} from "./popup-watchdog";

export { CrashWatchdog, type CrashConfig, type CrashInfo, type CrashType } from "./crash-watchdog";

export { DownloadWatchdog, type DownloadConfig, type DownloadInfo } from "./download-watchdog";
