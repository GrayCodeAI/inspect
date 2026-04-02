/**
 * Fallback Module - Index
 *
 * Fallback execution strategies for graceful failure recovery.
 */

export {
  FallbackService,
  DEFAULT_FALLBACK_CONFIG,
  type FallbackConfig,
  type FallbackStrategy,
  type ExecutionContext,
  type FallbackEvent,
  type RecoveryEvent,
} from "./fallback-service.js";
