// @inspect/devices — Device presets and device pool
// Split from @inspect/core to follow Single Responsibility Principle

export {
  DevicePresets,
  getPreset,
  listPresets,
  resolveDevices,
  getPresetsByCategory,
} from "./devices/presets.js";
export type { DeviceConfig } from "./devices/presets.js";

export { DevicePool } from "./devices/pool.js";
export type { DeviceRunResult } from "./devices/pool.js";
