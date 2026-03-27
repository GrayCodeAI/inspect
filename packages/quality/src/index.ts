// ============================================================================
// @inspect/quality - Quality & Testing Toolkit
// ============================================================================

// Accessibility
export { AccessibilityAuditor, type A11yAuditOptions } from "./a11y/auditor.js";
export {
  A11Y_RULES,
  ALL_A11Y_RULES,
  getRulesByTag,
  getRulesByImpact,
  getRulesByCategory,
  getRuleById,
  type A11yRuleDefinition,
} from "./a11y/rules.js";
export {
  SitemapAuditor,
  type SitemapAuditOptions,
  type SitemapAuditResult,
} from "./a11y/sitemap.js";

// Lighthouse
export {
  LighthouseAuditor,
  type LighthouseOptions,
  type LighthouseBudget,
} from "./lighthouse/auditor.js";
export {
  BudgetManager,
  BUDGET_PRESETS,
  type BudgetThreshold,
  type BudgetAssertionResult,
  type BudgetCheckResult,
} from "./lighthouse/budgets.js";
export { ScoreHistory, type ScoreEntry, type ScoreTrend } from "./lighthouse/history.js";

// Chaos Testing
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

// Security
export { NucleiScanner, type NucleiOptions } from "./security/nuclei.js";
export { ZAPScanner, type ZAPOptions } from "./security/zap.js";
export {
  SecurityProxy,
  type SecurityProxyConfig,
  type SecurityHeaderFinding,
  type TrafficLogEntry,
} from "./security/proxy.js";

// Mocking
export {
  NetworkInterceptor,
  type InterceptorOptions,
  type InterceptedRequest,
} from "./mocking/interceptor.js";
export {
  rest,
  graphql,
  response,
  HttpResponse,
  delay,
  passthrough,
  isPassthrough,
  matchUrl,
  parseQuery,
  parseGraphQLOperation,
  type MockHandler,
  type MockRequest,
  type MockResponse,
  type HandlerFn,
} from "./mocking/handlers.js";
export { MockGenerator } from "./mocking/generators.js";
export { FakeData } from "./mocking/faker.js";

// Resilience / Fault Injection
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

// WebSocket Mocking
export {
  ws,
  WsMockBuilder,
  WsHandlerBuilder,
  WsMessageMatcher,
  MockWsConnection,
  WsRecorder,
  type WsMessageHandlerFn,
} from "./mocking/ws.js";
