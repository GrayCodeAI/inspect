// @inspect/resilience — Fault injection and toxic testing
// Split from @inspect/quality to follow Single Responsibility Principle

export { FaultInjector, type FaultConfig, type FaultStats } from "./resilience/faults.js";
export {
  LatencyToxic,
  BandwidthToxic,
  TimeoutToxic,
  DisconnectToxic,
  SlowCloseToxic,
  SlicerToxic,
  LimitDataToxic,
  createToxic,
  TOXIC_PRESETS,
  type Toxic,
} from "./resilience/toxics.js";
export { ProxyServer, TOXICITY_PRESETS } from "./resilience/proxy-server.js";
