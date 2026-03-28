// ============================================================================
// LLM Response Cache + Retry — avoids duplicate calls, handles transient failures
// ============================================================================

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { RetryExecutor } from "@inspect/core";
import type { LLMCall } from "./types.js";

const CACHE_DIR = join(process.cwd(), ".inspect", "cache");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function hashPrompt(messages: Array<{ role: string; content: string }>): string {
  const raw = messages.map((m) => `${m.role}:${m.content}`).join("\n");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function getCachePath(hash: string): string {
  return join(CACHE_DIR, `llm-${hash}.json`);
}

// ---------------------------------------------------------------------------
// Retry wrapper (uses RetryExecutor from @inspect/core)
// ---------------------------------------------------------------------------

/** Error patterns that warrant a retry */
const RETRYABLE_PATTERNS = [
  "rate limit",
  "too many requests",
  "429",
  "internal server error",
  "bad gateway",
  "500",
  "502",
  "service unavailable",
  "overloaded",
  "503",
  "529",
  "timeout",
  "econnreset",
  "econnrefused",
];

/**
 * Wrap an LLMCall with exponential backoff retry.
 * Delegates to RetryExecutor from @inspect/core.
 */
export function withRetry(
  llm: LLMCall,
  options?: { maxRetries?: number; baseDelay?: number },
): LLMCall {
  const executor = new RetryExecutor({
    maxRetries: options?.maxRetries ?? 3,
    strategy: "exponential",
    baseDelayMs: options?.baseDelay ?? 1000,
    maxDelayMs: 30_000,
    jitter: 0.25,
    retryOn: RETRYABLE_PATTERNS,
  });

  return async (messages) => {
    const result = await executor.execute(() => llm(messages));
    if (result.success) {
      return result.result!;
    }
    throw new Error(result.error ?? "LLM call failed after retries");
  };
}

// ---------------------------------------------------------------------------
// Cache wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an LLMCall with a disk-based cache.
 * Identical prompts return cached responses instead of calling the LLM again.
 */
export function withCache(llm: LLMCall, options?: { enabled?: boolean; ttl?: number }): LLMCall {
  const enabled = options?.enabled ?? true;
  const ttl = options?.ttl ?? 3600_000; // 1 hour default

  if (!enabled) return llm;

  ensureCacheDir();

  return async (messages) => {
    const hash = hashPrompt(messages);
    const cachePath = getCachePath(hash);

    // Check cache
    if (existsSync(cachePath)) {
      try {
        const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as {
          response: string;
          timestamp: number;
        };
        if (Date.now() - cached.timestamp < ttl) {
          return cached.response;
        }
      } catch {
        // Corrupted cache entry — call LLM
      }
    }

    // Call LLM and cache result
    const response = await llm(messages);

    try {
      writeFileSync(cachePath, JSON.stringify({ response, timestamp: Date.now() }));
    } catch {
      // Cache write failed — non-fatal
    }

    return response;
  };
}

/** Clear all cached LLM responses */
export function clearCache(): void {
  if (!existsSync(CACHE_DIR)) return;
  for (const file of readdirSync(CACHE_DIR)) {
    if (file.startsWith("llm-")) {
      try {
        unlinkSync(join(CACHE_DIR, file));
      } catch {}
    }
  }
}
