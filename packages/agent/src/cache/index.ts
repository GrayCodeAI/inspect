/**
 * Action Cache Module
 *
 * Caches successful actions by hash(instruction + DOM state)
 * for replay without LLM calls.
 */

export {
  ActionCache,
  type CachedAction,
  type Action,
  type CacheConfig,
  type CacheHit,
  type CacheStats,
  type ElementSignature,
  type ReplayableAction,
  DEFAULT_CACHE_CONFIG,
} from "./action-cache";
