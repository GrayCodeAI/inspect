// ──────────────────────────────────────────────────────────────────────────────
// Stealth Mode - Anti-detection browser configuration (from browser-use)
// Configures Playwright to avoid bot detection via fingerprinting
// ──────────────────────────────────────────────────────────────────────────────

import type { BrowserContextOptions } from "playwright";

/**
 * Generate stealth browser context options that minimize bot detection.
 */
export function getStealthOptions(options?: StealthOptions): BrowserContextOptions {
  return {
    // Mask automation indicators
    userAgent:
      options?.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    // Screen dimensions matching the user agent
    viewport: options?.viewport ?? { width: 1920, height: 1080 },

    // Locale and timezone to look like a real user
    locale: options?.locale ?? "en-US",
    timezoneId: options?.timezone ?? "America/New_York",

    // Geolocation (optional - set to a real location)
    geolocation: options?.geolocation,

    // Permissions to grant
    permissions: options?.permissions ?? [],

    // Color scheme
    colorScheme: options?.colorScheme ?? "light",

    // Device scale factor
    deviceScaleFactor: 1,

    // Do NOT set the Playwright automation flag
    // (Playwright sets --enable-automation by default — this can be overridden via launch args)
  };
}

/**
 * Launch arguments to add for stealth mode.
 */
export function getStealthLaunchArgs(): string[] {
  return [
    // Remove automation flags
    "--disable-blink-features=AutomationControlled",
    // Mask navigator.webdriver
    "--disable-extensions",
    // Reduce fingerprinting surface
    "--disable-default-apps",
    "--no-first-run",
    "--disable-sync",
    // Mimic normal Chrome
    "--window-size=1920,1080",
    "--start-maximized",
    // Reduce telemetry
    "--metrics-recording-only",
    "--no-pings",
    "--disable-component-update",
    "--disable-background-networking",
    // Avoid headless detection
    "--disable-gpu",
    // WebRTC to prevent IP leak
    "--disable-features=IsolateOrigins,site-per-process",
  ];
}

export interface StealthOptions {
  /** Custom user agent string */
  userAgent?: string;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Browser locale */
  locale?: string;
  /** Timezone ID */
  timezone?: string;
  /** Geolocation to spoof */
  geolocation?: { latitude: number; longitude: number };
  /** Browser permissions to grant */
  permissions?: string[];
  /** Color scheme */
  colorScheme?: "light" | "dark";
  /** Proxy configuration for IP rotation */
  proxy?: { server: string; username?: string; password?: string };
}

/**
 * Inject scripts to mask browser automation indicators.
 * Call this via page.addInitScript() before navigating.
 */
export const stealthInitScript = `
  // Override navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Mask Chrome automation object
  window.chrome = {
    runtime: {},
    ...(window.chrome || {}),
  };

  // Override permissions query
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission, query: () => Notification.permission })
      : originalQuery(parameters);

  // Override plugins length
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // Override languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // Override WebGL renderer
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Google Inc. (NVIDIA)';
    if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)';
    return getParameter.call(this, parameter);
  };
`;
