// ──────────────────────────────────────────────────────────────────────────────
// BROWSER_CONFIGS - Cookie paths and encryption methods for 20+ browsers
// ──────────────────────────────────────────────────────────────────────────────

import type { BrowserCookieConfig } from "@inspect/shared";

/**
 * All known browser cookie configurations per platform.
 * Covers Chrome, Firefox, Safari, Edge, Brave, Arc, Vivaldi, Opera,
 * Chromium, Opera GX, Yandex, Waterfox, Librewolf, Floorp,
 * Thorium, Ungoogled Chromium, Iridium, Cốc Cốc, SRWare Iron, and Naver Whale.
 */
export const BROWSER_CONFIGS: BrowserCookieConfig[] = [
  // ── Chromium-based ───────────────────────────────────────────────────────
  {
    name: "Chrome",
    paths: {
      darwin: ["~/Library/Application Support/Google/Chrome"],
      linux: ["~/.config/google-chrome"],
      win32: [
        "%LOCALAPPDATA%\\Google\\Chrome\\User Data",
        "%APPDATA%\\Google\\Chrome\\User Data",
      ],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Chrome Beta",
    paths: {
      darwin: ["~/Library/Application Support/Google/Chrome Beta"],
      linux: ["~/.config/google-chrome-beta"],
      win32: ["%LOCALAPPDATA%\\Google\\Chrome Beta\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Chrome Canary",
    paths: {
      darwin: ["~/Library/Application Support/Google/Chrome Canary"],
      linux: ["~/.config/google-chrome-canary"],
      win32: ["%LOCALAPPDATA%\\Google\\Chrome SxS\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Chromium",
    paths: {
      darwin: ["~/Library/Application Support/Chromium"],
      linux: ["~/.config/chromium"],
      win32: ["%LOCALAPPDATA%\\Chromium\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Edge",
    paths: {
      darwin: ["~/Library/Application Support/Microsoft Edge"],
      linux: ["~/.config/microsoft-edge"],
      win32: ["%LOCALAPPDATA%\\Microsoft\\Edge\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Edge Beta",
    paths: {
      darwin: ["~/Library/Application Support/Microsoft Edge Beta"],
      linux: ["~/.config/microsoft-edge-beta"],
      win32: ["%LOCALAPPDATA%\\Microsoft\\Edge Beta\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Edge Dev",
    paths: {
      darwin: ["~/Library/Application Support/Microsoft Edge Dev"],
      linux: ["~/.config/microsoft-edge-dev"],
      win32: ["%LOCALAPPDATA%\\Microsoft\\Edge Dev\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Brave",
    paths: {
      darwin: ["~/Library/Application Support/BraveSoftware/Brave-Browser"],
      linux: ["~/.config/BraveSoftware/Brave-Browser"],
      win32: ["%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Arc",
    paths: {
      darwin: ["~/Library/Application Support/Arc/User Data"],
      linux: ["~/.config/arc/User Data"],
      win32: ["%LOCALAPPDATA%\\Arc\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Vivaldi",
    paths: {
      darwin: ["~/Library/Application Support/Vivaldi"],
      linux: ["~/.config/vivaldi"],
      win32: ["%LOCALAPPDATA%\\Vivaldi\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Opera",
    paths: {
      darwin: ["~/Library/Application Support/com.operasoftware.Opera"],
      linux: ["~/.config/opera"],
      win32: ["%APPDATA%\\Opera Software\\Opera Stable"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
  },
  {
    name: "Opera GX",
    paths: {
      darwin: ["~/Library/Application Support/com.operasoftware.OperaGX"],
      linux: ["~/.config/opera-gx"],
      win32: ["%APPDATA%\\Opera Software\\Opera GX Stable"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
  },
  {
    name: "Yandex",
    paths: {
      darwin: ["~/Library/Application Support/Yandex/YandexBrowser"],
      linux: ["~/.config/yandex-browser"],
      win32: ["%LOCALAPPDATA%\\Yandex\\YandexBrowser\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Thorium",
    paths: {
      darwin: ["~/Library/Application Support/Thorium"],
      linux: ["~/.config/thorium"],
      win32: ["%LOCALAPPDATA%\\Thorium\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Ungoogled Chromium",
    paths: {
      darwin: ["~/Library/Application Support/Chromium"],
      linux: ["~/.config/chromium"],
      win32: ["%LOCALAPPDATA%\\Chromium\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Iridium",
    paths: {
      darwin: ["~/Library/Application Support/Iridium"],
      linux: ["~/.config/iridium"],
      win32: ["%LOCALAPPDATA%\\Iridium\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Cốc Cốc",
    paths: {
      darwin: ["~/Library/Application Support/Coc Coc/Browser"],
      linux: ["~/.config/coccoc/Browser"],
      win32: ["%LOCALAPPDATA%\\CocCoc\\Browser\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "SRWare Iron",
    paths: {
      darwin: ["~/Library/Application Support/Iron"],
      linux: ["~/.config/iron"],
      win32: ["%LOCALAPPDATA%\\Iron\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },
  {
    name: "Naver Whale",
    paths: {
      darwin: ["~/Library/Application Support/Naver/Whale"],
      linux: ["~/.config/naver-whale"],
      win32: ["%LOCALAPPDATA%\\Naver\\Naver Whale\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium",
    profilePattern: "Default|Profile *",
  },

  // ── Firefox-based ────────────────────────────────────────────────────────
  {
    name: "Firefox",
    paths: {
      darwin: ["~/Library/Application Support/Firefox/Profiles"],
      linux: ["~/.mozilla/firefox"],
      win32: ["%APPDATA%\\Mozilla\\Firefox\\Profiles"],
    },
    cookieFile: "cookies.sqlite",
    encryption: "firefox",
    profilePattern: "*.default-release|*.default",
  },
  {
    name: "Waterfox",
    paths: {
      darwin: ["~/Library/Application Support/Waterfox/Profiles"],
      linux: ["~/.waterfox"],
      win32: ["%APPDATA%\\Waterfox\\Profiles"],
    },
    cookieFile: "cookies.sqlite",
    encryption: "firefox",
    profilePattern: "*.default-release|*.default",
  },
  {
    name: "LibreWolf",
    paths: {
      darwin: ["~/Library/Application Support/LibreWolf/Profiles"],
      linux: ["~/.librewolf"],
      win32: ["%APPDATA%\\LibreWolf\\Profiles"],
    },
    cookieFile: "cookies.sqlite",
    encryption: "firefox",
    profilePattern: "*.default-release|*.default",
  },
  {
    name: "Floorp",
    paths: {
      darwin: ["~/Library/Application Support/Floorp/Profiles"],
      linux: ["~/.floorp"],
      win32: ["%APPDATA%\\Floorp\\Profiles"],
    },
    cookieFile: "cookies.sqlite",
    encryption: "firefox",
    profilePattern: "*.default-release|*.default",
  },

  // ── Safari ───────────────────────────────────────────────────────────────
  {
    name: "Safari",
    paths: {
      darwin: ["~/Library/Cookies"],
    },
    cookieFile: "Cookies.binarycookies",
    encryption: "safari",
  },
];

/**
 * Find browser config by name (case-insensitive).
 */
export function findBrowserConfig(name: string): BrowserCookieConfig | undefined {
  return BROWSER_CONFIGS.find((b) => b.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get all browser configs available for the current platform.
 */
export function getAvailableBrowsers(): BrowserCookieConfig[] {
  const platform = process.platform as "darwin" | "linux" | "win32";
  return BROWSER_CONFIGS.filter((b) => b.paths[platform] && b.paths[platform]!.length > 0);
}

/**
 * Resolve a path template, expanding ~ and %ENV_VAR% placeholders.
 */
export function resolveBrowserPath(pathTemplate: string): string {
  let resolved = pathTemplate;

  // Expand ~ to home directory
  if (resolved.startsWith("~")) {
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    resolved = resolved.replace("~", home);
  }

  // Expand %VAR% environment variables (Windows)
  resolved = resolved.replace(/%([^%]+)%/g, (_, varName: string) => {
    return process.env[varName] ?? "";
  });

  return resolved;
}
