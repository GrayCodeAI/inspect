/**
 * Dynamic Action System
 *
 * Generates and adapts actions dynamically based on context and feedback.
 * Supports custom action types, parameter inference, and runtime composition.
 */

import { EventEmitter } from "events";

export interface DynamicActionConfig {
  /** Enable dynamic action generation */
  enabled: boolean;
  /** Max custom actions per session */
  maxCustomActions: number;
  /** Action validation */
  validateActions: boolean;
  /** Allow runtime composition */
  allowComposition: boolean;
  /** On new action registered */
  onActionRegistered?: (action: CustomAction) => void;
  /** On action executed */
  onActionExecuted?: (result: ActionExecutionResult) => void;
}

export interface ActionDefinition {
  name: string;
  description: string;
  parameters: ActionParameter[];
  returns: ActionReturn;
  examples?: ActionExample[];
  constraints?: ActionConstraint[];
}

export interface ActionParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "selector";
  description: string;
  required: boolean;
  default?: unknown;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  pattern?: string;
  min?: number;
  max?: number;
  enum?: string[];
  custom?: (value: unknown) => boolean;
}

export interface ActionReturn {
  type: string;
  description: string;
}

export interface ActionExample {
  description: string;
  parameters: Record<string, unknown>;
  expectedResult?: unknown;
}

export interface ActionConstraint {
  type: "precondition" | "postcondition" | "invariant";
  description: string;
  check: (context: ExecutionContext) => boolean;
}

export interface CustomAction extends ActionDefinition {
  id: string;
  createdAt: number;
  usageCount: number;
  successRate: number;
  handler: (params: Record<string, unknown>, context: ExecutionContext) => Promise<unknown>;
  compose?: (actions: CustomAction[]) => CustomAction;
}

export interface ExecutionContext {
  sessionId: string;
  page?: unknown;
  memory?: Map<string, unknown>;
  previousActions: string[];
  metadata: Record<string, unknown>;
}

export interface ActionExecutionResult {
  actionId: string;
  actionName: string;
  parameters: Record<string, unknown>;
  result: unknown;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface ActionComposition {
  name: string;
  description: string;
  actions: Array<{ action: string; params: Record<string, unknown> }>;
  parallel: boolean;
  condition?: (context: ExecutionContext) => boolean;
}

export interface ActionTemplate {
  name: string;
  template: string;
  parameters: string[];
  description: string;
}

export const DEFAULT_DYNAMIC_ACTION_CONFIG: DynamicActionConfig = {
  enabled: true,
  maxCustomActions: 50,
  validateActions: true,
  allowComposition: true,
};

/**
 * Pre-built action templates
 */
export const ACTION_TEMPLATES: Record<string, ActionTemplate> = {
  clickAndWait: {
    name: "clickAndWait",
    template: "click -> wait -> verify",
    parameters: ["selector", "waitDuration", "verifySelector"],
    description: "Click an element and wait for verification",
  },
  fillAndSubmit: {
    name: "fillAndSubmit",
    template: "fill -> fill -> ... -> click",
    parameters: ["fields", "submitSelector"],
    description: "Fill multiple fields and submit form",
  },
  navigateAndVerify: {
    name: "navigateAndVerify",
    template: "navigate -> wait -> verify",
    parameters: ["url", "verifySelector", "timeout"],
    description: "Navigate to URL and verify page loaded",
  },
  extractAndValidate: {
    name: "extractAndValidate",
    template: "extract -> validate -> store",
    parameters: ["selector", "validation", "storageKey"],
    description: "Extract data, validate, and store in memory",
  },
};

/**
 * Dynamic Action System
 *
 * Manages custom actions with runtime registration and composition.
 */
export class DynamicActionSystem extends EventEmitter {
  private config: DynamicActionConfig;
  private actions = new Map<string, CustomAction>();
  private compositions = new Map<string, ActionComposition>();
  private executionHistory: ActionExecutionResult[] = [];

  constructor(config: Partial<DynamicActionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DYNAMIC_ACTION_CONFIG, ...config };
  }

  /**
   * Register a custom action
   */
  registerAction(definition: ActionDefinition, handler: CustomAction["handler"]): CustomAction {
    if (!this.config.enabled) {
      throw new Error("Dynamic actions are disabled");
    }

    if (this.actions.size >= this.config.maxCustomActions) {
      throw new Error(`Max custom actions (${this.config.maxCustomActions}) reached`);
    }

    // Validate definition
    if (this.config.validateActions) {
      this.validateDefinition(definition);
    }

    const action: CustomAction = {
      ...definition,
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      usageCount: 0,
      successRate: 0,
      handler,
    };

    this.actions.set(action.name, action);
    this.emit("action:registered", action);
    this.config.onActionRegistered?.(action);

    return action;
  }

  /**
   * Execute an action
   */
  async execute(
    actionName: string,
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionExecutionResult> {
    const action = this.actions.get(actionName);
    if (!action) {
      throw new Error(`Action not found: ${actionName}`);
    }

    // Validate parameters
    if (this.config.validateActions) {
      this.validateParameters(action, parameters);
    }

    // Check constraints
    if (action.constraints) {
      for (const constraint of action.constraints) {
        if (constraint.type === "precondition" && !constraint.check(context)) {
          throw new Error(`Precondition failed: ${constraint.description}`);
        }
      }
    }

    const startTime = Date.now();

    try {
      const result = await action.handler(parameters, context);

      const executionResult: ActionExecutionResult = {
        actionId: action.id,
        actionName: action.name,
        parameters,
        result,
        duration: Date.now() - startTime,
        success: true,
        timestamp: Date.now(),
      };

      this.updateActionStats(action, true);
      this.executionHistory.push(executionResult);
      this.emit("action:executed", executionResult);
      this.config.onActionExecuted?.(executionResult);

      return executionResult;
    } catch (error) {
      const executionResult: ActionExecutionResult = {
        actionId: action.id,
        actionName: action.name,
        parameters,
        result: null,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      this.updateActionStats(action, false);
      this.executionHistory.push(executionResult);
      this.emit("action:failed", executionResult);
      this.config.onActionExecuted?.(executionResult);

      throw error;
    }
  }

  /**
   * Compose actions into a workflow
   */
  composeActions(composition: ActionComposition): CustomAction {
    if (!this.config.allowComposition) {
      throw new Error("Action composition is disabled");
    }

    const composedAction: CustomAction = {
      id: `composed-${Date.now()}`,
      name: composition.name,
      description: composition.description,
      parameters: [],
      returns: { type: "object", description: "Composition results" },
      createdAt: Date.now(),
      usageCount: 0,
      successRate: 0,
      handler: async (params, context) => {
        const results: unknown[] = [];

        // Check condition
        if (composition.condition && !composition.condition(context)) {
          return { skipped: true, reason: "Condition not met" };
        }

        if (composition.parallel) {
          // Execute in parallel
          const promises = composition.actions.map((a) =>
            this.execute(a.action, { ...a.params, ...params }, context)
          );
          const parallelResults = await Promise.allSettled(promises);
          return { results: parallelResults };
        } else {
          // Execute sequentially
          for (const step of composition.actions) {
            const result = await this.execute(step.action, { ...step.params, ...params }, context);
            results.push(result);
          }
          return { results };
        }
      },
    };

    this.compositions.set(composition.name, composition);
    this.actions.set(composedAction.name, composedAction);

    return composedAction;
  }

  /**
   * Create action from template
   */
  createFromTemplate(
    templateName: keyof typeof ACTION_TEMPLATES,
    overrides: Partial<ActionDefinition>
  ): ActionDefinition {
    const template = ACTION_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return {
      name: overrides.name || template.name,
      description: overrides.description || template.description,
      parameters: overrides.parameters || [],
      returns: overrides.returns || { type: "void", description: "No return value" },
      examples: overrides.examples,
    };
  }

  /**
   * Generate action from natural language
   */
  async generateAction(
    description: string,
    examples?: ActionExample[]
  ): Promise<ActionDefinition> {
    // Parse description to infer parameters
    const parameters = this.inferParameters(description);

    return {
      name: this.generateActionName(description),
      description,
      parameters,
      returns: { type: "unknown", description: "Result of the action" },
      examples,
    };
  }

  /**
   * Get action by name
   */
  getAction(name: string): CustomAction | undefined {
    return this.actions.get(name);
  }

  /**
   * Get all actions
   */
  getAllActions(): CustomAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get popular actions
   */
  getPopularActions(limit = 10): CustomAction[] {
    return this.getAllActions()
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Get high success rate actions
   */
  getReliableActions(minSuccessRate = 0.8): CustomAction[] {
    return this.getAllActions().filter((a) => a.successRate >= minSuccessRate);
  }

  /**
   * Unregister action
   */
  unregisterAction(name: string): boolean {
    const deleted = this.actions.delete(name);
    this.compositions.delete(name);
    return deleted;
  }

  /**
   * Validate action definition
   */
  private validateDefinition(definition: ActionDefinition): void {
    if (!definition.name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(definition.name)) {
      throw new Error(`Invalid action name: ${definition.name}`);
    }

    if (!definition.description) {
      throw new Error("Action description is required");
    }

    for (const param of definition.parameters) {
      if (!param.name || !param.type) {
        throw new Error(`Invalid parameter definition: ${JSON.stringify(param)}`);
      }
    }
  }

  /**
   * Validate parameters
   */
  private validateParameters(
    action: CustomAction,
    parameters: Record<string, unknown>
  ): void {
    for (const param of action.parameters) {
      if (param.required && !(param.name in parameters)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }

      const value = parameters[param.name];
      if (value !== undefined && param.validation) {
        if (param.validation.pattern) {
          const regex = new RegExp(param.validation.pattern);
          if (!regex.test(String(value))) {
            throw new Error(`Parameter ${param.name} does not match pattern`);
          }
        }

        if (param.validation.min !== undefined && Number(value) < param.validation.min) {
          throw new Error(`Parameter ${param.name} below minimum`);
        }

        if (param.validation.max !== undefined && Number(value) > param.validation.max) {
          throw new Error(`Parameter ${param.name} above maximum`);
        }

        if (param.validation.enum && !param.validation.enum.includes(String(value))) {
          throw new Error(`Parameter ${param.name} not in allowed values`);
        }
      }
    }
  }

  /**
   * Update action statistics
   */
  private updateActionStats(action: CustomAction, success: boolean): void {
    action.usageCount++;
    const totalSuccess = action.successRate * (action.usageCount - 1) + (success ? 1 : 0);
    action.successRate = totalSuccess / action.usageCount;
  }

  /**
   * Infer parameters from description
   */
  private inferParameters(description: string): ActionParameter[] {
    const parameters: ActionParameter[] = [];

    // Simple keyword-based inference
    if (description.includes("selector") || description.includes("element")) {
      parameters.push({
        name: "selector",
        type: "selector",
        description: "CSS selector or element identifier",
        required: true,
      });
    }

    if (description.includes("URL") || description.includes("navigate")) {
      parameters.push({
        name: "url",
        type: "string",
        description: "URL to navigate to",
        required: true,
        validation: { pattern: "^https?://" },
      });
    }

    if (description.includes("text") || description.includes("type") || description.includes("fill")) {
      parameters.push({
        name: "text",
        type: "string",
        description: "Text to enter",
        required: true,
      });
    }

    if (description.includes("wait") || description.includes("timeout")) {
      parameters.push({
        name: "timeout",
        type: "number",
        description: "Timeout in milliseconds",
        required: false,
        default: 30000,
        validation: { min: 0, max: 300000 },
      });
    }

    return parameters;
  }

  /**
   * Generate action name from description
   */
  private generateActionName(description: string): string {
    // Extract key words and convert to camelCase
    const words = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split("\s+")
      .filter((w) => w.length > 3);

    if (words.length === 0) {
      return `action-${Date.now()}`;
    }

    return words
      .slice(0, 3)
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join("");
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): ActionExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Get execution stats
   */
  getStats(): {
    totalActions: number;
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
  } {
    if (this.executionHistory.length === 0) {
      return {
        totalActions: this.actions.size,
        totalExecutions: 0,
        successRate: 0,
        averageDuration: 0,
      };
    }

    const successful = this.executionHistory.filter((e) => e.success).length;

    return {
      totalActions: this.actions.size,
      totalExecutions: this.executionHistory.length,
      successRate: successful / this.executionHistory.length,
      averageDuration:
        this.executionHistory.reduce((sum, e) => sum + e.duration, 0) /
        this.executionHistory.length,
    };
  }
}

/**
 * Convenience function
 */
export function createDynamicActionSystem(
  config?: Partial<DynamicActionConfig>
): DynamicActionSystem {
  return new DynamicActionSystem(config);
}
