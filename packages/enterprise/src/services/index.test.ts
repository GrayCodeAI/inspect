import { describe, it, expect } from "vitest";
import { ServiceRegistry } from "./registry.js";
import { AxeAuditService } from "./services/axe-audit.js";
import {
  MiniWoBEnvironments,
  WebArenaEnvironments,
  WorkArenaEnvironments,
} from "./services/benchmark-env.js";
import { BatchScraper } from "./services/batch-scraper.js";
import { GraphQLMockService } from "./services/graphql-mock.js";
import { NucleiMultiService } from "./services/nuclei-multi.js";
import { ZAPDeepService } from "./services/zap-deep.js";
import { CaptchaSwarmService } from "./services/captcha-swarm.js";
import { StoryTestingService } from "./services/story-testing.js";
import { LightpandaManager } from "./services/lightpanda-manager.js";

describe("ServiceRegistry", () => {
  it("should register and retrieve a service", () => {
    const registry = new ServiceRegistry();
    const service = registry.register({
      name: "test-service",
      version: "1.0.0",
      description: "Test",
      endpoint: "http://localhost:3000",
      health: "healthy",
      capabilities: ["test"],
      dependencies: [],
      metadata: {},
    });
    expect(service.name).toBe("test-service");
    expect(registry.get("test-service")?.health).toBe("healthy");
  });

  it("should list all services", () => {
    const registry = new ServiceRegistry();
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    registry.register({
      name: "b",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    expect(registry.list().length).toBe(2);
  });

  it("should find services by capability", () => {
    const registry = new ServiceRegistry();
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: ["crawl"],
      dependencies: [],
      metadata: {},
    });
    registry.register({
      name: "b",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: ["track"],
      dependencies: [],
      metadata: {},
    });
    expect(registry.findByCapability("crawl").length).toBe(1);
  });

  it("should update health status", () => {
    const registry = new ServiceRegistry();
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    registry.updateHealth("a", "degraded");
    expect(registry.get("a")?.health).toBe("degraded");
  });

  it("should emit and receive events", () => {
    const registry = new ServiceRegistry();
    const events: unknown[] = [];
    registry.on("service.registered", (e) => {
      events.push(e);
    });
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    expect(events.length).toBe(1);
  });

  it("should deregister a service", () => {
    const registry = new ServiceRegistry();
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    expect(registry.deregister("a")).toBe(true);
    expect(registry.get("a")).toBeUndefined();
  });

  it("should get registry status", () => {
    const registry = new ServiceRegistry();
    registry.register({
      name: "a",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "healthy",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    registry.register({
      name: "b",
      version: "1.0",
      description: "",
      endpoint: "",
      health: "degraded",
      capabilities: [],
      dependencies: [],
      metadata: {},
    });
    const status = registry.getStatus();
    expect(status.total).toBe(2);
    expect(status.healthy).toBe(1);
    expect(status.degraded).toBe(1);
  });
});

describe("AxeAuditService", () => {
  it("should create service with config", () => {
    const service = new AxeAuditService({ wcagLevel: "AA" });
    expect(service).toBeDefined();
  });

  it("should generate injection script", () => {
    const service = new AxeAuditService();
    const script = service.getInjectionScript();
    expect(script).toContain("axe");
  });

  it("should generate audit script", () => {
    const service = new AxeAuditService();
    const script = service.getAuditScript();
    expect(script).toContain("axe.run");
  });

  it("should get WCAG 2.2 rules", () => {
    const rules = AxeAuditService.getWCAG22Rules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.id === "target-size")).toBe(true);
  });

  it("should build config for WCAG level", () => {
    const config = AxeAuditService.buildConfig("AA");
    expect(config.runOnly).toBeDefined();
  });

  it("should analyze results", () => {
    const analysis = AxeAuditService.analyzeResults({
      violations: [],
      passes: [{ id: "rule1", description: "Pass", nodes: 5 }],
      incomplete: [],
      inapplicable: [],
      timestamp: Date.now(),
      url: "https://example.com",
    });
    expect(analysis.score).toBe(100);
    expect(analysis.passes).toBe(1);
  });
});

describe("Benchmark Environments", () => {
  it("should create MiniWoB environments", () => {
    const envs = MiniWoBEnvironments.all();
    expect(envs.length).toBe(5);
    expect(envs.some((e) => e.id === "miniwob-click-button")).toBe(true);
  });

  it("should create WebArena environments", () => {
    const envs = WebArenaEnvironments.all();
    expect(envs.length).toBe(2);
  });

  it("should create WorkArena environments", () => {
    const envs = WorkArenaEnvironments.all();
    expect(envs.length).toBe(1);
  });

  it("should have setup and validate methods", async () => {
    const env = MiniWoBEnvironments.clickButton();
    const setup = await env.setup();
    expect(setup.goal).toContain("Submit");
    expect(setup.maxSteps).toBe(5);
  });
});

describe("BatchScraper", () => {
  it("should create a scrape job", () => {
    const scraper = new BatchScraper();
    const job = scraper.createJob(["https://example.com"], { formats: ["markdown"] });
    expect(job.id).toBeDefined();
    expect(job.urls.length).toBe(1);
    expect(job.status).toBe("pending");
  });

  it("should export results as JSON", () => {
    const scraper = new BatchScraper();
    const job = scraper.createJob([]);
    const output = scraper.exportResults(job.id, "json");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should export results as CSV", () => {
    const scraper = new BatchScraper();
    const job = scraper.createJob([]);
    const output = scraper.exportResults(job.id, "csv");
    expect(output).toContain("url,status");
  });
});

describe("GraphQLMockService", () => {
  it("should register query handlers", () => {
    const mock = new GraphQLMockService();
    mock.query("GetUser", () => ({ data: { user: { id: "1" } } }));
    expect(mock.size).toBe(1);
  });

  it("should register mutation handlers", () => {
    const mock = new GraphQLMockService();
    mock.mutation("CreatePost", () => ({ data: { post: { id: "1" } } }));
    expect(mock.size).toBe(1);
  });

  it("should register subscription handlers", () => {
    const mock = new GraphQLMockService();
    mock.subscription("OnMessage", () => ({ data: { message: "hello" } }));
    expect(mock.size).toBe(1);
  });

  it("should handle matching requests", async () => {
    const mock = new GraphQLMockService();
    mock.query("GetUser", () => ({ data: { user: { id: "1", name: "Alice" } } }));
    const result = await mock.handle(
      JSON.stringify({ operationName: "GetUser", query: "query GetUser { user { id } }" }),
      "https://api.example.com/graphql",
    );
    expect(result).not.toBeNull();
    expect(result?.data).toEqual({ user: { id: "1", name: "Alice" } });
  });

  it("should return null for unmatched requests", async () => {
    const mock = new GraphQLMockService();
    mock.query("GetUser", () => ({ data: {} }));
    const result = await mock.handle(
      JSON.stringify({ operationName: "Unknown", query: "query Unknown { x }" }),
      "https://api.example.com/graphql",
    );
    expect(result).toBeNull();
  });

  it("should parse operation types", () => {
    expect(GraphQLMockService.parseOperation("query GetUser { user { id } }").type).toBe("query");
    expect(GraphQLMockService.parseOperation("mutation CreatePost { post { id } }").type).toBe(
      "mutation",
    );
    expect(GraphQLMockService.parseOperation("subscription OnMsg { msg }").type).toBe(
      "subscription",
    );
  });

  it("should track handler stats", () => {
    const mock = new GraphQLMockService();
    mock.query("GetUser", () => ({ data: {} }));
    const stats = mock.getStats();
    expect(stats[0].callCount).toBe(0);
  });

  it("should reset handlers", () => {
    const mock = new GraphQLMockService();
    mock.query("A", () => ({}));
    mock.query("B", () => ({}));
    mock.reset();
    expect(mock.size).toBe(0);
  });
});

describe("NucleiMultiService", () => {
  it("should add templates", () => {
    const scanner = new NucleiMultiService();
    const template = NucleiMultiService.createDnsTemplate({
      id: "test-dns",
      name: "Test DNS",
      severity: "info",
      dnsName: "{{FQDN}}",
      dnsType: "MX",
      matchWords: ["IN\tMX"],
    });
    scanner.addTemplate(template);
    expect(scanner.exportTemplates()).toContain("test-dns");
  });

  it("should create DNS templates", () => {
    const template = NucleiMultiService.createDnsTemplate({
      id: "dns-mx",
      name: "MX Check",
      severity: "info",
      dnsName: "example.com",
      dnsType: "MX",
      matchWords: ["mail"],
    });
    expect(template.dns).toBeDefined();
    expect(template.dns?.[0].type).toBe("MX");
  });

  it("should create TCP templates", () => {
    const template = NucleiMultiService.createTcpTemplate({
      id: "tcp-redis",
      name: "Redis Unauth",
      severity: "critical",
      inputs: ["INFO\r\n"],
      matchWords: ["redis_version"],
    });
    expect(template.tcp).toBeDefined();
  });

  it("should create SSL templates", () => {
    const template = NucleiMultiService.createSslTemplate({
      id: "ssl-expiry",
      name: "SSL Expiry",
      severity: "medium",
      matchWords: ["Not After"],
    });
    expect(template.ssl).toBeDefined();
  });

  it("should have builtin templates", () => {
    const templates = NucleiMultiService.getBuiltinTemplates();
    expect(templates.length).toBe(4);
    expect(templates.some((t) => t.id === "dns-mx-check")).toBe(true);
    expect(templates.some((t) => t.id === "tcp-redis-unauth")).toBe(true);
  });
});

describe("ZAPDeepService", () => {
  it("should create with default policies", () => {
    const zap = new ZAPDeepService();
    const policies = zap.getPolicies();
    expect(policies.length).toBe(3);
    expect(policies.some((p) => p.name === "Default Policy")).toBe(true);
  });

  it("should create custom policies", () => {
    const zap = new ZAPDeepService();
    const policy = zap.createCustomPolicy("strict", "HIGH", "LOW");
    expect(policy.name).toBe("strict");
    expect(policy.attackStrength).toBe("HIGH");
  });

  it("should categorize OWASP alerts", () => {
    const alerts = [
      {
        pluginId: "40012",
        alert: "XSS",
        risk: "High" as const,
        confidence: "High" as const,
        url: "https://example.com",
        param: "q",
        cweid: "79",
        wascid: "8",
        solution: "Encode output",
        reference: "",
        description: "",
        timestamp: 0,
      },
    ];
    const categories = ZAPDeepService.categorizeOWASP(alerts);
    expect(categories["A03: Injection"].length).toBe(1);
  });

  it("should build security summary", () => {
    const summary = ZAPDeepService.buildSummary([]);
    expect(summary.totalAlerts).toBe(0);
    expect(summary.score).toBe(100);
  });
});

describe("CaptchaSwarmService", () => {
  it("should create a swarm", () => {
    const service = new CaptchaSwarmService();
    const swarm = service.createSwarm("Test task", "https://example.com", 3);
    expect(swarm.id).toBeDefined();
    expect(swarm.agents.length).toBe(3);
    expect(swarm.agents[0].role).toBe("coordinator");
  });

  it("should detect CAPTCHA types", () => {
    const types = CaptchaSwarmService.detectCaptchaType('<div class="g-recaptcha"></div>');
    expect(types).toContain("recaptcha_v2");
  });

  it("should detect hCaptcha", () => {
    const types = CaptchaSwarmService.detectCaptchaType('<div class="h-captcha"></div>');
    expect(types).toContain("hcaptcha");
  });

  it("should return empty for no CAPTCHA", () => {
    const types = CaptchaSwarmService.detectCaptchaType("<html><body>Hello</body></html>");
    expect(types.length).toBe(0);
  });
});

describe("StoryTestingService", () => {
  it("should create service with config", () => {
    const service = new StoryTestingService();
    expect(service).toBeDefined();
  });

  it("should get story URL for Ladle", () => {
    const service = new StoryTestingService();
    const url = service.getStoryUrl("http://localhost:61000", {
      id: "button--primary",
      title: "Button",
      name: "Primary",
      framework: "ladle",
      component: "Button",
      filePath: "Button.stories.tsx",
      variants: [],
    });
    expect(url).toContain("button--primary");
  });

  it("should get framework config", () => {
    const config = StoryTestingService.getFrameworkConfig("ladle");
    expect(config.port).toBe(61000);
    expect(config.storyPattern).toContain("stories");
  });
});

describe("LightpandaManager", () => {
  it("should create manager", () => {
    const manager = new LightpandaManager();
    expect(manager).toBeDefined();
  });

  it("should list instances as empty initially", () => {
    const manager = new LightpandaManager();
    expect(manager.listInstances().length).toBe(0);
  });

  it("should get available releases", () => {
    const releases = LightpandaManager.getAvailableReleases();
    expect(releases.length).toBeGreaterThan(0);
  });
});
