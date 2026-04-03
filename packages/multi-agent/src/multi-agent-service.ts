import { Effect, Layer, Option, ServiceMap } from "effect";
import { AgentConfig, AgentMessage, AgentResult, AgentTask } from "./agent-types.js";
import {
  AgentAlreadyRegisteredError,
  AgentNotFoundError,
  TaskAlreadyAssignedError,
  TaskNotFoundError,
} from "./errors.js";
import {
  A11Y_PROMPT,
  ORCHESTRATOR_PROMPT,
  PERFORMANCE_PROMPT,
  SECURITY_PROMPT,
  TESTER_PROMPT,
  UX_PROMPT,
} from "./specialist-prompts.js";

export interface LlmCallFn {
  (systemPrompt: string, userPrompt: string, model: string): Effect.Effect<string>;
}

export interface RegisteredAgent {
  readonly config: AgentConfig;
  readonly lastActivity: Date;
}

export type MultiAgentError =
  | AgentNotFoundError
  | TaskNotFoundError
  | TaskAlreadyAssignedError
  | AgentAlreadyRegisteredError;

export class MultiAgentOrchestrator extends ServiceMap.Service<MultiAgentOrchestrator>()(
  "@inspect/MultiAgentOrchestrator",
  {
    make: Effect.gen(function* () {
      const agents = new Map<string, RegisteredAgent>();
      const tasks = new Map<string, AgentTask>();
      const messages: AgentMessage[] = [];
      let llmCall: LlmCallFn | undefined;

      const setLlmCall = (fn: LlmCallFn) => {
        llmCall = fn;
      };

      const register = Effect.fn("MultiAgentOrchestrator.register")(function* (
        config: AgentConfig,
      ) {
        if (agents.has(config.name)) {
          return yield* new AgentAlreadyRegisteredError({ agentName: config.name });
        }
        agents.set(config.name, { config, lastActivity: new Date() });
        yield* Effect.logInfo("Agent registered", { name: config.name, role: config.role });
      });

      const unregister = Effect.fn("MultiAgentOrchestrator.unregister")(function* (name: string) {
        if (!agents.has(name)) {
          return yield* new AgentNotFoundError({ agentName: name });
        }
        agents.delete(name);
        yield* Effect.logInfo("Agent unregistered", { name });
      });

      const dispatch = Effect.fn("MultiAgentOrchestrator.dispatch")(function* (task: AgentTask) {
        const existingTask = tasks.get(task.id);
        if (existingTask && existingTask.assignedTo) {
          return yield* new TaskAlreadyAssignedError({ taskId: task.id });
        }

        let assignedTask = task;
        if (!task.assignedTo) {
          const targetRole = yield* determineRoleForTask(task.description);
          const targetAgent = findAgentByRole(agents, targetRole);
          if (Option.isSome(targetAgent)) {
            assignedTask = new AgentTask({
              ...task,
              assignedTo: targetAgent.value.config.name,
              status: "pending",
            });
          }
        }

        tasks.set(assignedTask.id, assignedTask);
        yield* Effect.logInfo("Task dispatched", {
          taskId: assignedTask.id,
          assignedTo: assignedTask.assignedTo,
        });
        return assignedTask;
      });

      const execute = Effect.fn("MultiAgentOrchestrator.execute")(function* (taskId: string) {
        const task = tasks.get(taskId);
        if (!task) {
          return yield* new TaskNotFoundError({ taskId });
        }
        if (!task.assignedTo) {
          return yield* new AgentNotFoundError({ agentName: "unassigned" });
        }

        const agent = agents.get(task.assignedTo);
        if (!agent) {
          return yield* new AgentNotFoundError({ agentName: task.assignedTo });
        }

        const inProgressTask = new AgentTask({ ...task, status: "in_progress" });
        tasks.set(taskId, inProgressTask);

        const startTime = Date.now();

        const response = llmCall
          ? yield* llmCall(agent.config.systemPrompt, task.description, agent.config.model)
          : generateMockResponse(agent.config.systemPrompt, task.description);

        const duration = Date.now() - startTime;
        const tokenCount = Math.ceil(response.length / 4);

        const completedTask = new AgentTask({
          ...task,
          status: "completed",
          result: response,
        });
        tasks.set(taskId, completedTask);

        const updatedAgent = { ...agent, lastActivity: new Date() };
        agents.set(agent.config.name, updatedAgent);

        const result = new AgentResult({
          taskId,
          agent: agent.config.name,
          status: "success",
          output: response,
          duration,
          tokenCount,
        });

        yield* Effect.logInfo("Task executed", {
          taskId,
          agent: agent.config.name,
          duration,
          tokenCount,
        });

        return result;
      });

      const broadcast = Effect.fn("MultiAgentOrchestrator.broadcast")(function* (
        message: string,
        from: string,
      ) {
        const sender = agents.get(from);
        if (!sender) {
          return yield* new AgentNotFoundError({ agentName: from });
        }

        const sentMessages: AgentMessage[] = [];
        const now = new Date();

        for (const [name] of agents) {
          if (name !== from) {
            const msg = new AgentMessage({
              from,
              to: name,
              content: message,
              timestamp: now,
              type: "broadcast",
            });
            messages.push(msg);
            sentMessages.push(msg);
          }
        }

        yield* Effect.logInfo("Message broadcast", { from, recipientCount: sentMessages.length });
        return sentMessages as readonly AgentMessage[];
      });

      const handoff = Effect.fn("MultiAgentOrchestrator.handoff")(function* (
        from: string,
        to: string,
        context: string,
      ) {
        if (!agents.has(from)) {
          return yield* new AgentNotFoundError({ agentName: from });
        }
        if (!agents.has(to)) {
          return yield* new AgentNotFoundError({ agentName: to });
        }

        const msg = new AgentMessage({
          from,
          to,
          content: context,
          timestamp: new Date(),
          type: "handoff",
        });
        messages.push(msg);

        yield* Effect.logInfo("Handoff completed", { from, to });
        return msg;
      });

      const getStatus = Effect.fn("MultiAgentOrchestrator.getStatus")(function* (taskId: string) {
        const task = tasks.get(taskId);
        if (!task) {
          return yield* new TaskNotFoundError({ taskId });
        }
        return task;
      });

      const getAllTasks = Effect.fn("MultiAgentOrchestrator.getAllTasks")(function* () {
        return Array.from(tasks.values()) as readonly AgentTask[];
      });

      const getAgents = Effect.fn("MultiAgentOrchestrator.getAgents")(function* () {
        return Array.from(agents.values()) as readonly RegisteredAgent[];
      });

      return {
        register,
        unregister,
        dispatch,
        execute,
        broadcast,
        handoff,
        getStatus,
        getAllTasks,
        getAgents,
        setLlmCall,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);

  static layerWithLlm = (llmCall: LlmCallFn) =>
    Layer.effect(this, this.make).pipe(
      Layer.tap(
        Effect.fn("MultiAgentOrchestrator.setLlmCall")(function* (service) {
          service.setLlmCall(llmCall);
        }),
      ),
    );
}

const generateMockResponse = (systemPrompt: string, userPrompt: string): string => {
  const roleKeywords = systemPrompt.toLowerCase();
  if (roleKeywords.includes("security")) {
    return "Security analysis complete. No critical vulnerabilities found. Recommend adding CSP headers and sanitizing user inputs on form submission.";
  }
  if (roleKeywords.includes("accessibility") || roleKeywords.includes("wcag")) {
    return "Accessibility audit complete. Found 2 AA violations: missing alt text on 1 image, insufficient color contrast on error state. Details in report.";
  }
  if (roleKeywords.includes("performance")) {
    return "Performance analysis complete. LCP: 1.2s, FCP: 0.8s. Bundle size increased by 12KB. Recommend lazy-loading the chart component.";
  }
  if (roleKeywords.includes("ux")) {
    return "UX review complete. Navigation flow is intuitive. Suggest adding loading states for async operations and improving error message clarity.";
  }
  if (roleKeywords.includes("orchestrator")) {
    return "Task decomposition complete. Split into 3 subtasks: functional testing (tester), security review (security), accessibility check (a11y). Dispatching to specialists.";
  }
  return `Testing complete for: ${userPrompt}. All critical paths verified. 0 failures detected.`;
};

const determineRoleForTask = (description: string): Effect.Effect<string> => {
  const lower = description.toLowerCase();
  if (
    lower.includes("security") ||
    lower.includes("xss") ||
    lower.includes("csrf") ||
    lower.includes("injection") ||
    lower.includes("auth")
  ) {
    return Effect.succeed("security");
  }
  if (
    lower.includes("accessibility") ||
    lower.includes("a11y") ||
    lower.includes("wcag") ||
    lower.includes("screen reader") ||
    lower.includes("keyboard")
  ) {
    return Effect.succeed("a11y");
  }
  if (
    lower.includes("performance") ||
    lower.includes("speed") ||
    lower.includes("load") ||
    lower.includes("render") ||
    lower.includes("bundle")
  ) {
    return Effect.succeed("performance");
  }
  if (
    lower.includes("ux") ||
    lower.includes("usability") ||
    lower.includes("design") ||
    lower.includes("responsive")
  ) {
    return Effect.succeed("ux");
  }
  return Effect.succeed("tester");
};

const findAgentByRole = (
  agents: Map<string, RegisteredAgent>,
  role: string,
): Option.Option<RegisteredAgent> => {
  for (const agent of agents.values()) {
    if (agent.config.role === role) {
      return Option.some(agent);
    }
  }
  return Option.none();
};

export const createDefaultAgentConfigs = (): readonly AgentConfig[] => {
  const rolePromptMap: Record<string, string> = {
    tester: TESTER_PROMPT,
    security: SECURITY_PROMPT,
    a11y: A11Y_PROMPT,
    performance: PERFORMANCE_PROMPT,
    ux: UX_PROMPT,
    orchestrator: ORCHESTRATOR_PROMPT,
  };

  const roles = ["tester", "security", "a11y", "performance", "ux", "orchestrator"] as const;
  return roles.map(
    (role) =>
      new AgentConfig({
        name: `${role}-agent`,
        role,
        model: "claude-sonnet-4-20250514",
        systemPrompt: rolePromptMap[role],
        tools: [
          "browser_navigate",
          "browser_click",
          "browser_type",
          "browser_evaluate",
          "browser_screenshot",
        ],
        maxSteps: 25,
      }),
  );
};
