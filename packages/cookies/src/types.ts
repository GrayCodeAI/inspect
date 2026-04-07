import { Schema } from "effect";

export const SameSitePolicy = Schema.Union([
  Schema.Literal("Strict"),
  Schema.Literal("Lax"),
  Schema.Literal("None"),
]);
export type SameSitePolicy = typeof SameSitePolicy.Type;

export const Cookie = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.String,
  path: Schema.String,
  expires: Schema.optional(Schema.Number),
  secure: Schema.Boolean,
  httpOnly: Schema.Boolean,
  sameSite: Schema.optional(SameSitePolicy),
});
export type Cookie = typeof Cookie.Type;

export type ExtractOptions = {
  readonly browser?: string;
  readonly profile?: string;
  readonly url?: string;
};

export const BrowserKey = Schema.String;
export type BrowserKey = typeof BrowserKey.Type;

export type ChromiumBrowserKey =
  | "chrome"
  | "chromium"
  | "brave"
  | "edge"
  | "opera"
  | "vivaldi"
  | "arc";
export type FirefoxBrowserKey = "firefox" | "firefox-developer" | "firefox-nightly";
export type SafariBrowserKey = "safari" | "safari-technology-preview";

export type ChromiumBrowser = {
  _tag: "ChromiumBrowser";
  key: ChromiumBrowserKey;
  profilePath: string;
  executablePath: string;
};

export type FirefoxBrowser = {
  _tag: "FirefoxBrowser";
  key: FirefoxBrowserKey;
  profilePath: string;
};

export type SafariBrowser = {
  _tag: "SafariBrowser";
  key: SafariBrowserKey;
  cookieFilePath: string | null;
};

export type WebKitBrowser = {
  _tag: "WebKitBrowser";
  key: "webkit";
  cookieFilePath: string | null;
};

export type Browser = ChromiumBrowser | FirefoxBrowser | SafariBrowser | WebKitBrowser;

export const browserKeyOf = (browser: Browser): BrowserKey => browser.key;
