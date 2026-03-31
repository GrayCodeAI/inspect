// @inspect/security-scanner — Security scanning
// Split from @inspect/quality to follow Single Responsibility Principle

export { NucleiScanner, type NucleiOptions } from "./security/nuclei.js";
export { ZAPScanner, type ZAPOptions } from "./security/zap.js";
export {
  SecurityProxy,
  type SecurityProxyConfig,
  type SecurityHeaderFinding,
  type TrafficLogEntry,
} from "./security/proxy.js";
