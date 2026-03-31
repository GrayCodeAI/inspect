// @inspect/chaos — Chaos engineering
// Split from @inspect/quality to follow Single Responsibility Principle

export { ChaosEngine, type ChaosOptions } from "./chaos/gremlins.js";
export {
  ClickerGremlin,
  TyperGremlin,
  ScrollerGremlin,
  FormFillerGremlin,
  ToucherGremlin,
  GREMLIN_REGISTRY,
  createGremlin,
  type Gremlin,
  type GremlinInjectionOptions,
} from "./chaos/species.js";
export {
  FPS_MONITOR_SCRIPT,
  FPS_MONITOR_STOP_SCRIPT,
  ERROR_MONITOR_SCRIPT,
  ERROR_MONITOR_RESULTS_SCRIPT,
  ALERT_MONITOR_SCRIPT,
  type FPSMonitorResult,
  type ErrorMonitorResult,
  type AlertMonitorResult,
} from "./chaos/monitors.js";
