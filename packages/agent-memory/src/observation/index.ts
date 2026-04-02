/**
 * Observation Module - Index
 *
 * Structured observation management with retention policies.
 */

export {
  ObservationSystem,
  InMemoryObservationStorage,
  DEFAULT_OBSERVATION_CONFIG,
  type ObservationConfig,
  type Observation,
  type ObservationType,
  type StructuredData,
  type ObservationMetadata,
  type RetentionPolicy,
  type ObservationStorage,
  type ObservationSummary,
  createObservationSystem,
} from "./observation-system";
