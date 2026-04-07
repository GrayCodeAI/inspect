// ──────────────────────────────────────────────────────────────────────────────
// @inspect/cookies - Browser cookie extraction and management
// ──────────────────────────────────────────────────────────────────────────────

export { Cookies } from "./cookies.js";
export { Browsers } from "./browser-detector.js";
export { CdpClient } from "./cdp-client.js";
export { SqliteClient } from "./sqlite-client.js";

export { BROWSER_CONFIGS, configByKey, type BrowserConfig } from "./browser-config.js";

export {
  SameSitePolicy,
  Cookie,
  type ExtractOptions,
  BrowserKey,
  type ChromiumBrowserKey,
  type FirefoxBrowserKey,
  type SafariBrowserKey,
  type ChromiumBrowser,
  type FirefoxBrowser,
  type SafariBrowser,
  type WebKitBrowser,
  type Browser,
  browserKeyOf,
} from "./types.js";

export {
  ExtractionError,
  RequiresFullDiskAccess,
  ListBrowsersError,
  CookieDatabaseNotFoundError,
  CookieDatabaseCopyError,
  CookieDecryptionKeyError,
  CookieReadError,
  BinaryParseError,
  CdpConnectionError,
  BrowserSpawnError,
  UnsupportedPlatformError,
  UnsupportedBrowserError,
  UnknownError,
} from "./errors.js";

export { parseBinaryCookies } from "./utils/binary-cookies.js";

export { type FirefoxPlatform, type FirefoxSource, getFirefoxSource } from "./firefox.js";

export { type ChromiumPlatform, type ChromiumSource, getChromiumSource } from "./chromium.js";

export { type SafariPlatform, type SafariSource, getSafariSource } from "./safari.js";
