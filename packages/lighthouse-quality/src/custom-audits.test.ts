import { describe, it, expect } from "vitest";
import {
  CustomAuditRunner,
  formSubmissionLatencyAudit,
  animationSmoothnessAudit,
  memoryLeakDetectionAudit,
  BUILTIN_CUSTOM_AUDITS,
  type CustomAudit,
  type Page,
} from "./custom-audits.js";

describe("CustomAuditRunner", () => {
  it("should register and list audits", () => {
    const runner = new CustomAuditRunner();
    const audit: CustomAudit = {
      id: "test-audit",
      title: "Test Audit",
      description: "A test audit",
      gatherFn: async () => ({}),
      auditFn: () => ({ score: 1 }),
    };

    runner.register(audit);
    const audits = runner.list();
    expect(audits.length).toBe(1);
    expect(audits[0].id).toBe("test-audit");
  });

  it("should unregister an audit", () => {
    const runner = new CustomAuditRunner();
    const audit: CustomAudit = {
      id: "test-audit",
      title: "Test Audit",
      description: "A test audit",
      gatherFn: async () => ({}),
      auditFn: () => ({ score: 1 }),
    };

    runner.register(audit);
    runner.unregister("test-audit");
    expect(runner.list().length).toBe(0);
  });

  it("should run an audit and return results", async () => {
    const runner = new CustomAuditRunner();
    const mockPage = {
      evaluate: async () => ({ data: "test" }),
    } as unknown as Page;
    const audit: CustomAudit = {
      id: "test-audit",
      title: "Test Audit",
      description: "A test audit",
      gatherFn: async (page) => page.evaluate(async () => ({ data: "test" })),
      auditFn: (artifact) => {
        const data = artifact as { data: string };
        return { score: data.data === "test" ? 1 : 0, displayValue: "pass" };
      },
    };

    runner.register(audit);
    const results = await runner.run("test-audit", mockPage);
    expect(results.id).toBe("test-audit");
    expect(results.title).toBe("Test Audit");
    expect(results.score).toBe(1);
    expect(results.displayValue).toBe("pass");
    expect(results.timestamp).toBeInstanceOf(Date);
  });

  it("should throw when audit not found", async () => {
    const runner = new CustomAuditRunner();
    const mockPage = { evaluate: async () => ({}) } as unknown as Page;
    await expect(runner.run("nonexistent", mockPage)).rejects.toThrow(
      "Custom audit not found: nonexistent",
    );
  });

  it("should run all registered audits", async () => {
    const runner = new CustomAuditRunner();
    const mockPage = { evaluate: async () => ({}) } as unknown as Page;

    runner.register({
      id: "audit-1",
      title: "Audit 1",
      description: "First audit",
      gatherFn: async () => ({}),
      auditFn: () => ({ score: 1 }),
    });
    runner.register({
      id: "audit-2",
      title: "Audit 2",
      description: "Second audit",
      gatherFn: async () => ({}),
      auditFn: () => ({ score: 0.5 }),
    });

    const results = await runner.runAll(mockPage);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe("audit-1");
    expect(results[1].id).toBe("audit-2");
  });
});

describe("BUILTIN_CUSTOM_AUDITS", () => {
  it("should have form submission latency audit", () => {
    const ids = BUILTIN_CUSTOM_AUDITS.map((a) => a.id);
    expect(ids).toContain("form-submission-latency");
  });

  it("should have animation smoothness audit", () => {
    const ids = BUILTIN_CUSTOM_AUDITS.map((a) => a.id);
    expect(ids).toContain("animation-smoothness");
  });

  it("should have memory leak detection audit", () => {
    const ids = BUILTIN_CUSTOM_AUDITS.map((a) => a.id);
    expect(ids).toContain("memory-leak-detection");
  });

  it("should have exactly 3 builtin audits", () => {
    expect(BUILTIN_CUSTOM_AUDITS.length).toBe(3);
  });
});

describe("formSubmissionLatencyAudit", () => {
  it("should score 1 for latency under 200ms", () => {
    const result = formSubmissionLatencyAudit.auditFn({
      navigationEntries: [],
      formEntries: [{ name: "submit", responseEnd: 100, startTime: 0 }],
    });
    expect(result.score).toBe(1);
  });

  it("should score 0.7 for latency between 200-500ms", () => {
    const result = formSubmissionLatencyAudit.auditFn({
      navigationEntries: [],
      formEntries: [{ name: "submit", responseEnd: 300, startTime: 0 }],
    });
    expect(result.score).toBe(0.7);
  });

  it("should score 0.4 for latency between 500-1000ms", () => {
    const result = formSubmissionLatencyAudit.auditFn({
      navigationEntries: [],
      formEntries: [{ name: "submit", responseEnd: 700, startTime: 0 }],
    });
    expect(result.score).toBe(0.4);
  });

  it("should score 0 for latency over 1000ms", () => {
    const result = formSubmissionLatencyAudit.auditFn({
      navigationEntries: [],
      formEntries: [{ name: "submit", responseEnd: 1500, startTime: 0 }],
    });
    expect(result.score).toBe(0);
  });

  it("should score 1 when no form entries", () => {
    const result = formSubmissionLatencyAudit.auditFn({
      navigationEntries: [],
      formEntries: [],
    });
    expect(result.score).toBe(1);
  });
});

describe("animationSmoothnessAudit", () => {
  it("should score 0 when observer not supported", () => {
    const result = animationSmoothnessAudit.auditFn({
      jankEvents: [],
      observerSupported: false,
    });
    expect(result.score).toBe(0);
    expect(result.displayValue).toBe("Not supported");
  });

  it("should score 1 for zero jank events", () => {
    const result = animationSmoothnessAudit.auditFn({
      jankEvents: [],
      observerSupported: true,
    });
    expect(result.score).toBe(1);
  });

  it("should score 0.8 for fewer than 5 jank events", () => {
    const result = animationSmoothnessAudit.auditFn({
      jankEvents: [
        { timestamp: 0, duration: 50 },
        { timestamp: 1, duration: 60 },
      ],
      observerSupported: true,
    });
    expect(result.score).toBe(0.8);
  });

  it("should score 0 for 30+ jank events", () => {
    const jankEvents = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i,
      duration: 100,
    }));
    const result = animationSmoothnessAudit.auditFn({
      jankEvents,
      observerSupported: true,
    });
    expect(result.score).toBe(0);
  });
});

describe("memoryLeakDetectionAudit", () => {
  it("should score 0 when memory not available", () => {
    const result = memoryLeakDetectionAudit.auditFn({
      beforeMemory: 0,
      afterMemory: 0,
    });
    expect(result.score).toBe(0);
    expect(result.displayValue).toBe("Not available");
  });

  it("should score 1 for less than 5% change", () => {
    const result = memoryLeakDetectionAudit.auditFn({
      beforeMemory: 100_000_000,
      afterMemory: 104_000_000,
    });
    expect(result.score).toBe(1);
  });

  it("should score 0 for over 30% change", () => {
    const result = memoryLeakDetectionAudit.auditFn({
      beforeMemory: 100_000_000,
      afterMemory: 150_000_000,
    });
    expect(result.score).toBe(0);
  });
});
