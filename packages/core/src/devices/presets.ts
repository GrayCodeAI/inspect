import { createLogger } from "@inspect/observability";

const logger = createLogger("core/devices");

/**
 * Full device configuration for browser emulation.
 */
export interface DeviceConfig {
  /** Unique device name. */
  name: string;
  /** User agent string. */
  userAgent: string;
  /** Viewport dimensions. */
  viewport: {
    width: number;
    height: number;
  };
  /** Device scale factor (DPR). */
  deviceScaleFactor: number;
  /** Whether the device is mobile. */
  isMobile: boolean;
  /** Whether the device supports touch. */
  hasTouch: boolean;
  /** Default browser type for this device. */
  defaultBrowserType: "chromium" | "firefox" | "webkit";
}

/**
 * Comprehensive device presets covering common phones, tablets, and desktops.
 */
export const DevicePresets: Record<string, DeviceConfig> = {
  // -- Desktop --
  "desktop-chrome": {
    name: "desktop-chrome",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "chromium",
  },
  "desktop-firefox": {
    name: "desktop-firefox",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "firefox",
  },
  "desktop-safari": {
    name: "desktop-safari",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "webkit",
  },
  "desktop-edge": {
    name: "desktop-edge",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "chromium",
  },
  "desktop-1080p": {
    name: "desktop-1080p",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "chromium",
  },

  // -- iPhones --
  "iphone-15": {
    name: "iphone-15",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },
  "iphone-15-pro-max": {
    name: "iphone-15-pro-max",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },
  "iphone-se": {
    name: "iphone-se",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },

  // -- iPads --
  "ipad-pro": {
    name: "ipad-pro",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },
  "ipad-mini": {
    name: "ipad-mini",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },

  // -- Android Phones --
  "pixel-8": {
    name: "pixel-8",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
  "galaxy-s24": {
    name: "galaxy-s24",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
  "galaxy-s24-ultra": {
    name: "galaxy-s24-ultra",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
  "galaxy-fold": {
    name: "galaxy-fold",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    viewport: { width: 344, height: 882 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },

  // -- Android Tablets --
  "galaxy-tab-s9": {
    name: "galaxy-tab-s9",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
};

/**
 * Get a device preset by name.
 * @throws if the device name is not found
 */
export function getPreset(name: string): DeviceConfig {
  const preset = DevicePresets[name];
  if (!preset) {
    const available = Object.keys(DevicePresets).join(", ");
    throw new Error(
      `Unknown device preset: "${name}". Available: ${available}`
    );
  }
  return preset;
}

/**
 * List all available device presets.
 */
export function listPresets(): DeviceConfig[] {
  return Object.values(DevicePresets);
}

/**
 * Get presets filtered by category.
 */
export function getPresetsByCategory(
  category: "desktop" | "phone" | "tablet"
): DeviceConfig[] {
  return Object.values(DevicePresets).filter((d) => {
    if (category === "desktop") return !d.isMobile;
    if (category === "phone") {
      return (
        d.isMobile &&
        d.viewport.width < 500 &&
        !d.name.includes("ipad") &&
        !d.name.includes("tab")
      );
    }
    if (category === "tablet") {
      return (
        d.isMobile &&
        (d.viewport.width >= 500 ||
          d.name.includes("ipad") ||
          d.name.includes("tab"))
      );
    }
    return true;
  });
}

/**
 * Parse a comma-separated list of device names/categories into device configs.
 * Supports individual names and categories: "desktop", "phone", "tablet", "all".
 */
export function resolveDevices(input: string): DeviceConfig[] {
  const result: DeviceConfig[] = [];
  const seen = new Set<string>();

  for (const token of input.split(",").map((t) => t.trim())) {
    if (token === "all") {
      return listPresets();
    }

    if (token === "desktop" || token === "phone" || token === "tablet") {
      for (const device of getPresetsByCategory(token)) {
        if (!seen.has(device.name)) {
          seen.add(device.name);
          result.push(device);
        }
      }
      continue;
    }

    const preset = DevicePresets[token];
    if (preset && !seen.has(preset.name)) {
      seen.add(preset.name);
      result.push(preset);
    } else if (!preset) {
      const available = Object.keys(DevicePresets).join(", ");
      logger.warn("Unknown device preset", { token, available });
    }
  }

  if (result.length === 0) {
    logger.warn("No valid devices matched. Defaulting to desktop-chrome.");
    result.push(DevicePresets["desktop-chrome"]);
  }

  return result;
}
