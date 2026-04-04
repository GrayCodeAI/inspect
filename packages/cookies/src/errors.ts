import { Schema } from "effect";

export class ExtractionError extends Schema.ErrorClass<ExtractionError>("ExtractionError")({
  _tag: Schema.tag("ExtractionError"),
  reason: Schema.Unknown,
}) {
  message = `Cookie extraction failed: ${this.reason}`;
}

export class RequiresFullDiskAccess extends Schema.ErrorClass<RequiresFullDiskAccess>(
  "RequiresFullDiskAccess",
)({
  _tag: Schema.tag("RequiresFullDiskAccess"),
}) {
  message =
    "Safari requires Full Disk Access. Please grant it in System Settings > Privacy & Security.";
}

export class ListBrowsersError extends Schema.ErrorClass<ListBrowsersError>("ListBrowsersError")({
  _tag: Schema.tag("ListBrowsersError"),
  cause: Schema.Unknown,
}) {
  message = `Failed to list available browsers: ${this.cause}`;
}

export class CookieDatabaseNotFoundError extends Schema.ErrorClass<CookieDatabaseNotFoundError>(
  "CookieDatabaseNotFoundError",
)({
  _tag: Schema.tag("CookieDatabaseNotFoundError"),
  path: Schema.String,
}) {
  message = `Cookie database not found at: ${this.path}`;
}

export class CookieDatabaseCopyError extends Schema.ErrorClass<CookieDatabaseCopyError>(
  "CookieDatabaseCopyError",
)({
  _tag: Schema.tag("CookieDatabaseCopyError"),
  cause: Schema.Unknown,
}) {
  message = `Failed to copy cookie database: ${this.cause}`;
}

export class CookieDecryptionKeyError extends Schema.ErrorClass<CookieDecryptionKeyError>(
  "CookieDecryptionKeyError",
)({
  _tag: Schema.tag("CookieDecryptionKeyError"),
  cause: Schema.Unknown,
}) {
  message = `Failed to get cookie decryption key: ${this.cause}`;
}

export class CookieReadError extends Schema.ErrorClass<CookieReadError>("CookieReadError")({
  _tag: Schema.tag("CookieReadError"),
  path: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to read cookie database at ${this.path}: ${this.cause}`;
}

export class BinaryParseError extends Schema.ErrorClass<BinaryParseError>("BinaryParseError")({
  _tag: Schema.tag("BinaryParseError"),
  cause: Schema.Unknown,
}) {
  message = `Failed to parse binary cookie data: ${this.cause}`;
}

export class CdpConnectionError extends Schema.ErrorClass<CdpConnectionError>("CdpConnectionError")(
  {
    _tag: Schema.tag("CdpConnectionError"),
    cause: Schema.Unknown,
  },
) {
  message = `Failed to connect to browser via CDP: ${this.cause}`;
}

export class BrowserSpawnError extends Schema.ErrorClass<BrowserSpawnError>("BrowserSpawnError")({
  _tag: Schema.tag("BrowserSpawnError"),
  cause: Schema.Unknown,
}) {
  message = `Failed to spawn browser: ${this.cause}`;
}

export class UnsupportedPlatformError extends Schema.ErrorClass<UnsupportedPlatformError>(
  "UnsupportedPlatformError",
)({
  _tag: Schema.tag("UnsupportedPlatformError"),
  platform: Schema.String,
}) {
  message = `Unsupported platform: ${this.platform}`;
}

export class UnsupportedBrowserError extends Schema.ErrorClass<UnsupportedBrowserError>(
  "UnsupportedBrowserError",
)({
  _tag: Schema.tag("UnsupportedBrowserError"),
  browser: Schema.String,
}) {
  message = `Unsupported browser: ${this.browser}`;
}

export class UnknownError extends Schema.ErrorClass<UnknownError>("UnknownError")({
  _tag: Schema.tag("UnknownError"),
  cause: Schema.Unknown,
}) {
  message = `Unknown error: ${this.cause}`;
}
