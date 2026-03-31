import { createLogger } from "@inspect/core";
import { ServiceRegistry, globalRegistry } from "./registry.js";
import { ApiGateway } from "./gateway.js";
import { MessageBus } from "./bus.js";
import type { ServiceDefinition } from "./registry.js";

const logger = createLogger("services/bootstrap");

export interface ServiceBootstrapConfig {
  /** Enable health check polling (default: true) */
  healthChecks?: boolean;
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number;
  /** Which services to register (default: all) */
  services?: string[];
}

/** Service metadata + instance for wiring */
interface ServiceRegistration {
  definition: ServiceDefinition;
  instance?: Record<string, unknown>;
  routes?: Array<{
    method: string;
    path: string;
    handler: (req: unknown, res: unknown) => Promise<void>;
  }>;
  busTopics?: string[];
}

/**
 * ServiceBootstrap wires all @inspect/services together:
 * - Registers services with ServiceRegistry
 * - Instantiates service classes and stores them for retrieval
 * - Subscribes services to relevant MessageBus topics
 * - Exposes services through ApiGateway routes
 */
export class ServiceBootstrap {
  private registry: ServiceRegistry;
  private gateway: ApiGateway;
  private bus: MessageBus;
  private config: ServiceBootstrapConfig;
  private started = false;
  private instances: Map<string, unknown> = new Map();

  constructor(
    registry?: ServiceRegistry,
    gateway?: ApiGateway,
    bus?: MessageBus,
    config: ServiceBootstrapConfig = {},
  ) {
    this.registry = registry ?? globalRegistry;
    this.gateway = gateway ?? new ApiGateway(this.registry);
    this.bus = bus ?? new MessageBus();
    this.config = {
      healthChecks: config.healthChecks ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };
  }

  /**
   * Bootstrap all services. Call once at application startup.
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn("ServiceBootstrap already started");
      return;
    }

    logger.info("Starting service bootstrap");

    // Define all service registrations with their wiring info
    const serviceRegistrations: ServiceRegistration[] = [
      {
        definition: {
          name: "axe-audit",
          version: "1.0.0",
          description: "axe-core WCAG accessibility auditing",
          endpoint: "/services/axe-audit",
          capabilities: ["accessibility", "wcag", "axe-core"],
          dependencies: [],
          metadata: { provider: "Deque" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.audit.accessibility"],
      },
      {
        definition: {
          name: "batch-scraper",
          version: "1.0.0",
          description: "Async batch web scraping with media extraction",
          endpoint: "/services/batch-scraper",
          capabilities: ["scraping", "crawl", "media-extraction"],
          dependencies: [],
          metadata: { provider: "Firecrawl" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.scrape.batch"],
      },
      {
        definition: {
          name: "graphql-mock",
          version: "1.0.0",
          description: "Deep GraphQL operation-level mocking",
          endpoint: "/services/graphql-mock",
          capabilities: ["mocking", "graphql", "testing"],
          dependencies: [],
          metadata: { provider: "MSW" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.mock.graphql"],
      },
      {
        definition: {
          name: "nuclei-multi",
          version: "1.0.0",
          description: "Multi-protocol vulnerability scanning",
          endpoint: "/services/nuclei-multi",
          capabilities: ["security", "scanning", "dns", "tcp", "ssl", "http"],
          dependencies: [],
          metadata: { provider: "ProjectDiscovery" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.scan.vulnerability"],
      },
      {
        definition: {
          name: "zap-deep",
          version: "1.0.0",
          description: "OWASP ZAP deep web application security scanning",
          endpoint: "/services/zap-deep",
          capabilities: ["security", "owasp", "spider", "active-scan"],
          dependencies: [],
          metadata: { provider: "OWASP" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.scan.owasp"],
      },
      {
        definition: {
          name: "captcha-swarm",
          version: "1.0.0",
          description: "CAPTCHA solving with multi-agent browser swarm",
          endpoint: "/services/captcha-swarm",
          capabilities: ["captcha", "multi-agent", "solving"],
          dependencies: [],
          metadata: { provider: "Skyvern" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.captcha.solve"],
      },
      {
        definition: {
          name: "story-testing",
          version: "1.0.0",
          description: "Visual regression testing across Storybook/Ladle/Histoire",
          endpoint: "/services/story-testing",
          capabilities: ["visual-regression", "storybook", "ladle"],
          dependencies: [],
          metadata: { provider: "LostPixel" },
          health: "healthy",
          registeredAt: Date.now(),
        },
        busTopics: ["services.test.story"],
      },
      {
        definition: {
          name: "lightpanda",
          version: "1.0.0",
          description: "Lightpanda headless browser binary management",
          endpoint: "/services/lightpanda",
          capabilities: ["browser", "headless", "cdp"],
          dependencies: [],
          metadata: {},
          health: "unknown",
          registeredAt: Date.now(),
        },
        busTopics: ["services.browser.lightpanda"],
      },
    ];

    // Register each service: metadata + instance + bus wiring + gateway routes
    for (const reg of serviceRegistrations) {
      await this.registerAndWire(reg);
    }

    // Start health checks
    if (this.config.healthChecks) {
      this.registry.startHealthChecks(this.config.healthCheckInterval);
    }

    // Wire message bus for system events
    this.wireMessageBus();

    this.started = true;
    const status = this.registry.getStatus();
    logger.info("Service bootstrap complete", status);
  }

  /**
   * Gracefully stop all services.
   */
  async stop(): Promise<void> {
    this.registry.stopHealthChecks();
    this.started = false;
    logger.info("Service bootstrap stopped");
  }

  getRegistry(): ServiceRegistry {
    return this.registry;
  }

  getGateway(): ApiGateway {
    return this.gateway;
  }

  getBus(): MessageBus {
    return this.bus;
  }

  /**
   * Get a service instance by name.
   */
  getServiceInstance<T = unknown>(name: string): T | undefined {
    return this.instances.get(name) as T | undefined;
  }

  /**
   * List all registered service instance names.
   */
  getServiceInstanceNames(): string[] {
    return [...this.instances.keys()];
  }

  /**
   * Register a service definition, instantiate it, wire to bus and gateway.
   */
  private async registerAndWire(reg: ServiceRegistration): Promise<void> {
    const { definition, busTopics } = reg;

    // Filter by config if specified
    if (this.config.services && !this.config.services.includes(definition.name)) {
      return;
    }

    // 1. Register with ServiceRegistry
    this.registry.register(definition);

    // 2. Instantiate the service class via dynamic import
    const instance = await this.instantiateService(definition.name);
    if (instance) {
      this.instances.set(definition.name, instance);
    }

    // 3. Subscribe to MessageBus topics
    if (busTopics) {
      for (const topic of busTopics) {
        this.bus.subscribe(topic, async (message) => {
          logger.debug("Service received bus message", {
            service: definition.name,
            topic,
            source: message.source,
          });
          this.bus.publish({
            topic: `${topic}.response`,
            payload: { service: definition.name, received: true, originalPayload: message.payload },
            source: definition.name,
            priority: "normal",
          });
        });
      }
    }

    // 4. Register health + status routes with ApiGateway
    this.gateway.registerService(definition.name, [
      {
        method: "GET",
        path: `${definition.endpoint}/health`,
        handler: async (_req: unknown, res: unknown) => {
          const svc = this.registry.get(definition.name);
          (res as unknown).status = 200;
          (res as unknown).body = {
            service: definition.name,
            health: svc?.health ?? "unknown",
            capabilities: definition.capabilities,
          };
        },
      },
      {
        method: "GET",
        path: `${definition.endpoint}/status`,
        handler: async (_req: unknown, res: unknown) => {
          (res as unknown).status = 200;
          (res as unknown).body = {
            service: definition.name,
            version: definition.version,
            instanceAvailable: this.instances.has(definition.name),
            busTopics: busTopics ?? [],
          };
        },
      },
    ]);

    logger.debug("Service registered and wired", {
      name: definition.name,
      hasInstance: this.instances.has(definition.name),
      busTopics: busTopics?.length ?? 0,
    });
  }

  /**
   * Instantiate a service class by name using ESM dynamic imports.
   */
  private async instantiateService(name: string): Promise<unknown> {
    try {
      switch (name) {
        case "axe-audit": {
          const mod = await import("./services/axe-audit.js");
          return new mod.AxeAuditService();
        }
        case "batch-scraper": {
          const mod = await import("./services/batch-scraper.js");
          return new mod.BatchScraper();
        }
        case "graphql-mock": {
          const mod = await import("./services/graphql-mock.js");
          return new mod.GraphQLMockService();
        }
        case "nuclei-multi": {
          const mod = await import("./services/nuclei-multi.js");
          return new mod.NucleiMultiService();
        }
        case "zap-deep": {
          const mod = await import("./services/zap-deep.js");
          return new mod.ZAPDeepService();
        }
        case "captcha-swarm": {
          const mod = await import("./services/captcha-swarm.js");
          return new mod.CaptchaSwarmService();
        }
        case "story-testing": {
          const mod = await import("./services/story-testing.js");
          return new mod.StoryTestingService();
        }
        case "lightpanda": {
          const mod = await import("./services/lightpanda-manager.js");
          return new mod.LightpandaManager();
        }
        default:
          logger.warn("Unknown service name for instantiation", { name });
          return undefined;
      }
    } catch (error) {
      logger.warn("Failed to instantiate service", { name, error: String(error) });
      return undefined;
    }
  }

  private wireMessageBus(): void {
    // Forward service health changes to bus
    this.registry.on("service.health.changed", (event) => {
      this.bus.publish({
        topic: "services.health.changed",
        payload: event.data,
        source: "service-bootstrap",
        priority: "normal",
      });
    });

    // Forward service registrations to bus
    this.registry.on("service.registered", (event) => {
      this.bus.publish({
        topic: "services.registered",
        payload: event.data,
        source: "service-bootstrap",
        priority: "low",
      });
    });

    logger.debug("Message bus wiring complete");
  }
}
