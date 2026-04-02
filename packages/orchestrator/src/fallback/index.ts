/**
 * Fallback Module - Index
 *
 * Fallback execution strategies for graceful failure recovery.
 */

export {
  FallbackService,
  DEFAULT_STRATEGIES,
  DEFAULT_FALLBACK_CONFIG,
  type FallbackConfig,
  type FallbackStrategy,
  type ExecutionContext,
  type FallbackEvent,
  type RecoveryEvent,
  createFallbackService,
} from "./fallback-service";
