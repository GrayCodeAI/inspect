import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { MultiAgentOrchestrator } from "./multi-agent/orchestrator.js";

describe("MultiAgentOrchestrator", () => {
  let orchestrator: MultiAgentOrchestrator;

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator();
  });

  describe("coordinateAgents", () => {
    it("should coordinate multiple agents to solve a problem", async () => {
      const result = await Effect.runPromise(
        orchestrator.coordinateAgents({
          problem: "Test problem",
          agents: ["agent1", "agent2"],
          maxRounds: 3,
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("solution");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("steps");
    });

    it("should handle agent failures gracefully", async () => {
      const result = await Effect.runPromise(
        orchestrator.coordinateAgents(
          {
            problem: "Test problem",
            agents: ["agent1", "agent2"],
            maxRounds: 3,
          },
          {
            maxRetries: 2,
            timeoutMs: 5000,
          },
        ),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.success).toBe(true);
    });

    it("should respect maxRounds limit", async () => {
      const result = await Effect.runPromise(
        orchestrator.coordinateAgents(
          {
            problem: "Test problem",
            agents: ["agent1", "agent2"],
            maxRounds: 1,
          },
          {
            maxRetries: 2,
            timeoutMs: 5000,
          },
        ),
      );
      expect(result.rounds).toEqual(1);
    });
  });

  describe("getAgentStatus", () => {
    it("should return status of all agents", async () => {
      const status = await Effect.runPromise(orchestrator.getAgentStatus());
      expect(status).toBeInstanceOf(Array);
      expect(status).toHaveLength(0); // Initially no agents
    });
  });

  describe("executeTask", () => {
    it("should execute a task using the specified agent", async () => {
      const result = await Effect.runPromise(
        orchestrator.executeTask({
          agent: "agent1",
          task: "Test task",
          timeoutMs: 5000,
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("completed");
      expect(result).toHaveProperty("output");
    });

    it("should handle task timeouts", async () => {
      const result = await Effect.runPromise(
        orchestrator.executeTask({
          agent: "agent1",
          task: "Long running task",
          timeoutMs: 100,
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.timedOut).toBe(true);
    });
  });

  describe("monitorAgents", () => {
    it("should monitor agent health and restart if needed", async () => {
      const events: Array<{ type: string; data: unknown }> = [];
      orchestrator.on("agent:health", (_data: unknown) =>
        events.push({ type: "agent:health", data: _data }),
      );
      orchestrator.on("agent:restarted", (_data: unknown) =>
        events.push({ type: "agent:restarted", data: _data }),
      );

      await Effect.runPromise(orchestrator.monitorAgents());

      // Simulate some agent events
      orchestrator.emitAgentEvent("agent1", "heartbeat", { status: "healthy" });
      orchestrator.emitAgentEvent("agent2", "heartbeat", { status: "unhealthy" });

      // Allow some time for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(events).toHaveLength(2);
      expect(events[0].type).toEqual("agent:health");
      expect(events[1].type).toEqual("agent:restarted");
    });
  });
});
