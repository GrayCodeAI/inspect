import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ReplayableAction, CachedAction } from "./replayable-action.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STORAGE_DIR = ".inspect/action-cache";

export interface ActionReplayCacheOptions {
  readonly storageDir?: string;
  readonly ttlMs?: number;
}

export interface ActionReplayCacheStats {
  readonly total: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

export class ActionReplayCache {
  private storageDir: string;
  private ttlMs: number;
  private hits: number;
  private misses: number;

  constructor(options: ActionReplayCacheOptions = {}) {
    this.storageDir = options.storageDir ?? DEFAULT_STORAGE_DIR;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.hits = 0;
    this.misses = 0;
    mkdirSync(this.storageDir, { recursive: true });
  }

  cacheKey(instruction: string, url: string): string {
    const urlPathname = new URL(url).pathname;
    const hash = createHash("sha256")
      .update(`${instruction}:${urlPathname}`)
      .digest("hex")
      .slice(0, 16);
    return `${hash}`;
  }

  async lookup(instruction: string, url: string): Promise<CachedAction | null> {
    const key = this.cacheKey(instruction, url);
    const filePath = join(this.storageDir, `${key}.json`);

    try {
      const content = readFileSync(filePath, "utf-8");
      const cached = JSON.parse(content) as CachedAction;
      const ageMs = Date.now() - cached.timestamp;

      if (ageMs > this.ttlMs) {
        this.misses += 1;
        await this.invalidate(instruction, url);
        return null;
      }

      this.hits += 1;
      const updated: CachedAction = {
        ...cached,
        hitCount: cached.hitCount + 1,
        lastAccessed: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(updated, null, 2));
      return updated;
    } catch {
      this.misses += 1;
      return null;
    }
  }

  async store(instruction: string, url: string, action: ReplayableAction): Promise<void> {
    const key = this.cacheKey(instruction, url);
    const filePath = join(this.storageDir, `${key}.json`);

    const cached: CachedAction = {
      ...action,
      cacheKey: key,
      hitCount: 1,
      lastAccessed: Date.now(),
    };

    writeFileSync(filePath, JSON.stringify(cached, null, 2));
  }

  async invalidate(instruction: string, url: string): Promise<void> {
    const key = this.cacheKey(instruction, url);
    const filePath = join(this.storageDir, `${key}.json`);

    try {
      rmSync(filePath);
    } catch {
      // File does not exist, nothing to invalidate
    }
  }

  async clear(): Promise<void> {
    try {
      const files = readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          rmSync(join(this.storageDir, file));
        }
      }
    } catch {
      // Directory may not exist yet
    }
    this.hits = 0;
    this.misses = 0;
  }

  stats(): ActionReplayCacheStats {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;

    return {
      total,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }
}
