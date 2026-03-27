// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Stealth Browsing Types
// ──────────────────────────────────────────────────────────────────────────────

/** Stealth preset levels */
export type StealthPreset = "minimal" | "balanced" | "aggressive";

/** Browser fingerprint configuration */
export interface FingerprintConfig {
  /** Override WebGL vendor/renderer */
  webgl?: { vendor: string; renderer: string };
  /** Override canvas fingerprint */
  canvas?: boolean;
  /** Override audio context fingerprint */
  audioContext?: boolean;
  /** Spoof WebRTC IP leak */
  webrtc?: "disabled" | "fake";
  /** Override navigator properties */
  navigator?: {
    platform?: string;
    languages?: string[];
    hardwareConcurrency?: number;
    deviceMemory?: number;
    maxTouchPoints?: number;
  };
  /** Override screen properties */
  screen?: {
    width: number;
    height: number;
    colorDepth?: number;
    pixelDepth?: number;
  };
  /** Override timezone */
  timezone?: string;
  /** Override locale */
  locale?: string;
}

/** Anti-detection header configuration */
export interface StealthHeaderConfig {
  /** Rotate User-Agent on each request */
  rotateUserAgent?: boolean;
  /** Custom User-Agent pool */
  userAgentPool?: string[];
  /** Remove automation indicators */
  removeAutomationHeaders?: boolean;
  /** Add realistic sec-ch-ua headers */
  addClientHints?: boolean;
  /** Add realistic accept headers */
  addAcceptHeaders?: boolean;
}

/** Proxy rotation configuration */
export interface ProxyRotationConfig {
  /** Proxy pool */
  proxies: Array<{ server: string; username?: string; password?: string }>;
  /** Rotation strategy */
  strategy: "round-robin" | "random" | "per-request" | "per-domain";
  /** Rotate on failure */
  rotateOnFailure?: boolean;
  /** Max retries per proxy */
  maxRetries?: number;
}

/** Full stealth configuration */
export interface StealthConfig {
  /** Stealth preset level */
  preset?: StealthPreset;
  /** Fingerprint overrides */
  fingerprint?: FingerprintConfig;
  /** Header configuration */
  headers?: StealthHeaderConfig;
  /** Proxy rotation */
  proxyRotation?: ProxyRotationConfig;
  /** Enable stealth mode */
  enabled: boolean;
  /** Custom init scripts to inject before page load */
  initScripts?: string[];
  /** Disable webdriver detection */
  disableWebdriverDetection?: boolean;
  /** Override permissions API */
  spoofPermissions?: boolean;
}

/** CAPTCHA detection result */
export interface CaptchaDetectionResult {
  detected: boolean;
  type?: "recaptcha" | "hcaptcha" | "cloudflare" | "unknown";
  selector?: string;
  confidence: number;
}
