import { describe, it, expect, beforeEach } from "vitest";
import { FaultInjector } from "./faults.js";

/** Create a mock PageHandle for testing. */
function mockPage() {
  const routes: Array<{ pattern: string | RegExp; handler: (route: unknown) => Promise<void> }> =
    [];

  return {
    routes,
    async route(
      urlOrPredicate: string | RegExp | ((url: URL) => boolean),
      handler: (route: unknown) => Promise<void>,
    ) {
      routes.push({ pattern: urlOrPredicate as string | RegExp, handler });
    },
    async unroute() {
      routes.length = 0;
    },
  };
}

/** Create a mock RouteHandle. */
function mockRoute(url = "https://api.example.com/data", method = "GET", resourceType = "fetch") {
  const calls: string[] = [];
  return {
    calls,
    request() {
      return {
        url: () => url,
        method: () => method,
        resourceType: () => resourceType,
      };
    },
    async fulfill(options: { status?: number; headers?: Record<string, string>; body?: string }) {
      calls.push(`fulfill:${options.status ?? 200}`);
    },
    async continue() {
      calls.push("continue");
    },
    async abort(errorCode?: string) {
      calls.push(`abort:${errorCode ?? "failed"}`);
    },
  };
}

describe("FaultInjector", () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector();
  });

  describe("fault management", () => {
    it("adds a fault and returns an ID", () => {
      const id = injector.addFault({
        fault: { type: "latency", delay: 100 },
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("uses a custom ID when provided", () => {
      const id = injector.addFault({
        id: "my-fault",
        fault: { type: "latency", delay: 100 },
      });
      expect(id).toBe("my-fault");
    });

    it("lists all configured faults", () => {
      injector.addFault({ fault: { type: "latency", delay: 100 } });
      injector.addFault({ fault: { type: "timeout", timeout: 5000 } });

      const faults = injector.listFaults();
      expect(faults).toHaveLength(2);
      expect(faults[0].fault.type).toBe("latency");
      expect(faults[1].fault.type).toBe("timeout");
    });

    it("removes a fault by ID", () => {
      const id = injector.addFault({ fault: { type: "latency", delay: 100 } });
      expect(injector.removeFault(id)).toBe(true);
      expect(injector.listFaults()).toHaveLength(0);
    });

    it("returns false when removing a non-existent fault", () => {
      expect(injector.removeFault("nonexistent")).toBe(false);
    });

    it("clears all faults", () => {
      injector.addFault({ fault: { type: "latency", delay: 100 } });
      injector.addFault({ fault: { type: "timeout", timeout: 5000 } });
      injector.clearFaults();
      expect(injector.listFaults()).toHaveLength(0);
    });
  });

  describe("enable/disable", () => {
    it("disables a fault by ID", () => {
      const id = injector.addFault({ fault: { type: "latency", delay: 100 } });
      injector.setEnabled(id, false);

      const faults = injector.listFaults();
      expect(faults[0].enabled).toBe(false);
    });

    it("re-enables a disabled fault", () => {
      const id = injector.addFault({
        fault: { type: "latency", delay: 100 },
        enabled: false,
      });
      injector.setEnabled(id, true);

      const faults = injector.listFaults();
      expect(faults[0].enabled).toBe(true);
    });

    it("silently ignores setEnabled on non-existent fault", () => {
      // Should not throw
      injector.setEnabled("nonexistent", true);
    });
  });

  describe("toxicity", () => {
    it("sets toxicity (probability) for a fault", () => {
      const id = injector.addFault({
        fault: { type: "latency", delay: 100 },
        toxicity: 50,
      });
      injector.setToxicity(id, 75);

      const faults = injector.listFaults();
      expect(faults[0].toxicity).toBe(75);
    });

    it("clamps toxicity between 0 and 100", () => {
      const id = injector.addFault({ fault: { type: "latency", delay: 100 } });

      injector.setToxicity(id, 150);
      expect(injector.listFaults()[0].toxicity).toBe(100);

      injector.setToxicity(id, -50);
      expect(injector.listFaults()[0].toxicity).toBe(0);
    });
  });

  describe("start and stop", () => {
    it("starts fault injection on a page", async () => {
      const page = mockPage();
      injector.addFault({ fault: { type: "latency", delay: 10 } });

      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      expect(page.routes.length).toBe(1);
      expect(page.routes[0].pattern).toBe("**/*");
    });

    it("stops fault injection and unroutes", async () => {
      const page = mockPage();
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);
      await injector.stop();

      expect(page.routes.length).toBe(0);
    });

    it("handles stop when not started", async () => {
      // Should not throw
      await injector.stop();
    });
  });

  describe("statistics", () => {
    it("returns initial stats with zero counts", () => {
      const stats = injector.getStats();
      expect(stats.totalIntercepted).toBe(0);
      expect(stats.faultsApplied).toBe(0);
      expect(stats.passedThrough).toBe(0);
    });

    it("resets stats", async () => {
      const page = mockPage();
      injector.addFault({ fault: { type: "latency", delay: 1 } });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      // Simulate a route interception
      const route = mockRoute();
      await page.routes[0].handler(route);

      // Stats should have been updated
      const statsAfter = injector.getStats();
      expect(statsAfter.totalIntercepted).toBeGreaterThan(0);

      injector.resetStats();
      const statsReset = injector.getStats();
      expect(statsReset.totalIntercepted).toBe(0);
      expect(statsReset.faultsApplied).toBe(0);
      expect(statsReset.passedThrough).toBe(0);
    });

    it("tracks per-fault stats", async () => {
      const page = mockPage();
      const _id = injector.addFault({
        id: "test-fault",
        fault: { type: "latency", delay: 1 },
        toxicity: 100,
      });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      const route = mockRoute();
      await page.routes[0].handler(route);

      const stats = injector.getStats();
      expect(stats.perFault.get("test-fault")).toBeDefined();
      expect(stats.perFault.get("test-fault")!.applied).toBe(1);
    });
  });

  describe("route handling", () => {
    it("passes through when no faults match", async () => {
      const page = mockPage();
      // Add a fault that only matches a specific URL pattern
      injector.addFault({
        fault: { type: "latency", delay: 1 },
        urlPattern: "https://other.example.com/*",
        toxicity: 100,
      });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      const route = mockRoute("https://api.example.com/data");
      await page.routes[0].handler(route);

      expect(route.calls).toContain("continue");
      const stats = injector.getStats();
      expect(stats.passedThrough).toBe(1);
    });

    it("skips disabled faults", async () => {
      const page = mockPage();
      const _id = injector.addFault({
        fault: { type: "reset_peer", timeout: 0 },
        enabled: false,
      });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      const route = mockRoute();
      await page.routes[0].handler(route);

      // Should pass through since the fault is disabled
      expect(route.calls).toContain("continue");
      const stats = injector.getStats();
      expect(stats.passedThrough).toBe(1);
    });

    it("filters by resource type", async () => {
      const page = mockPage();
      injector.addFault({
        fault: { type: "latency", delay: 1 },
        resourceTypes: ["image"],
        toxicity: 100,
      });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      // This is a "fetch" type request, not "image"
      const route = mockRoute("https://api.example.com/data", "GET", "fetch");
      await page.routes[0].handler(route);

      expect(route.calls).toContain("continue");
      const stats = injector.getStats();
      expect(stats.passedThrough).toBe(1);
    });

    it("filters by HTTP method", async () => {
      const page = mockPage();
      injector.addFault({
        fault: { type: "latency", delay: 1 },
        methods: ["POST"],
        toxicity: 100,
      });
      await injector.start(page as unknown as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0] as Parameters<typeof injector.start>[0]);

      // This is a GET request, fault only applies to POST
      const route = mockRoute("https://api.example.com/data", "GET", "fetch");
      await page.routes[0].handler(route);

      expect(route.calls).toContain("continue");
      const stats = injector.getStats();
      expect(stats.passedThrough).toBe(1);
    });
  });
});
