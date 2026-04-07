// ──────────────────────────────────────────────────────────────────────────────
// @inspect/resilience - Fault injection and resilience testing
// ──────────────────────────────────────────────────────────────────────────────

export { ProxyServer, TOXICITY_PRESETS } from "./resilience/proxy-server.js";
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
} from "./resilience/toxics.js";
export { FaultInjector, type FaultConfig } from "./resilience/faults.js";
