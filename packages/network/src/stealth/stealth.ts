// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Stealth Browsing Module
// ──────────────────────────────────────────────────────────────────────────────

import type {
  StealthConfig,
  FingerprintConfig,
  StealthPreset,
  CaptchaDetectionResult,
} from "@inspect/shared";

/** Real User-Agent pool for rotation */
const USER_AGENT_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
];

/** WebGL vendor/renderer pairs */
const WEBGL_PROFILES = [
  {
    vendor: "Google Inc. (Intel)",
    renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0)",
  },
  {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0)",
  },
  { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0)" },
];

/**
 * Stealth browsing engine for anti-detection.
 */
export class StealthEngine {
  private config: StealthConfig;
  private uaIndex: number = 0;
  private webglIndex: number = 0;

  constructor(config: StealthConfig) {
    this.config = config;
  }

  /**
   * Get init scripts to inject before page load.
   */
  getInitScripts(): string[] {
    const scripts: string[] = [];

    if (this.config.disableWebdriverDetection !== false) {
      scripts.push(this.webdriverOverrideScript());
    }

    if (this.config.fingerprint) {
      scripts.push(this.fingerprintOverrideScript(this.config.fingerprint));
    }

    if (this.config.spoofPermissions) {
      scripts.push(this.permissionsOverrideScript());
    }

    if (this.config.initScripts) {
      scripts.push(...this.config.initScripts);
    }

    return scripts;
  }

  /**
   * Get the next User-Agent for rotation.
   */
  getNextUserAgent(): string {
    const pool = this.config.headers?.userAgentPool ?? USER_AGENT_POOL;
    const ua = pool[this.uaIndex % pool.length];
    this.uaIndex++;
    return ua;
  }

  /**
   * Get stealth HTTP headers.
   */
  getStealthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.headers?.rotateUserAgent) {
      headers["User-Agent"] = this.getNextUserAgent();
    }

    if (this.config.headers?.addClientHints) {
      const _ua = headers["User-Agent"] ?? USER_AGENT_POOL[0];
      headers["sec-ch-ua"] = '"Chromium";v="125", "Google Chrome";v="125"';
      headers["sec-ch-ua-mobile"] = "?0";
      headers["sec-ch-ua-platform"] = '"Windows"';
    }

    if (this.config.headers?.addAcceptHeaders) {
      headers["Accept"] =
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
      headers["Accept-Language"] = "en-US,en;q=0.9";
      headers["Accept-Encoding"] = "gzip, deflate, br";
      headers["sec-fetch-dest"] = "document";
      headers["sec-fetch-mode"] = "navigate";
      headers["sec-fetch-site"] = "none";
      headers["sec-fetch-user"] = "?1";
    }

    return headers;
  }

  /**
   * Detect CAPTCHA on a page.
   */
  static detectCaptcha(html: string): CaptchaDetectionResult {
    const patterns: Array<{ type: CaptchaDetectionResult["type"]; selectors: string[] }> = [
      {
        type: "recaptcha",
        selectors: ["g-recaptcha", "grecaptcha", "recaptcha", "g-recaptcha-response"],
      },
      { type: "hcaptcha", selectors: ["h-captcha", "hcaptcha", "h_captcha"] },
      {
        type: "cloudflare",
        selectors: ["cf-challenge", "cf-browser-verification", "challenge-platform"],
      },
    ];

    for (const pattern of patterns) {
      for (const selector of pattern.selectors) {
        if (html.toLowerCase().includes(selector.toLowerCase())) {
          return {
            detected: true,
            type: pattern.type,
            selector,
            confidence: 0.9,
          };
        }
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Create stealth config from preset.
   */
  static fromPreset(preset: StealthPreset): StealthConfig {
    switch (preset) {
      case "minimal":
        return {
          enabled: true,
          preset: "minimal",
          disableWebdriverDetection: true,
        };

      case "balanced":
        return {
          enabled: true,
          preset: "balanced",
          disableWebdriverDetection: true,
          headers: {
            rotateUserAgent: true,
            removeAutomationHeaders: true,
            addClientHints: true,
            addAcceptHeaders: true,
          },
          fingerprint: {
            webgl: WEBGL_PROFILES[0],
            canvas: true,
            webrtc: "fake",
          },
        };

      case "aggressive":
        return {
          enabled: true,
          preset: "aggressive",
          disableWebdriverDetection: true,
          spoofPermissions: true,
          headers: {
            rotateUserAgent: true,
            removeAutomationHeaders: true,
            addClientHints: true,
            addAcceptHeaders: true,
          },
          fingerprint: {
            webgl: WEBGL_PROFILES[Math.floor(Math.random() * WEBGL_PROFILES.length)],
            canvas: true,
            audioContext: true,
            webrtc: "disabled",
            navigator: {
              platform: "Win32",
              languages: ["en-US", "en"],
              hardwareConcurrency: 8,
              deviceMemory: 8,
              maxTouchPoints: 0,
            },
          },
        };
    }
  }

  // ── Private scripts ──────────────────────────────────────────────────

  private webdriverOverrideScript(): string {
    return `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    `;
  }

  private fingerprintOverrideScript(fp: FingerprintConfig): string {
    const parts: string[] = [];

    if (fp.webgl) {
      parts.push(`
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
          if (param === 37445) return '${fp.webgl.vendor}';
          if (param === 37446) return '${fp.webgl.renderer}';
          return getParameter.call(this, param);
        };
      `);
    }

    if (fp.canvas) {
      parts.push(`
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
          const context = this.getContext('2d');
          if (context) {
            const shift = { r: Math.floor(Math.random() * 10) - 5, g: Math.floor(Math.random() * 10) - 5, b: Math.floor(Math.random() * 10) - 5 };
            const width = this.width;
            const height = this.height;
            if (width && height) {
              const imageData = context.getImageData(0, 0, width, height);
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] += shift.r;
                imageData.data[i+1] += shift.g;
                imageData.data[i+2] += shift.b;
              }
              context.putImageData(imageData, 0, 0);
            }
          }
          return toDataURL.call(this, type, quality);
        };
      `);
    }

    if (fp.webrtc === "disabled") {
      parts.push(`
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
      `);
    }

    if (fp.navigator) {
      if (fp.navigator.platform) {
        parts.push(
          `Object.defineProperty(navigator, 'platform', { get: () => '${fp.navigator.platform}' });`,
        );
      }
      if (fp.navigator.hardwareConcurrency) {
        parts.push(
          `Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.navigator.hardwareConcurrency} });`,
        );
      }
      if (fp.navigator.deviceMemory) {
        parts.push(
          `Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.navigator.deviceMemory} });`,
        );
      }
    }

    return parts.join("\n");
  }

  private permissionsOverrideScript(): string {
    return `
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: 'prompt' })
          : originalQuery(params);
    `;
  }
}
