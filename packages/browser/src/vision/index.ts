/**
 * Vision Module
 *
 * Vision-first page understanding with annotated screenshots
 * and coordinate-based interaction for Computer Use API.
 */

export {
  AnnotatedScreenshot,
  type AnnotatedScreenshotOptions,
  type AnnotatedElement,
  type AnnotatedScreenshotResult,
} from "./annotated-screenshot";

export {
  CoordinateTransformer,
  CUAActionExecutor,
  elementIndexToCoordinate,
  validateCoordinates,
  type CoordinateConfig,
  type NormalizedCoordinate,
  type CoordinateMapping,
  type ElementInfo,
  DEFAULT_COORDINATE_CONFIG,
} from "./coordinate-interaction";
