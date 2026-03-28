import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ServiceRegistry, type ServiceDefinition, type ServiceEvent } from "./registry.js";

describe("ServiceRegistry", () => {
  let registry: ServiceRegistry;

  const makeService = (
    overrides: Partial<Omit<ServiceDefinition, "registeredAt">> = {},
  ): Omit<ServiceDefinition, "registeredAt"> => ({
    name: overrides.name ?? "test-svc",
    version: overrides.version ?? "1.0.0",
    description: overrides.description ?? "A test service",
    endpoint: overrides.endpoint ?? "http://localhost:4000",
    health: overrides.health ?? "healthy",
    capabilities: overrides.capabilities ?? [],
    dependencies: overrides.dependencies ?? [],
    metadata: overrides.metadata ?? {},
  });

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  describe("registration", () => {
    it("should register a service and return it with a registeredAt timestamp", () => {
      const before = Date.now();
      const svc = registry.register(makeService({ name: "alpha" }));
      expect(svc.name).toBe("alpha");
      expect(svc.registeredAt).toBeGreaterThanOrEqual(before);
    });

    it("should overwrite a service registered with the same name", () => {
      registry.register(makeService({ name: "dup", version: "1.0" }));
      registry.register(makeService({ name: "dup", version: "2.0" }));
      expect(registry.list()).toHaveLength(1);
      expect(registry.get("dup")?.version).toBe("2.0");
    });

    it("should deregister a service and return true", () => {
      registry.register(makeService({ name: "remove-me" }));
      expect(registry.deregister("remove-me")).toBe(true);
      expect(registry.get("remove-me")).toBeUndefined();
    });

    it("should return false when deregistering a nonexistent service", () => {
      expect(registry.deregister("ghost")).toBe(false);
    });
  });

  describe("querying", () => {
    beforeEach(() => {
      registry.register(makeService({ name: "crawler", capabilities: ["crawl", "parse"], health: "healthy" }));
      registry.register(makeService({ name: "scanner", capabilities: ["scan"], health: "degraded" }));
      registry.register(makeService({ name: "indexer", capabilities: ["crawl", "index"], health: "healthy" }));
    });

    it("should list all registered services", () => {
      expect(registry.list()).toHaveLength(3);
    });

    it("should find services by capability", () => {
      const crawlers = registry.findByCapability("crawl");
      expect(crawlers).toHaveLength(2);
      expect(crawlers.map((s) => s.name).sort()).toEqual(["crawler", "indexer"]);
    });

    it("should return empty array for unknown capability", () => {
      expect(registry.findByCapability("fly")).toHaveLength(0);
    });

    it("should find only healthy services", () => {
      const healthy = registry.findHealthy();
      expect(healthy).toHaveLength(2);
      expect(healthy.every((s) => s.health === "healthy")).toBe(true);
    });
  });

  describe("health management", () => {
    it("should update health and set lastHealthCheck timestamp", () => {
      registry.register(makeService({ name: "hc-svc", health: "healthy" }));
      registry.updateHealth("hc-svc", "unhealthy");
      const svc = registry.get("hc-svc")!;
      expect(svc.health).toBe("unhealthy");
      expect(svc.lastHealthCheck).toBeDefined();
    });

    it("should emit health.changed event only when health actually changes", () => {
      registry.register(makeService({ name: "evt-svc", health: "healthy" }));
      const events: ServiceEvent[] = [];
      registry.on("service.health.changed", (e) => events.push(e));

      registry.updateHealth("evt-svc", "healthy"); // same => no event
      expect(events).toHaveLength(0);

      registry.updateHealth("evt-svc", "degraded"); // different => event
      expect(events).toHaveLength(1);
      expect((events[0].data as { oldHealth: string; newHealth: string }).newHealth).toBe("degraded");
    });

    it("should silently ignore health updates for unknown services", () => {
      // Should not throw
      registry.updateHealth("nonexistent", "unhealthy");
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should report correct status counts", () => {
      registry.register(makeService({ name: "h1", health: "healthy" }));
      registry.register(makeService({ name: "h2", health: "healthy" }));
      registry.register(makeService({ name: "d1", health: "degraded" }));
      registry.register(makeService({ name: "u1", health: "unhealthy" }));

      const status = registry.getStatus();
      expect(status.total).toBe(4);
      expect(status.healthy).toBe(2);
      expect(status.degraded).toBe(1);
      expect(status.unhealthy).toBe(1);
    });
  });

  describe("event system", () => {
    it("should emit service.registered events", () => {
      const events: ServiceEvent[] = [];
      registry.on("service.registered", (e) => events.push(e));
      registry.register(makeService({ name: "evented" }));
      expect(events).toHaveLength(1);
      expect(events[0].service).toBe("evented");
    });

    it("should emit service.deregistered events", () => {
      const events: ServiceEvent[] = [];
      registry.on("service.deregistered", (e) => events.push(e));
      registry.register(makeService({ name: "bye" }));
      registry.deregister("bye");
      expect(events).toHaveLength(1);
      expect(events[0].service).toBe("bye");
    });

    it("should return an unsubscribe function for event handlers", () => {
      let count = 0;
      const unsub = registry.on("service.registered", () => count++);
      registry.register(makeService({ name: "s1" }));
      expect(count).toBe(1);

      unsub();
      registry.register(makeService({ name: "s2" }));
      expect(count).toBe(1);
    });

    it("should not break when an event handler throws", () => {
      registry.on("service.registered", () => {
        throw new Error("handler boom");
      });

      // Should not throw
      expect(() =>
        registry.register(makeService({ name: "robust" })),
      ).not.toThrow();
      expect(registry.get("robust")).toBeDefined();
    });
  });
});
