import { describe, it, expect } from "vitest";
import {
  DEVICE_PRESETS,
  SUPPORTED_MODELS,
  DEFAULT_VIEWPORT,
  DEFAULT_TIMEOUT,
  DEFAULT_NAVIGATION_TIMEOUT,
  DEFAULT_MAX_STEPS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MAX_RETRIES,
  VERSION,
  PACKAGE_NAME,
  CONFIG_FILE_NAME,
  A11Y_STANDARDS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_BROWSER_CONFIG,
  SENSITIVE_DATA_PATTERNS,
  ENV_VARS,
} from "./defaults.js";

describe("DEFAULT_VIEWPORT", () => {
  it("has valid width and height", () => {
    expect(DEFAULT_VIEWPORT.width).toBe(1280);
    expect(DEFAULT_VIEWPORT.height).toBe(720);
  });

  it("has positive dimensions", () => {
    expect(DEFAULT_VIEWPORT.width).toBeGreaterThan(0);
    expect(DEFAULT_VIEWPORT.height).toBeGreaterThan(0);
  });
});

describe("DEVICE_PRESETS", () => {
  const deviceNames = Object.keys(DEVICE_PRESETS);

  it("has at least 20 devices", () => {
    expect(deviceNames.length).toBeGreaterThanOrEqual(20);
  });

  it("contains expected device categories (iPhone, iPad, Pixel, desktop)", () => {
    expect(deviceNames.some((d) => d.startsWith("iphone-"))).toBe(true);
    expect(deviceNames.some((d) => d.startsWith("ipad-"))).toBe(true);
    expect(deviceNames.some((d) => d.startsWith("pixel-"))).toBe(true);
    expect(deviceNames.some((d) => d.startsWith("desktop-"))).toBe(true);
    expect(deviceNames.some((d) => d.startsWith("samsung-"))).toBe(true);
  });

  it.each(deviceNames)("%s has all required fields", (name) => {
    const preset = DEVICE_PRESETS[name];
    expect(preset.name).toBeTruthy();
    expect(preset.width).toBeGreaterThan(0);
    expect(preset.height).toBeGreaterThan(0);
    expect(preset.dpr).toBeGreaterThan(0);
    expect(typeof preset.userAgent).toBe("string");
    expect(preset.userAgent.length).toBeGreaterThan(0);
    expect(typeof preset.touch).toBe("boolean");
    expect(typeof preset.mobile).toBe("boolean");
    expect(typeof preset.platform).toBe("string");
  });

  it("mobile devices have touch enabled", () => {
    for (const [, preset] of Object.entries(DEVICE_PRESETS)) {
      if (preset.mobile) {
        expect(preset.touch).toBe(true);
      }
    }
  });

  it("desktop devices are not mobile", () => {
    for (const [key, preset] of Object.entries(DEVICE_PRESETS)) {
      if (key.startsWith("desktop-")) {
        expect(preset.mobile).toBe(false);
        expect(preset.touch).toBe(false);
      }
    }
  });
});

describe("SUPPORTED_MODELS", () => {
  const modelKeys = Object.keys(SUPPORTED_MODELS);

  it("has entries for multiple providers", () => {
    const providers = new Set(Object.values(SUPPORTED_MODELS).map((m) => m.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("google")).toBe(true);
    expect(providers.has("deepseek")).toBe(true);
  });

  it("has at least 10 models", () => {
    expect(modelKeys.length).toBeGreaterThanOrEqual(10);
  });

  it.each(modelKeys)("%s has required fields", (key) => {
    const model = SUPPORTED_MODELS[key];
    expect(model.id).toBeTruthy();
    expect(model.provider).toBeTruthy();
    expect(model.name).toBeTruthy();
    expect(model.contextWindow).toBeGreaterThan(0);
    expect(model.maxOutput).toBeGreaterThan(0);
    expect(typeof model.supportsVision).toBe("boolean");
    expect(typeof model.supportsThinking).toBe("boolean");
    expect(typeof model.supportsFunctionCalling).toBe("boolean");
    expect(model.costPer1kInput).toBeGreaterThanOrEqual(0);
    expect(model.costPer1kOutput).toBeGreaterThanOrEqual(0);
  });
});

describe("timeout constants", () => {
  it("DEFAULT_TIMEOUT is 30 seconds", () => {
    expect(DEFAULT_TIMEOUT).toBe(30_000);
  });

  it("DEFAULT_NAVIGATION_TIMEOUT is 60 seconds", () => {
    expect(DEFAULT_NAVIGATION_TIMEOUT).toBe(60_000);
  });
});

describe("agent constants", () => {
  it("DEFAULT_MAX_STEPS is a positive integer", () => {
    expect(DEFAULT_MAX_STEPS).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_MAX_STEPS)).toBe(true);
  });

  it("DEFAULT_TEMPERATURE is 0", () => {
    expect(DEFAULT_TEMPERATURE).toBe(0);
  });

  it("DEFAULT_MAX_TOKENS is a positive integer", () => {
    expect(DEFAULT_MAX_TOKENS).toBeGreaterThan(0);
  });

  it("MAX_RETRIES is a positive integer", () => {
    expect(MAX_RETRIES).toBeGreaterThan(0);
  });
});

describe("meta constants", () => {
  it("VERSION is a semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("PACKAGE_NAME is 'inspect'", () => {
    expect(PACKAGE_NAME).toBe("inspect");
  });

  it("CONFIG_FILE_NAME is 'inspect.config.ts'", () => {
    expect(CONFIG_FILE_NAME).toBe("inspect.config.ts");
  });
});

describe("default configs", () => {
  it("DEFAULT_LLM_PROVIDER has anthropic as the name", () => {
    expect(DEFAULT_LLM_PROVIDER.name).toBe("anthropic");
    expect(DEFAULT_LLM_PROVIDER.model).toContain("claude");
  });

  it("DEFAULT_AGENT_CONFIG has expected mode", () => {
    expect(DEFAULT_AGENT_CONFIG.mode).toBe("hybrid");
    expect(DEFAULT_AGENT_CONFIG.maxSteps).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_CONFIG.planningEnabled).toBe(true);
  });

  it("DEFAULT_BROWSER_CONFIG defaults to headless chromium", () => {
    expect(DEFAULT_BROWSER_CONFIG.headless).toBe(true);
    expect(DEFAULT_BROWSER_CONFIG.backend).toBe("chromium");
  });
});

describe("A11Y_STANDARDS", () => {
  it("includes wcag2aa", () => {
    expect(A11Y_STANDARDS).toContain("wcag2aa");
  });

  it("has at least 5 standards", () => {
    expect(A11Y_STANDARDS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("SENSITIVE_DATA_PATTERNS", () => {
  it("has patterns for SSN, credit card, email, phone, and API key", () => {
    expect(SENSITIVE_DATA_PATTERNS.SSN).toBeInstanceOf(RegExp);
    expect(SENSITIVE_DATA_PATTERNS.CREDIT_CARD).toBeInstanceOf(RegExp);
    expect(SENSITIVE_DATA_PATTERNS.EMAIL).toBeInstanceOf(RegExp);
    expect(SENSITIVE_DATA_PATTERNS.PHONE_US).toBeInstanceOf(RegExp);
    expect(SENSITIVE_DATA_PATTERNS.API_KEY).toBeInstanceOf(RegExp);
  });
});

describe("ENV_VARS", () => {
  it("has entries for major API keys", () => {
    expect(ENV_VARS.ANTHROPIC_API_KEY).toBe("ANTHROPIC_API_KEY");
    expect(ENV_VARS.OPENAI_API_KEY).toBe("OPENAI_API_KEY");
    expect(ENV_VARS.GOOGLE_API_KEY).toBe("GOOGLE_API_KEY");
  });
});
