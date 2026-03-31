import type { BrowserKey, ChromiumBrowserKey, FirefoxBrowserKey, SafariBrowserKey } from "./types.js";

interface BrowserConfig {
  readonly displayName: string;
  readonly dataDir: string;
  readonly profileDir: string;
  readonly cookieFile?: string;
  readonly stateFile?: string;
}

const CHROMIUM_CONFIGS: Record<ChromiumBrowserKey, BrowserConfig> = {
  chrome: { displayName: "Google Chrome", dataDir: "Google/Chrome", profileDir: "Default" },
  chromium: { displayName: "Chromium", dataDir: "chromium", profileDir: "Default" },
  brave: { displayName: "Brave", dataDir: "BraveSoftware/Brave-Browser", profileDir: "Default" },
  edge: { displayName: "Microsoft Edge", dataDir: "Microsoft/Edge", profileDir: "Default" },
  opera: { displayName: "Opera", dataDir: "Opera Software/Opera Stable", profileDir: "" },
  vivaldi: { displayName: "Vivaldi", dataDir: "Vivaldi", profileDir: "Default" },
  arc: { displayName: "Arc", dataDir: "Arc", profileDir: "Default" },
};

const FIREFOX_CONFIGS: Record<FirefoxBrowserKey, BrowserConfig> = {
  firefox: { displayName: "Firefox", dataDir: "firefox", profileDir: "" },
  "firefox-developer": { displayName: "Firefox Developer Edition", dataDir: "firefox-developer", profileDir: "" },
  "firefox-nightly": { displayName: "Firefox Nightly", dataDir: "firefox-nightly", profileDir: "" },
};

const SAFARI_CONFIGS: Record<SafariBrowserKey, BrowserConfig> = {
  safari: { displayName: "Safari", dataDir: "", profileDir: "", cookieFile: "Cookies.binarycookies" },
  "safari-technology-preview": { displayName: "Safari Technology Preview", dataDir: "", profileDir: "", cookieFile: "Cookies.binarycookies" },
};

export const BROWSER_CONFIGS: Record<BrowserKey, BrowserConfig> = {
  ...CHROMIUM_CONFIGS,
  ...FIREFOX_CONFIGS,
  ...SAFARI_CONFIGS,
} as Record<BrowserKey, BrowserConfig>;

export const configByKey = (key: BrowserKey): BrowserConfig | undefined => BROWSER_CONFIGS[key];
