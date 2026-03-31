// ──────────────────────────────────────────────────────────────────────────────
// End-to-End Integration Test
// Verifies the full pipeline from CLI → packages → services
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { ServiceRegistry } from "../packages/services/src/registry.js";
import { MiniWoBEnvironments } from "../packages/services/src/services/benchmark-env.js";
import { BatchScraper } from "../packages/services/src/services/batch-scraper.js";
import { GraphQLMockService } from "../packages/services/src/services/graphql-mock.js";
import { NucleiMultiService } from "../packages/services/src/services/nuclei-multi.js";
import { CaptchaSwarmService } from "../packages/services/src/services/captcha-swarm.js";
import { ToolRegistry } from "../packages/agent/src/tools/registry.js";
import { StealthEngine } from "../packages/network/src/stealth/stealth.js";
import { ProxyServer, TOXICITY_PRESETS } from "../packages/quality/src/resilience/proxy-server.js";
import { Snapshotter, Differ } from "../packages/data/src/tracking/tracker.js";
import { RewardShaper} from "../evals/benchmarks/reward.js";
import { BenchmarkRunner } from "../evals/benchmarks/runner.js";

describe("End-to-End Integration", () => {
  describe("Service Registry → All Services", () => {
    it("should register all world-class services", () => {
      const registry = new ServiceRegistry();

      // Register each service
      registry.register({
        name: "axe-audit",
        version: "1.0",
        description: "WCAG 2.2",
        endpoint: "",
        health: "healthy",
        capabilities: ["a11y", "wcag"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "crawler",
        version: "1.0",
        description: "Web crawler",
        endpoint: "",
        health: "healthy",
        capabilities: ["crawl", "sitemap"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "stealth",
        version: "1.0",
        description: "Stealth browsing",
        endpoint: "",
        health: "healthy",
        capabilities: ["fingerprint", "anti-detection"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "proxy",
        version: "1.0",
        description: "Fault injection",
        endpoint: "",
        health: "healthy",
        capabilities: ["toxic", "network"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "graphql-mock",
        version: "1.0",
        description: "GraphQL mocking",
        endpoint: "",
        health: "healthy",
        capabilities: ["graphql", "mock"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "nuclei",
        version: "1.0",
        description: "Vuln scanner",
        endpoint: "",
        health: "healthy",
        capabilities: ["dns", "tcp", "ssl"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "captcha-swarm",
        version: "1.0",
        description: "CAPTCHA + swarm",
        endpoint: "",
        health: "healthy",
        capabilities: ["captcha", "swarm"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "story-testing",
        version: "1.0",
        description: "Story testing",
        endpoint: "",
        health: "healthy",
        capabilities: ["storybook", "ladle"],
        dependencies: [],
        metadata: {},
      });
      registry.register({
        name: "lightpanda",
        version: "1.0",
        description: "Browser backend",
        endpoint: "",
        health: "healthy",
        capabilities: ["cdp", "headless"],
        dependencies: [],
        metadata: {},
      });

      expect(registry.list().length).toBe(9);
      expect(registry.getStatus().healthy).toBe(9);

      // Find by capability
      expect(registry.findByCapability("a11y").length).toBe(1);
      expect(registry.findByCapability("crawl").length).toBe(1);
      expect(registry.findByCapability("captcha").length).toBe(1);
    });
  });

  describe("Tool Registry → Tools", () => {
    it("should have all built-in tools", () => {
      const registry = new ToolRegistry();
      const names = registry.listNames();
      expect(names).toContain("click");
      expect(names).toContain("type");
      expect(names).toContain("navigate");
      expect(names).toContain("screenshot");
      expect(names).toContain("assert");
      expect(names).toContain("scroll");
      expect(names).toContain("select");
      expect(names).toContain("hover");
      expect(names).toContain("wait");
      expect(names).toContain("done");
      expect(registry.size).toBe(10);
    });
  });

  describe("Stealth → Detection Bypass", () => {
    it("should generate anti-detection scripts", () => {
      const engine = new StealthEngine(StealthEngine.fromPreset("balanced"));
      const scripts = engine.getInitScripts();
      expect(scripts.some((s) => s.includes("webdriver"))).toBe(true);
      expect(scripts.some((s) => s.includes("WebGL"))).toBe(true);
    });

    it("should detect CAPTCHAs", () => {
      const result = StealthEngine.detectCaptcha('<div class="g-recaptcha"></div>');
      expect(result.detected).toBe(true);
      expect(result.type).toBe("recaptcha");
    });
  });

  describe("Proxy → Toxicity Presets", () => {
    it("should have all toxicity presets", () => {
      expect(Object.keys(TOXICITY_PRESETS).length).toBe(5);
      expect(TOXICITY_PRESETS["slow-3g"]).toBeDefined();
      expect(TOXICITY_PRESETS["flaky-wifi"]).toBeDefined();
      expect(TOXICITY_PRESETS["offline"]).toBeDefined();
    });

    it("should create proxy with toxics", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      server.applyPreset("slow-3g");
      const status = server.getStatus();
      expect(status.toxics.length).toBeGreaterThan(0);
    });
  });

  describe("Crawler → Sitemap → Link Extraction", () => {
    it("should create batch scraper job", () => {
      const scraper = new BatchScraper();
      const job = scraper.createJob(["https://a.com", "https://b.com"], {
        formats: ["markdown", "html"],
        extractMedia: true,
      });
      expect(job.urls.length).toBe(2);
      expect(job.config.formats).toContain("markdown");
    });
  });

  describe("GraphQL Mock → Handler Matching", () => {
    it("should mock GraphQL queries", async () => {
      const mock = new GraphQLMockService();
      mock.query("GetUser", () => ({
        data: { user: { id: "1", name: "Alice" } },
      }));
      const result = await mock.handle(
        JSON.stringify({ operationName: "GetUser", query: "query GetUser { user { id name } }" }),
        "https://api.example.com/graphql",
      );
      expect(result?.data).toEqual({ user: { id: "1", name: "Alice" } });
    });
  });

  describe("Nuclei → Template Authoring", () => {
    it("should create and export templates", () => {
      const scanner = new NucleiMultiService();
      scanner.addTemplates(NucleiMultiService.getBuiltinTemplates());
      const yaml = scanner.exportTemplates();
      expect(yaml).toContain("dns-mx-check");
      expect(yaml).toContain("tcp-redis-unauth");
    });
  });

  describe("CAPTCHA Swarm → Multi-Agent", () => {
    it("should create and execute swarm", async () => {
      const service = new CaptchaSwarmService();
      const swarm = service.createSwarm("Test flow", "https://example.com", 4);
      expect(swarm.agents.length).toBe(4);
      expect(swarm.agents.map((a) => a.role)).toContain("coordinator");
      expect(swarm.agents.map((a) => a.role)).toContain("explorer");
      expect(swarm.agents.map((a) => a.role)).toContain("extractor");
      expect(swarm.agents.map((a) => a.role)).toContain("validator");
    });
  });

  describe("Benchmark Environments → Task Execution", () => {
    it("should set up MiniWoB tasks", async () => {
      const envs = MiniWoBEnvironments.all();
      for (const env of envs) {
        const setup = await env.setup();
        expect(setup.goal).toBeDefined();
        expect(setup.maxSteps).toBeGreaterThan(0);
        expect(setup.timeout).toBeGreaterThan(0);
      }
    });
  });

  describe("Change Tracking → Snapshot → Diff", () => {
    it("should create snapshots and diff them", () => {
      const snap1 = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 3");
      const snap2 = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 4");
      const diff = Differ.diff(snap1, snap2);
      expect(diff.url).toBe("https://example.com");
      expect(diff.similarity).toBeGreaterThanOrEqual(0);
      expect(diff.similarity).toBeLessThanOrEqual(1);
    });
  });

  describe("Reward Shaping → Composite Scoring", () => {
    it("should calculate composite rewards", async () => {
      const shaper = new RewardShaper();
      shaper.addBuiltin("completion");
      shaper.addBuiltin("efficiency");
      const reward = await shaper.calculate({
        stepIndex: 0,
        totalSteps: 3,
        goalComplete: true,
        actions: [{ type: "click", success: true, timestamp: 0 }],
        url: "https://example.com",
        elements: [],
        previousReward: 0,
      });
      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });

  describe("Benchmark Runner → Suite Execution", () => {
    it("should run benchmark suite", async () => {
      const runner = new BenchmarkRunner();
      runner.addTask({
        id: "test-1",
        name: "Test Task",
        suite: "test",
        url: "about:blank",
        goal: "Test",
        maxSteps: 5,
        timeout: 10_000,
      });
      const result = await runner.run(async () => ({
        success: true,
        steps: [],
      }));
      expect(result.totalTasks).toBe(1);
      expect(result.passedTasks).toBe(1);
      expect(result.successRate).toBe(1);
    });
  });
});
