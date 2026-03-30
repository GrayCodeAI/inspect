import { describe, it, expect } from "vitest";
import { AgentFactory, BuiltinTemplates } from "./factory.js";

describe("AgentFactory", () => {
  it("registers and creates agents from templates", () => {
    const factory = new AgentFactory();
    factory.registerTemplate(BuiltinTemplates.formTester());

    expect(factory.getAvailableTemplates()).toContain("form-tester");

    const agent = factory.createAgent("form-tester", { url: "https://example.com" });
    expect(agent.id).toBeTruthy();
    expect(agent.templateName).toBe("form-tester");
    expect(agent.status).toBe("idle");
  });

  it("throws on unknown template", () => {
    const factory = new AgentFactory();
    expect(() => factory.createAgent("nonexistent")).toThrow("Unknown agent template");
  });

  it("tracks spawned agents", () => {
    const factory = new AgentFactory();
    factory.registerTemplate(BuiltinTemplates.formTester());
    factory.registerTemplate(BuiltinTemplates.navigationTester());

    factory.createAgent("form-tester");
    factory.createAgent("navigation-tester");

    expect(factory.getSpawnedAgents()).toHaveLength(2);
  });

  it("suggests agents based on page context", () => {
    const factory = new AgentFactory();
    factory.registerTemplate(BuiltinTemplates.formTester());
    factory.registerTemplate(BuiltinTemplates.apiTester());

    const suggestions = factory.suggestAgents({
      url: "https://example.com/login",
      pageType: "auth",
      pageTitle: "Login",
      snapshot: "form with email and password fields",
      metadata: {},
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].templateName).toBeTruthy();
  });

  it("cleans up completed agents", async () => {
    const factory = new AgentFactory();
    factory.registerTemplate({
      name: "completer",
      description: "Completes immediately",
      capabilities: [],
      factory: (config) => ({
        id: "",
        templateName: "completer",
        config,
        status: "idle",
        createdAt: Date.now(),
        execute: async () => "done",
      }),
    });

    const a1 = factory.createAgent("completer");
    const a2 = factory.createAgent("completer");

    // Manually mark as completed for cleanup test
    a1.status = "completed";
    a2.status = "completed";

    const cleaned = factory.cleanup();
    expect(cleaned).toBe(2);
    expect(factory.getSpawnedAgents()).toHaveLength(0);
  });

  it("filters agents by status", () => {
    const factory = new AgentFactory();
    factory.registerTemplate({
      name: "mixed",
      description: "Mixed status",
      capabilities: [],
      factory: (config) => ({
        id: "",
        templateName: "mixed",
        config,
        status: "idle",
        createdAt: Date.now(),
        execute: async () => "done",
      }),
    });

    const a = factory.createAgent("mixed");
    a.status = "completed";

    expect(factory.getAgentsByStatus("completed")).toHaveLength(1);
    expect(factory.getAgentsByStatus("idle")).toHaveLength(0);
  });
});
