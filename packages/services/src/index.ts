// ──────────────────────────────────────────────────────────────────────────────
// @inspect/services - Core services registry and management
// ──────────────────────────────────────────────────────────────────────────────

// Registry
export {
  type ServiceHealth,
  type ServiceDefinition,
  type ServiceEventType,
  type ServiceEvent,
  type HealthCheckResult,
  type MessageHandler,
  ServiceRegistry,
  globalRegistry,
} from "./registry.js";

// Message Bus
export {
  type MessagePriority,
  type BusMessage,
  type BusHandler,
  type BusFilter,
  MessageBus,
} from "./bus.js";

// Bootstrap
export { type ServiceBootstrapConfig, ServiceBootstrap } from "./bootstrap.js";

// API Gateway
export {
  type ApiRoute,
  type RouteHandler,
  type Middleware,
  type GatewayRequest,
  type GatewayResponse,
  ApiGateway,
} from "./gateway.js";

// Services
export {
  type LightpandaRelease,
  type LightpandaInstance,
  LightpandaManager,
} from "./services/lightpanda-manager.js";

export {
  type BatchScrapeJob,
  type BatchScrapeResult,
  type MediaAsset,
  type BatchScrapeConfig,
  type ScrapeAction,
  type ScrapeWebhookPayload,
  BatchScraper,
} from "./services/batch-scraper.js";

export {
  type CaptchaType,
  type CaptchaSolveRequest,
  type CaptchaSolveResult,
  type SwarmAgent,
  type SwarmAgentResult,
  type SwarmTask,
  CaptchaSwarmService,
  type CaptchaProvider,
} from "./services/captcha-swarm.js";

export {
  type GraphQLOperationType,
  type GraphQLRequest,
  type GraphQLResponseBuilder,
  type GraphQLMockHandler,
  type IntrospectionResult,
  GraphQLMockService,
} from "./services/graphql-mock.js";

export {
  type StoryFramework,
  type StoryDefinition,
  type StoryVariant,
  type StoryTestResult,
  type StoryTestConfig,
  StoryTestingService,
} from "./services/story-testing.js";

export {
  type ZapScanType,
  type ZapAlert,
  type ZapScanPolicy,
  type ZapScannerConfig,
  type ZapScanResult,
  type ZapAddon,
  ZAPDeepService,
  type ZapSecuritySummary,
} from "./services/zap-deep.js";

export {
  type NucleiProtocol,
  type NucleiTemplate,
  type NucleiTemplateInfo,
  type NucleiHttpRequest,
  type NucleiDnsRequest,
  type NucleiTcpRequest,
  type NucleiSslRequest,
  type NucleiNetworkRequest,
  type NucleiMatcher,
  type NucleiExtractor,
  type NucleiScanResult,
  NucleiMultiService,
} from "./services/nuclei-multi.js";

export {
  type AxeRule,
  type AxeResult,
  type AxeViolation,
  type AxePass,
  type AxeNode,
  AxeAuditService,
  type AxeAuditConfig,
  type AxeAnalysis,
} from "./services/axe-audit.js";

export {
  type TaskEnvironment,
  type TaskSetup,
  type TaskResult,
  MiniWoBEnvironments,
  WebArenaEnvironments,
  WorkArenaEnvironments,
  ALL_BENCHMARK_ENVS,
} from "./services/benchmark-env.js";
