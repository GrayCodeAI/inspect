// ============================================================================
// LLM Response Cache — avoids duplicate LLM calls across agents
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const { readdirSync, unlinkSync } = require("node:fs") as typeof import("node:fs");
  if (!existsSync(CACHE_DIR)) return;
  for (const file of readdirSync(CACHE_DIR)) {
    if (file.startsWith("llm-")) {
      try { unlinkSync(join(CACHE_DIR, file)); } catch {}
    }
  }
}
