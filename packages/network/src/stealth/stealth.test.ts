import { describe, it, expect } from "vitest";
import { StealthEngine } from "./stealth.js";

describe("StealthEngine", () => {
  describe("constructor", () => {
    it("should create engine with config", () => {
      const engine = new StealthEngine({ enabled: true });
      expect(engine).toBeDefined();
    });
  });

  describe("getInitScripts", () => {
    it("should include webdriver override by default", () => {
      const engine = new StealthEngine({ enabled: true });
      const scripts = engine.getInitScripts();
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.some((s) => s.includes("webdriver"))).toBe(true);
    });

    it("should include fingerprint overrides when configured", () => {
      const engine = new StealthEngine({
        enabled: true,
        fingerprint: {
          webgl: { vendor: "Test", renderer: "Test" },
        },
      });
      const scripts = engine.getInitScripts();
      expect(scripts.some((s) => s.includes("WebGL"))).toBe(true);
    });

    it("should include canvas fingerprint override", () => {
      const engine = new StealthEngine({
        enabled: true,
        fingerprint: { canvas: true },
      });
      const scripts = engine.getInitScripts();
      expect(scripts.some((s) => s.includes("toDataURL"))).toBe(true);
    });

    it("should disable WebRTC when configured", () => {
      const engine = new StealthEngine({
        enabled: true,
        fingerprint: { webrtc: "disabled" },
      });
      const scripts = engine.getInitScripts();
      expect(scripts.some((s) => s.includes("RTCPeerConnection"))).toBe(true);
    });

    it("should include permissions override when configured", () => {
      const engine = new StealthEngine({
        enabled: true,
        spoofPermissions: true,
      });
      const scripts = engine.getInitScripts();
      expect(scripts.some((s) => s.includes("permissions"))).toBe(true);
    });

    it("should include custom init scripts", () => {
      const engine = new StealthEngine({
        enabled: true,
        initScripts: ["console.log('stealth')"],
      });
      const scripts = engine.getInitScripts();
      expect(scripts).toContain("console.log('stealth')");
    });
  });

  describe("getNextUserAgent", () => {
    it("should return a user agent string", () => {
      const engine = new StealthEngine({ enabled: true });
      const ua = engine.getNextUserAgent();
      expect(ua).toContain("Mozilla");
      expect(ua).toContain("AppleWebKit");
    });

    it("should rotate through user agents", () => {
      const engine = new StealthEngine({
        enabled: true,
        headers: { rotateUserAgent: true },
      });
      const ua1 = engine.getNextUserAgent();
      const ua2 = engine.getNextUserAgent();
      // May be same if pool is small, but should not throw
      expect(typeof ua1).toBe("string");
      expect(typeof ua2).toBe("string");
    });
  });

  describe("getStealthHeaders", () => {
    it("should return empty headers when no config", () => {
      const engine = new StealthEngine({ enabled: true });
      const headers = engine.getStealthHeaders();
      expect(typeof headers).toBe("object");
    });

    it("should include User-Agent when rotation enabled", () => {
      const engine = new StealthEngine({
        enabled: true,
        headers: { rotateUserAgent: true },
      });
      const headers = engine.getStealthHeaders();
      expect(headers["User-Agent"]).toBeDefined();
    });

    it("should include client hints when configured", () => {
      const engine = new StealthEngine({
        enabled: true,
        headers: { addClientHints: true },
      });
      const headers = engine.getStealthHeaders();
      expect(headers["sec-ch-ua"]).toBeDefined();
    });

    it("should include accept headers when configured", () => {
      const engine = new StealthEngine({
        enabled: true,
        headers: { addAcceptHeaders: true },
      });
      const headers = engine.getStealthHeaders();
      expect(headers["Accept"]).toBeDefined();
      expect(headers["sec-fetch-dest"]).toBe("document");
    });
  });

  describe("detectCaptcha", () => {
    it("should detect reCAPTCHA", () => {
      const html = '<div class="g-recaptcha" data-sitekey="xxx"></div>';
      const result = StealthEngine.detectCaptcha(html);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("recaptcha");
    });

    it("should detect hCaptcha", () => {
      const html = '<div class="h-captcha"></div>';
      const result = StealthEngine.detectCaptcha(html);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("hcaptcha");
    });

    it("should detect Cloudflare challenge", () => {
      const html = '<div id="cf-challenge-running">Checking...</div>';
      const result = StealthEngine.detectCaptcha(html);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("cloudflare");
    });

    it("should return not detected for clean page", () => {
      const html = "<html><body>Hello World</body></html>";
      const result = StealthEngine.detectCaptcha(html);
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("fromPreset", () => {
    it("should create minimal preset", () => {
      const config = StealthEngine.fromPreset("minimal");
      expect(config.enabled).toBe(true);
      expect(config.disableWebdriverDetection).toBe(true);
    });

    it("should create balanced preset", () => {
      const config = StealthEngine.fromPreset("balanced");
      expect(config.enabled).toBe(true);
      expect(config.headers?.rotateUserAgent).toBe(true);
      expect(config.fingerprint?.canvas).toBe(true);
    });

    it("should create aggressive preset", () => {
      const config = StealthEngine.fromPreset("aggressive");
      expect(config.enabled).toBe(true);
      expect(config.spoofPermissions).toBe(true);
      expect(config.fingerprint?.webrtc).toBe("disabled");
      expect(config.fingerprint?.navigator?.hardwareConcurrency).toBeDefined();
    });
  });
});
