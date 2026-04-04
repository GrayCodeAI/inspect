import { describe, it, expect } from "vitest";
import { AgentRouter } from "./router.js";
import { LLMError } from "./base.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import { DeepSeekProvider } from "./deepseek.js";
import { OllamaProvider } from "./ollama.js";

describe("AgentRouter", () => {
  const baseConfig = {
    keys: {
      anthropic: "test-anthropic-key",
      openai: "test-openai-key",
      gemini: "test-gemini-key",
      deepseek: "test-deepseek-key",
    },
  };

  describe("getProvider", () => {
    it("returns a ClaudeProvider for anthropic", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("anthropic");
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it("returns an OpenAIProvider for openai", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("openai");
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("returns a GeminiProvider for gemini", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("gemini");
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it("returns a DeepSeekProvider for deepseek", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("deepseek");
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it("returns an OllamaProvider for ollama", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("ollama");
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("uses the default model when no model is specified", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("anthropic");
      expect(provider.getModel()).toBe("claude-sonnet-4-20250514");
    });

    it("uses the specified model", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getProvider("anthropic", "claude-opus-4-20250514");
      expect(provider.getModel()).toBe("claude-opus-4-20250514");
    });

    it("uses custom default models from config", () => {
      const router = new AgentRouter({
        ...baseConfig,
        defaultModels: { anthropic: "claude-3-5-sonnet-20241022" },
      });
      const provider = router.getProvider("anthropic");
      expect(provider.getModel()).toBe("claude-3-5-sonnet-20241022");
    });

    it("caches provider instances for same name+model", () => {
      const router = new AgentRouter(baseConfig);
      const p1 = router.getProvider("anthropic");
      const p2 = router.getProvider("anthropic");
      expect(p1).toBe(p2);
    });

    it("creates different instances for different models", () => {
      const router = new AgentRouter(baseConfig);
      const p1 = router.getProvider("anthropic", "claude-sonnet-4-20250514");
      const p2 = router.getProvider("anthropic", "claude-opus-4-20250514");
      expect(p1).not.toBe(p2);
    });
  });

  describe("resolveModel", () => {
    it("resolves known aliases to the correct provider", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("claude-4-sonnet");
      expect(provider).toBeInstanceOf(ClaudeProvider);
      expect(provider.getModel()).toBe("claude-sonnet-4-20250514");
    });

    it("resolves gpt-4o alias to OpenAI", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("gpt-4o");
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.getModel()).toBe("gpt-4o");
    });

    it("resolves gemini-2.5-pro alias to Gemini", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("gemini-2.5-pro");
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it("resolves deepseek-v3 alias to DeepSeek", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("deepseek-v3");
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it("infers provider from model name prefix (claude)", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("claude-custom-model");
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it("infers provider from model name prefix (gpt)", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("gpt-4-custom");
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("infers provider from model name prefix (o3)", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("o3-mini");
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("infers provider from model name prefix (gemini)", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("gemini-unknown");
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it("defaults unknown models to ollama", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.resolveModel("llama3-custom");
      expect(provider).toBeInstanceOf(OllamaProvider);
    });
  });

  describe("getFallback", () => {
    it("returns the first available fallback provider", () => {
      const router = new AgentRouter(baseConfig);
      const fallback = router.getFallback("anthropic");
      expect(fallback).not.toBeNull();
      expect(fallback).toBeInstanceOf(OpenAIProvider);
    });

    it("skips fallbacks without API keys", () => {
      const router = new AgentRouter({
        keys: {
          anthropic: "key",
          // no openai key
          gemini: "key",
        },
      });
      const fallback = router.getFallback("anthropic");
      expect(fallback).not.toBeNull();
      expect(fallback).toBeInstanceOf(GeminiProvider);
    });

    it("returns null when no fallback has an API key", () => {
      const router = new AgentRouter({
        keys: { anthropic: "key" },
      });
      const fallback = router.getFallback("anthropic");
      expect(fallback).toBeNull();
    });

    it("returns null for ollama (no cloud fallback)", () => {
      const router = new AgentRouter(baseConfig);
      const fallback = router.getFallback("ollama");
      expect(fallback).toBeNull();
    });

    it("uses configured fallback order over defaults", () => {
      const router = new AgentRouter({
        ...baseConfig,
        fallbacks: [{ primary: "anthropic", fallbacks: ["deepseek"] }],
      });
      const fallback = router.getFallback("anthropic");
      expect(fallback).not.toBeNull();
      expect(fallback).toBeInstanceOf(DeepSeekProvider);
    });
  });

  describe("withFallback", () => {
    it("returns the primary provider result on success", async () => {
      const router = new AgentRouter(baseConfig);
      const result = await router.withFallback("anthropic", async (provider) => {
        expect(provider).toBeInstanceOf(ClaudeProvider);
        return "ok";
      });
      expect(result).toBe("ok");
    });

    it("falls back on rate limit error", async () => {
      const router = new AgentRouter(baseConfig);
      let usedFallback = false;

      const result = await router.withFallback("anthropic", async (provider) => {
        if (provider instanceof ClaudeProvider) {
          throw new LLMError("rate limited", 429);
        }
        usedFallback = true;
        return "fallback-ok";
      });

      expect(usedFallback).toBe(true);
      expect(result).toBe("fallback-ok");
    });

    it("falls back on overloaded error (529)", async () => {
      const router = new AgentRouter(baseConfig);
      let usedFallback = false;

      const result = await router.withFallback("anthropic", async (provider) => {
        if (provider instanceof ClaudeProvider) {
          throw new LLMError("overloaded", 529);
        }
        usedFallback = true;
        return "fallback-ok";
      });

      expect(usedFallback).toBe(true);
      expect(result).toBe("fallback-ok");
    });

    it("falls back on overloaded error (503)", async () => {
      const router = new AgentRouter(baseConfig);
      let usedFallback = false;

      const result = await router.withFallback("anthropic", async (provider) => {
        if (provider instanceof ClaudeProvider) {
          throw new LLMError("service unavailable", 503);
        }
        usedFallback = true;
        return "fallback-ok";
      });

      expect(usedFallback).toBe(true);
      expect(result).toBe("fallback-ok");
    });

    it("does NOT fall back on non-rate-limit errors", async () => {
      const router = new AgentRouter(baseConfig);

      await expect(
        router.withFallback("anthropic", async () => {
          throw new LLMError("server error", 500);
        }),
      ).rejects.toThrow("server error");
    });

    it("does NOT fall back on non-LLM errors", async () => {
      const router = new AgentRouter(baseConfig);

      await expect(
        router.withFallback("anthropic", async () => {
          throw new Error("generic error");
        }),
      ).rejects.toThrow("generic error");
    });

    it("re-throws if fallback also fails", async () => {
      const router = new AgentRouter(baseConfig);

      await expect(
        router.withFallback("anthropic", async () => {
          throw new LLMError("all providers down", 429);
        }),
      ).rejects.toThrow("all providers down");
    });

    it("re-throws if no fallback available", async () => {
      const router = new AgentRouter({
        keys: { ollama: "" },
      });

      await expect(
        router.withFallback("ollama", async () => {
          throw new LLMError("rate limited", 429);
        }),
      ).rejects.toThrow("rate limited");
    });
  });

  describe("getAllProviders", () => {
    it("lists all five providers", () => {
      const router = new AgentRouter(baseConfig);
      const providers = router.getAllProviders();
      expect(providers).toHaveLength(5);
    });

    it("marks providers with keys as available", () => {
      const router = new AgentRouter(baseConfig);
      const providers = router.getAllProviders();
      const anthropic = providers.find((p) => p.name === "anthropic");
      expect(anthropic?.available).toBe(true);
    });

    it("marks providers without keys as unavailable", () => {
      const router = new AgentRouter({ keys: {} });
      const providers = router.getAllProviders();
      const anthropic = providers.find((p) => p.name === "anthropic");
      expect(anthropic?.available).toBe(false);
    });

    it("always marks ollama as available (no key required)", () => {
      const router = new AgentRouter({ keys: {} });
      const providers = router.getAllProviders();
      const ollama = providers.find((p) => p.name === "ollama");
      expect(ollama?.available).toBe(true);
    });

    it("includes default model for each provider", () => {
      const router = new AgentRouter(baseConfig);
      const providers = router.getAllProviders();
      for (const p of providers) {
        expect(p.model).toBeTruthy();
        expect(typeof p.model).toBe("string");
      }
    });

    it("uses custom default models when configured", () => {
      const router = new AgentRouter({
        ...baseConfig,
        defaultModels: { anthropic: "my-custom-model" },
      });
      const providers = router.getAllProviders();
      const anthropic = providers.find((p) => p.name === "anthropic");
      expect(anthropic?.model).toBe("my-custom-model");
    });
  });

  describe("getDefault", () => {
    it("returns the configured default provider", () => {
      const router = new AgentRouter({
        ...baseConfig,
        defaultProvider: "openai",
      });
      const provider = router.getDefault();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("infers default provider by priority when not configured", () => {
      const router = new AgentRouter(baseConfig);
      const provider = router.getDefault();
      // anthropic has highest priority
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it("falls back to ollama when no keys configured", () => {
      const router = new AgentRouter({ keys: {} });
      const provider = router.getDefault();
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("picks the highest-priority provider with a key", () => {
      const router = new AgentRouter({
        keys: { gemini: "key", deepseek: "key" },
      });
      const provider = router.getDefault();
      expect(provider).toBeInstanceOf(GeminiProvider);
    });
  });

  describe("baseUrls", () => {
    it("passes custom base URL to provider", () => {
      const router = new AgentRouter({
        ...baseConfig,
        baseUrls: { anthropic: "https://custom.anthropic.proxy" },
      });
      // Can't directly inspect private baseUrl, but the provider is created
      const provider = router.getProvider("anthropic");
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });
  });
});
