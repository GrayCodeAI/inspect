// ============================================================================
// LLM Response Cache + Retry — avoids duplicate calls, handles transient failures
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { LLMCall } from "./types.js";

const CACHE_DIR = join(process.cwd(), ".inspect", "cache");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function hashPrompt(messages: Array<{ role: string; content: string }>): string {
  const raw = messages.map(m => `${m.role}:${m.content}`).join("\n");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function getCachePath(hash: string): string {
  return join(CACHE_DIR, `llm-${hash}.json`);
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

/** HTTP status codes that warrant a retry */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Rate limit or server error patterns
  if (msg.includes("rate limit") || msg.includes("too many requests")) return true;
  if (msg.includes("internal server error") || msg.includes("bad gateway")) return true;
  if (msg.includes("service unavailable") || msg.includes("overloaded")) return true;
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("econnrefused")) return true;
  // Check for status code in message
  for (const status of RETRYABLE_STATUS) {
    if (msg.includes(String(status))) return true;
  }
  return false;
}

/**
 * Wrap an LLMCall with exponential backoff retry.
 * Retries on 429, 500, 502, 503, timeouts, and connection errors.
 */
export function withRetry(
  llm: LLMCall,
  options?: { maxRetries?: number; baseDelay?: number },
): LLMCall {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;

  return async (messages) => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await llm(messages);
      } catch (err: unknown) {
        lastError = err as Error;

        if (attempt >= maxRetries || !isRetryableError(err)) {
          throw err;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        // Add jitter: ±25%
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        await new Promise(r => setTimeout(r, delay + jitter));
      }
    }

    throw lastError ?? new Error("LLM call failed after retries");
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
        const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as { response: string; timestamp: number };
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
      try { unlinkSync(join(CACHE_DIR, file)); } catch {}
    }
  }
}
