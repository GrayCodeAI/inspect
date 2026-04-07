import { Effect, Schema, ServiceMap } from "effect";

const DEFAULT_CACHE_TTL_MS = 1000;

export class DOMCacheEntry extends Schema.Class<DOMCacheEntry>("DOMCacheEntry")({
  html: Schema.String,
  hash: Schema.String,
  timestamp: Schema.Number,
  url: Schema.String,
}) {}

export class DOMCacheConfig extends Schema.Class<DOMCacheConfig>("DOMCacheConfig")({
  enabled: Schema.Boolean,
  ttlMs: Schema.optional(Schema.Number),
  maxEntries: Schema.optional(Schema.Number),
}) {}

export class DOMCache extends ServiceMap.Service<DOMCache>()("@browser/DOMCache", {
  make: Effect.gen(function* () {
    const config = new DOMCacheConfig({
      enabled: true,
      ttlMs: DEFAULT_CACHE_TTL_MS,
      maxEntries: 10,
    });

    type CacheEntry = {
      html: string;
      hash: string;
      timestamp: number;
      url: string;
    };

    const cache = new Map<string, CacheEntry>();
    let hitCount = 0;
    let missCount = 0;

    const isValid = (entry: CacheEntry, url: string, ttlMs: number): boolean => {
      if (!entry) return false;
      if (entry.url !== url) return false;
      return Date.now() - entry.timestamp < ttlMs;
    };

    const get = Effect.fn("DOMCache.get")(function* (pageId: string, url: string) {
      const ttlMs = config.ttlMs ?? DEFAULT_CACHE_TTL_MS;
      const entry = cache.get(pageId);

      if (isValid(entry as CacheEntry, url, ttlMs)) {
        hitCount++;
        yield* Effect.logDebug("DOM cache hit", { pageId, url });
        return entry as CacheEntry | undefined;
      }

      missCount++;
      yield* Effect.logDebug("DOM cache miss", { pageId, url });
      cache.delete(pageId);
      return undefined;
    });

    const set = Effect.fn("DOMCache.set")(function* (
      pageId: string,
      url: string,
      html: string,
      hash: string,
    ) {
      const _ttlMs = config.ttlMs ?? DEFAULT_CACHE_TTL_MS;
      const maxEntries = config.maxEntries ?? 10;

      if (cache.size >= maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
          cache.delete(oldestKey);
          yield* Effect.logDebug("Evicted oldest DOM cache entry", { pageId: oldestKey });
        }
      }

      const entry: CacheEntry = {
        html,
        hash,
        timestamp: Date.now(),
        url,
      };

      cache.set(pageId, entry);
      yield* Effect.logDebug("DOM cache set", { pageId, url, htmlLength: html.length });
    });

    const invalidate = Effect.fn("DOMCache.invalidate")(function* (pageId: string, reason: string) {
      const existed = cache.has(pageId);
      cache.delete(pageId);
      yield* Effect.logInfo("DOM cache invalidated", { pageId, reason });
      return existed;
    });

    const invalidateAll = Effect.fn("DOMCache.invalidateAll")(function* (reason: string) {
      const count = cache.size;
      cache.clear();
      yield* Effect.logInfo("DOM cache invalidated all", { reason, count });
    });

    const getStats = Effect.fn("DOMCache.getStats")(function* () {
      const total = hitCount + missCount;
      const hitRate = total > 0 ? (hitCount / total) * 100 : 0;
      return {
        size: cache.size,
        hitCount,
        missCount,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    });

    return {
      config,
      get,
      set,
      invalidate,
      invalidateAll,
      getStats,
    } as const;
  }),
}) {}
