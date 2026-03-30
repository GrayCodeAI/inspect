/**
 * Dynamic agent spawning factory.
 * Creates agents at runtime based on page content, task context, or templates.
 */

import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/orchestration/factory");

/** Agent template definition */
export interface AgentTemplate {
  name: string;
  description: string;
  factory: (config: Record<string, unknown>) => DynamicAgent;
  capabilities: string[];
}

/** A dynamically spawned agent */
export interface DynamicAgent {
  id: string;
  templateName: string;
  config: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
  status: "idle" | "running" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

/** Context passed to factory for agent creation */
export interface AgentContext {
  url: string;
  pageType: string;
  pageTitle: string;
  snapshot: string;
  parentAgentId?: string;
  metadata: Record<string, unknown>;
}

/**
 * AgentFactory creates dynamic agents from templates based on runtime context.
 *
 * Usage:
 * ```ts
 * const factory = new AgentFactory();
 * factory.registerTemplate("form-tester", formTesterTemplate);
 * const agent = factory.createAgent("form-tester", { url, formFields });
 * const result = await agent.execute(snapshot);
 * ```
 */
export class AgentFactory {
  private templates = new Map<string, AgentTemplate>();
  private spawnedAgents = new Map<string, DynamicAgent>();
  private idCounter = 0;

  /**
   * Register an agent template for later instantiation.
   */
  registerTemplate(template: AgentTemplate): void {
    this.templates.set(template.name, template);
    logger.debug("Registered agent template", { name: template.name });
  }

  /**
   * Create an agent from a registered template.
   */
  createAgent(templateName: string, config: Record<string, unknown> = {}): DynamicAgent {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(
        `Unknown agent template: "${templateName}". Available: ${[...this.templates.keys()].join(", ")}`,
      );
    }

    const id = `${templateName}-${++this.idCounter}-${Date.now()}`;
    const agent = template.factory(config);
    agent.id = id;
    agent.templateName = templateName;
    agent.config = config;
    agent.status = "idle";
    agent.createdAt = Date.now();

    this.spawnedAgents.set(id, agent);
    logger.debug("Spawned dynamic agent", { id, templateName });
    return agent;
  }

  /**
   * Analyze page context and suggest which agent templates to spawn.
   */
  suggestAgents(
    context: AgentContext,
  ): Array<{ templateName: string; confidence: number; reason: string }> {
    const suggestions: Array<{ templateName: string; confidence: number; reason: string }> = [];

    for (const [name, template] of this.templates) {
      for (const capability of template.capabilities) {
        if (context.pageType === capability || context.snapshot.includes(capability)) {
          suggestions.push({
            templateName: name,
            confidence: 0.8,
            reason: `Page type "${context.pageType}" matches capability "${capability}"`,
          });
        }
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions;
  }

  /**
   * Get all registered template names.
   */
  getAvailableTemplates(): string[] {
    return [...this.templates.keys()];
  }

  /**
   * Get a spawned agent by ID.
   */
  getAgent(id: string): DynamicAgent | undefined {
    return this.spawnedAgents.get(id);
  }

  /**
   * Get all spawned agents.
   */
  getSpawnedAgents(): DynamicAgent[] {
    return [...this.spawnedAgents.values()];
  }

  /**
   * Get agents by status.
   */
  getAgentsByStatus(status: DynamicAgent["status"]): DynamicAgent[] {
    return [...this.spawnedAgents.values()].filter((a) => a.status === status);
  }

  /**
   * Clean up completed/failed agents.
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [id, agent] of this.spawnedAgents) {
      if (agent.status === "completed" || agent.status === "failed") {
        this.spawnedAgents.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}

/**
 * Built-in agent templates for common testing scenarios.
 */
export const BuiltinTemplates = {
  /** Form tester template */
  formTester: (): AgentTemplate => ({
    name: "form-tester",
    description: "Tests form validation, submission, and error handling",
    capabilities: ["form", "auth", "checkout", "contact", "signup"],
    factory: (config) => ({
      id: "",
      templateName: "form-tester",
      config,
      status: "idle",
      createdAt: Date.now(),
      execute: async (input) => {
        return {
          type: "form-test",
          fields: (config.fields as string[]) ?? [],
          snapshot: input,
          tests: ["empty-submit", "invalid-data", "valid-submit", "error-messages"],
        };
      },
    }),
  }),

  /** Navigation tester template */
  navigationTester: (): AgentTemplate => ({
    name: "navigation-tester",
    description: "Tests navigation paths, links, and routing",
    capabilities: ["navigation", "dashboard", "landing", "docs"],
    factory: (config) => ({
      id: "",
      templateName: "navigation-tester",
      config,
      status: "idle",
      createdAt: Date.now(),
      execute: async (input) => {
        return {
          type: "navigation-test",
          links: (config.links as string[]) ?? [],
          snapshot: input,
          tests: ["all-links", "back-forward", "deep-links", "breadcrumbs"],
        };
      },
    }),
  }),

  /** API tester template */
  apiTester: (): AgentTemplate => ({
    name: "api-tester",
    description: "Tests API endpoints and data flow",
    capabilities: ["api", "rest", "graphql", "search"],
    factory: (config) => ({
      id: "",
      templateName: "api-tester",
      config,
      status: "idle",
      createdAt: Date.now(),
      execute: async (input) => {
        return {
          type: "api-test",
          endpoints: (config.endpoints as string[]) ?? [],
          snapshot: input,
          tests: ["status-codes", "response-schema", "error-handling", "rate-limits"],
        };
      },
    }),
  }),
};
