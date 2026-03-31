import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditTrail } from "./audit-trail.js";
import { AutonomyManager, AutonomyLevel } from "./autonomy.js";
import { PermissionManager } from "./permissions.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("AuditTrail", () => {
  let trail: AuditTrail;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "audit-test-"));
    trail = new AuditTrail(tempDir);
    await trail.init();
  });

  it("should log entries with hash chain", async () => {
    const entry = await trail.log({
      agentId: "test-agent",
      sessionId: "session-1",
      action: "llm_call",
      input: "test input",
      output: "test output",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });

    expect(entry.id).toBeDefined();
    expect(entry.hash).toBeDefined();
    expect(entry.previousHash).toBe("0".repeat(64));
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it("should chain entries with previousHash", async () => {
    const e1 = await trail.log({
      agentId: "test",
      sessionId: "s1",
      action: "llm_call",
      input: "in1",
      output: "out1",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });

    const e2 = await trail.log({
      agentId: "test",
      sessionId: "s1",
      action: "tool_use",
      input: "in2",
      output: "out2",
      toolCalls: [],
      tokenUsage: { input: 5, output: 10, total: 15, cost: 0.0005 },
      cost: 0.0005,
      duration: 50,
      result: "success",
      metadata: {},
    });

    expect(e2.previousHash).toBe(e1.hash);
  });

  it("should verify hash chain integrity", async () => {
    await trail.log({
      agentId: "test",
      sessionId: "s1",
      action: "llm_call",
      input: "in",
      output: "out",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });

    const verification = trail.verifyHashChain();
    expect(verification.valid).toBe(true);
  });

  it("should query by filter", async () => {
    await trail.log({
      agentId: "agent-1",
      sessionId: "s1",
      action: "llm_call",
      input: "in",
      output: "out",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });
    await trail.log({
      agentId: "agent-2",
      sessionId: "s2",
      action: "tool_use",
      input: "in",
      output: "out",
      toolCalls: [],
      tokenUsage: { input: 5, output: 10, total: 15, cost: 0.0005 },
      cost: 0.0005,
      duration: 50,
      result: "failure",
      metadata: {},
    });

    expect(trail.query({ agentId: "agent-1" })).toHaveLength(1);
    expect(trail.query({ result: "failure" })).toHaveLength(1);
    expect(trail.query({ action: "tool_use" })).toHaveLength(1);
  });

  it("should export to CSV", async () => {
    await trail.log({
      agentId: "test",
      sessionId: "s1",
      action: "llm_call",
      input: "in",
      output: "out",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });

    const csv = await trail.export("csv");
    expect(csv).toContain("id,timestamp,agentId");
    expect(csv).toContain("llm_call");
  });

  it("should generate EU AI Act compliance report", async () => {
    await trail.log({
      agentId: "test",
      sessionId: "s1",
      action: "llm_call",
      input: "in",
      output: "out",
      toolCalls: [],
      tokenUsage: { input: 10, output: 20, total: 30, cost: 0.001 },
      cost: 0.001,
      duration: 100,
      result: "success",
      metadata: {},
    });

    const report = trail.generateComplianceReport("eu-ai-act");
    expect(report.standard).toBe("eu-ai-act");
    expect(report.summary.totalActions).toBe(1);
    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.sections.every((s) => s.status === "pass")).toBe(true);
  });

  // Cleanup
  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      /* cleanup */
    }
  });
});

describe("AutonomyManager", () => {
  it("should allow actions in supervision mode", () => {
    const mgr = new AutonomyManager({ level: AutonomyLevel.SUPERVISION });
    const result = mgr.canProceed("click");
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("should require approval in augmentation mode", () => {
    const mgr = new AutonomyManager({ level: AutonomyLevel.AUGMENTATION });
    const result = mgr.canProceed("click");
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("should escalate on failure threshold", () => {
    const mgr = new AutonomyManager({
      level: AutonomyLevel.SUPERVISION,
      autoEscalate: { onFailureCount: 2, onCostThreshold: 100, onSensitiveAction: false },
    });

    expect(mgr.recordFailure()).toBe(false);
    expect(mgr.recordFailure()).toBe(true);
    expect(mgr.isEscalated()).toBe(true);
    expect(mgr.canProceed("click").allowed).toBe(false);
  });

  it("should escalate on cost threshold", () => {
    const mgr = new AutonomyManager({
      level: AutonomyLevel.SUPERVISION,
      autoEscalate: { onFailureCount: 100, onCostThreshold: 1.0, onSensitiveAction: false },
    });

    expect(mgr.recordCost(0.5)).toBe(false);
    expect(mgr.recordCost(0.6)).toBe(true);
    expect(mgr.isEscalated()).toBe(true);
  });

  it("should block when cost limit reached", () => {
    const mgr = new AutonomyManager({
      level: AutonomyLevel.AUTONOMY,
      maxCostPerSession: 0.01,
    });

    mgr.recordCost(0.02);
    const result = mgr.canProceed("click");
    expect(result.allowed).toBe(false);
  });
});

describe("PermissionManager", () => {
  it("should allow all domains by default", () => {
    const mgr = new PermissionManager();
    expect(mgr.isDomainAllowed("example.com")).toBe(true);
    expect(mgr.isDomainAllowed("anything.org")).toBe(true);
  });

  it("should block listed domains", () => {
    const mgr = new PermissionManager({
      blockedDomains: ["evil.com"],
    });
    expect(mgr.isDomainAllowed("evil.com")).toBe(false);
    expect(mgr.isDomainAllowed("good.com")).toBe(true);
  });

  it("should support wildcard subdomain matching", () => {
    const mgr = new PermissionManager({
      allowedDomains: ["*.example.com"],
    });
    expect(mgr.isDomainAllowed("api.example.com")).toBe(true);
    expect(mgr.isDomainAllowed("example.com")).toBe(true);
    expect(mgr.isDomainAllowed("other.com")).toBe(false);
  });

  it("should check action permissions", () => {
    const mgr = new PermissionManager({
      blockedActions: ["navigate"],
    });
    expect(mgr.isActionAllowed("click")).toBe(true);
    expect(mgr.isActionAllowed("navigate")).toBe(false);
  });

  it("should validate URLs", () => {
    const mgr = new PermissionManager({
      allowedDomains: ["example.com"],
    });
    expect(mgr.isUrlAllowed("https://example.com/page").allowed).toBe(true);
    expect(mgr.isUrlAllowed("https://other.com/page").allowed).toBe(false);
    expect(mgr.isUrlAllowed("not-a-url").allowed).toBe(false);
  });

  it("should check file upload size", () => {
    const mgr = new PermissionManager({ maxFileUploadSize: 1000 });
    expect(mgr.isFileUploadAllowed(500).allowed).toBe(true);
    expect(mgr.isFileUploadAllowed(2000).allowed).toBe(false);
  });
});
