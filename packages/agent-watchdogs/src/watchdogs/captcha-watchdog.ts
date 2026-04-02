/**
 * Captcha Watchdog
 *
 * Detects and handles CAPTCHA challenges automatically.
 * Supports reCAPTCHA, hCaptcha, Cloudflare Turnstile, and image CAPTCHAs.
 */

import type { Page } from "playwright";

export interface CaptchaConfig {
  /** Auto-solve CAPTCHAs */
  autoSolve: boolean;
  /** CAPTCHA solving service */
  solverService?: "2captcha" | "anti-captcha" | "custom";
  /** API key for solving service */
  solverApiKey?: string;
  /** Timeout for CAPTCHA solving (ms) */
  solveTimeout: number;
  /** Callback when CAPTCHA detected */
  onCaptchaDetected?: (type: CaptchaType, confidence: number) => void;
  /** Callback when CAPTCHA solved */
  onCaptchaSolved?: (type: CaptchaType, success: boolean) => void;
}

export type CaptchaType =
  | "recaptcha-v2"
  | "recaptcha-v3"
  | "hcaptcha"
  | "turnstile"
  | "image-captcha"
  | "text-captcha"
  | "unknown";

export interface CaptchaDetection {
  type: CaptchaType;
  confidence: number;
  element?: string;
  siteKey?: string;
  action?: string;
}

export class CaptchaWatchdog {
  private config: CaptchaConfig;
  private isRunning = false;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: Partial<CaptchaConfig> = {}) {
    this.config = {
      autoSolve: false,
      solveTimeout: 120000,
      ...config,
    };
  }

  /**
   * Start monitoring for CAPTCHAs
   */
  start(page: Page): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check periodically
    this.checkInterval = setInterval(async () => {
      try {
        const detection = await this.detect(page);
        if (detection && detection.confidence > 0.7) {
          this.config.onCaptchaDetected?.(detection.type, detection.confidence);

          if (this.config.autoSolve) {
            await this.solve(page, detection);
          }
        }
      } catch {
        // Ignore errors during detection
      }
    }, 2000);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Detect CAPTCHA on page
   */
  async detect(page: Page): Promise<CaptchaDetection | null> {
    return page.evaluate(() => {
      // Check for reCAPTCHA v2
      const recaptchaV2 = document.querySelector(
        '.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"]'
      );
      if (recaptchaV2) {
        const siteKey =
          recaptchaV2.getAttribute("data-sitekey") ||
          document.querySelector(".g-recaptcha")?.getAttribute("data-sitekey");
        return {
          type: "recaptcha-v2" as const,
          confidence: 0.95,
          element: recaptchaV2.tagName,
          siteKey: siteKey || undefined,
        };
      }

      // Check for reCAPTCHA v3
      if ((window as unknown as { grecaptcha?: { execute?: () => void } }).grecaptcha?.execute) {
        return {
          type: "recaptcha-v3" as const,
          confidence: 0.9,
        };
      }

      // Check for hCaptcha
      const hcaptcha = document.querySelector(
        '.h-captcha, [data-hcaptcha-sitekey], iframe[src*="hcaptcha"]'
      );
      if (hcaptcha) {
        const siteKey =
          hcaptcha.getAttribute("data-sitekey") ||
          document.querySelector(".h-captcha")?.getAttribute("data-sitekey");
        return {
          type: "hcaptcha" as const,
          confidence: 0.95,
          element: hcaptcha.tagName,
          siteKey: siteKey || undefined,
        };
      }

      // Check for Cloudflare Turnstile
      const turnstile = document.querySelector(
        '.cf-turnstile, [data-sitekey], iframe[src*="challenges.cloudflare"]'
      );
      if (turnstile) {
        return {
          type: "turnstile" as const,
          confidence: 0.9,
          element: turnstile.tagName,
        };
      }

      // Check for image CAPTCHA
      const imageCaptcha = document.querySelector(
        'img[src*="captcha"], img[alt*="captcha" i], .captcha-image'
      );
      if (imageCaptcha) {
        return {
          type: "image-captcha" as const,
          confidence: 0.8,
          element: imageCaptcha.tagName,
        };
      }

      // Check for text-based CAPTCHA
      const textCaptcha = document.querySelector(
        'input[name*="captcha" i], .captcha-input, [placeholder*="captcha" i]'
      );
      if (textCaptcha) {
        return {
          type: "text-captcha" as const,
          confidence: 0.7,
          element: textCaptcha.tagName,
        };
      }

      return null;
    });
  }

  /**
   * Solve detected CAPTCHA
   */
  async solve(page: Page, detection: CaptchaDetection): Promise<boolean> {
    console.log(`Solving ${detection.type} CAPTCHA...`);

    switch (detection.type) {
      case "recaptcha-v2":
        return this.solveRecaptchaV2(page, detection);
      case "hcaptcha":
        return this.solveHCaptcha(page, detection);
      case "turnstile":
        return this.solveTurnstile(page, detection);
      case "image-captcha":
        return this.solveImageCaptcha(page, detection);
      default:
        console.warn(`CAPTCHA type ${detection.type} not supported for auto-solving`);
        return false;
    }
  }

  /**
   * Solve reCAPTCHA v2
   */
  private async solveRecaptchaV2(
    page: Page,
    detection: CaptchaDetection
  ): Promise<boolean> {
    if (!detection.siteKey || !this.config.solverApiKey) {
      console.warn("Cannot solve reCAPTCHA: missing siteKey or API key");
      return false;
    }

    // Would integrate with 2captcha/Anti-Captcha API here
    console.log("reCAPTCHA solving not yet implemented (requires external service)");
    return false;
  }

  /**
   * Solve hCaptcha
   */
  private async solveHCaptcha(
    page: Page,
    detection: CaptchaDetection
  ): Promise<boolean> {
    console.log("hCaptcha solving not yet implemented");
    return false;
  }

  /**
   * Solve Cloudflare Turnstile
   */
  private async solveTurnstile(
    page: Page,
    detection: CaptchaDetection
  ): Promise<boolean> {
    console.log("Turnstile solving not yet implemented");
    return false;
  }

  /**
   * Solve image CAPTCHA using vision LLM
   */
  private async solveImageCaptcha(
    page: Page,
    detection: CaptchaDetection
  ): Promise<boolean> {
    console.log("Image CAPTCHA solving not yet implemented");
    return false;
  }

  /**
   * Check if CAPTCHA is present (static method for quick check)
   */
  static async isCaptchaPresent(page: Page): Promise<boolean> {
    const watchdog = new CaptchaWatchdog();
    const detection = await watchdog.detect(page);
    return detection !== null;
  }
}
