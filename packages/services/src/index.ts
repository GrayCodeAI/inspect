// ──────────────────────────────────────────────────────────────────────────────
// @inspect/services - Microservice Architecture for All 16 OSS-REF Integrations
// ──────────────────────────────────────────────────────────────────────────────

// Core Infrastructure
export {
  ServiceRegistry,
  globalRegistry,
  type ServiceDefinition,
  type ServiceHealth,
  type ServiceEvent,
  type ServiceEventType,
  type HealthCheckResult,
} from "./registry.js";
export {
  ApiGateway,
  type ApiRoute,
  type RouteHandler,
  type Middleware,
  type GatewayRequest,
  type GatewayResponse,
} from "./gateway.js";
export {
  MessageBus,
  type BusMessage,
  type BusHandler,
  type BusFilter,
  type MessagePriority,
} from "./bus.js";

// Service 1: axe-core Deep Integration
export {
  AxeAuditService,
  type AxeRule,
  type AxeResult,
  type AxeViolation,
  type AxePass,
  type AxeNode,
  type AxeAuditConfig,
  type AxeAnalysis,
} from "./services/axe-audit.js";

// Service 2: BrowserGym Real Benchmark Environments
export {
  MiniWoBEnvironments,
  WebArenaEnvironments,
  WorkArenaEnvironments,
  ALL_BENCHMARK_ENVS,
  type TaskEnvironment,
  type TaskSetup,
  type TaskResult,
} from "./services/benchmark-env.js";

// Service 3: Firecrawl Batch & Media Scraping
export {
  BatchScraper,
  type BatchScrapeJob,
  type BatchScrapeResult,
  type MediaAsset,
  type BatchScrapeConfig,
  type ScrapeAction,
  type ScrapeWebhookPayload,
} from "./services/batch-scraper.js";

// Service 4: MSW Deep GraphQL Mocking
export {
  GraphQLMockService,
  type GraphQLRequest,
  type GraphQLResponseBuilder,
  type GraphQLMockHandler,
  type IntrospectionResult,
} from "./services/graphql-mock.js";

// Service 5: Nuclei Multi-Protocol Scanning
export {
  NucleiMultiService,
  type NucleiTemplate,
  type NucleiTemplateInfo,
  type NucleiProtocol,
  type NucleiHttpRequest,
  type NucleiDnsRequest,
  type NucleiTcpRequest,
  type NucleiSslRequest,
  type NucleiMatcher,
  type NucleiExtractor,
  type NucleiScanResult,
} from "./services/nuclei-multi.js";

// Service 6: ZAP Deep Integration
export {
  ZAPDeepService,
  type ZapAlert,
  type ZapScanType,
  type ZapScanPolicy,
  type ZapScannerConfig,
  type ZapScanResult,
  type ZapAddon,
  type ZapSecuritySummary,
} from "./services/zap-deep.js";

// Service 7: CAPTCHA Solving & Multi-Agent Swarm
export {
  CaptchaSwarmService,
  type CaptchaType,
  type CaptchaSolveRequest,
  type CaptchaSolveResult,
  type CaptchaProvider,
  type SwarmAgent,
  type SwarmAgentResult,
  type SwarmTask,
} from "./services/captcha-swarm.js";

// Service 8: Ladle/Histoire Story Testing
export {
  StoryTestingService,
  type StoryFramework,
  type StoryDefinition,
  type StoryVariant,
  type StoryTestResult,
  type StoryTestConfig,
} from "./services/story-testing.js";

// Service 9: Lightpanda Binary Management
export {
  LightpandaManager,
  type LightpandaRelease,
  type LightpandaInstance,
} from "./services/lightpanda-manager.js";

// Service Bootstrap — wires all services to infrastructure
export {
  ServiceBootstrap,
  type ServiceBootstrapConfig,
} from "./bootstrap.js";
