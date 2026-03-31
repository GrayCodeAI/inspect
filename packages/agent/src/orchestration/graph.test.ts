import { describe, it, expect } from "vitest";
import { AgentGraph } from "./graph.js";

describe("AgentGraph", () => {
  it("should execute nodes in topological order", async () => {
    const executionOrder: string[] = [];

    const graph = new AgentGraph();
    graph.addNode({
      id: "a",
      name: "Node A",
      execute: async () => { executionOrder.push("a"); return "a-result"; },
    });
    graph.addNode({
      id: "b",
      name: "Node B",
      execute: async () => { executionOrder.push("b"); return "b-result"; },
    });
    graph.addNode({
      id: "c",
      name: "Node C",
      execute: async () => { executionOrder.push("c"); return "c-result"; },
    });

    graph.addEdge({ from: "a", to: "b" });
    graph.addEdge({ from: "b", to: "c" });

    const result = await graph.execute();

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual(["a", "b", "c"]);
    expect(result.nodesExecuted).toBe(3);
    expect(result.nodeResults.size).toBe(3);
  });

  it("should execute parallel nodes concurrently", async () => {
    const graph = new AgentGraph();
    const startTimes = new Map<string, number>();
    const endTimes = new Map<string, number>();

    graph.addNode({
      id: "start",
      name: "Start",
      execute: async () => "start",
    });
    graph.addNode({
      id: "p1",
      name: "Parallel 1",
      execute: async () => {
        startTimes.set("p1", Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        endTimes.set("p1", Date.now());
        return "p1";
      },
    });
    graph.addNode({
      id: "p2",
      name: "Parallel 2",
      execute: async () => {
        startTimes.set("p2", Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        endTimes.set("p2", Date.now());
        return "p2";
      },
    });

    graph.addEdge({ from: "start", to: "p1" });
    graph.addEdge({ from: "start", to: "p2" });

    const result = await graph.execute();
    expect(result.success).toBe(true);

    // Both should start around the same time (parallel)
    const timeDiff = Math.abs((startTimes.get("p1") ?? 0) - (startTimes.get("p2") ?? 0));
    expect(timeDiff).toBeLessThan(20);
  });

  it("should skip nodes when condition is false", async () => {
    const graph = new AgentGraph();

    graph.addNode({
      id: "a",
      name: "Always runs",
      execute: async () => "a",
    });
    graph.addNode({
      id: "b",
      name: "Conditional",
      execute: async () => "b",
      condition: () => false,
    });

    graph.addEdge({ from: "a", to: "b" });

    const result = await graph.execute();
    expect(result.success).toBe(true);
    expect(result.nodesExecuted).toBe(1);
    expect(result.nodeResults.has("b")).toBe(false);
  });

  it("should handle node failures with retries", async () => {
    const graph = new AgentGraph();
    let attempts = 0;

    graph.addNode({
      id: "flaky",
      name: "Flaky node",
      execute: async () => {
        attempts++;
        if (attempts < 2) throw new Error("Temporary failure");
        return "success";
      },
      retries: 3,
    });

    const result = await graph.execute();
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  it("should detect cycles", () => {
    const graph = new AgentGraph();
    graph.addNode({ id: "a", name: "A", execute: async () => {} });
    graph.addNode({ id: "b", name: "B", execute: async () => {} });
    graph.addEdge({ from: "a", to: "b" });
    graph.addEdge({ from: "b", to: "a" });

    const validation = graph.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain("cycle");
  });

  it("should support fan-out and fan-in", async () => {
    const graph = new AgentGraph();

    graph.addNode({ id: "source", name: "Source", execute: async () => "data" });
    graph.addNode({ id: "worker1", name: "Worker 1", execute: async (input) => `w1:${input}` });
    graph.addNode({ id: "worker2", name: "Worker 2", execute: async (input) => `w2:${input}` });
    graph.addNode({ id: "collector", name: "Collector", execute: async (input) => input });

    graph.addFanOut("source", ["worker1", "worker2"]);
    graph.addFanIn(["worker1", "worker2"], "collector");

    const result = await graph.execute();
    expect(result.success).toBe(true);
    expect(result.nodesExecuted).toBe(4);
  });

  it("should emit events during execution", async () => {
    const graph = new AgentGraph();
    const events: string[] = [];

    graph.on("graph:started", () => events.push("graph:started"));
    graph.on("node:started", (e) => events.push(`node:started:${e.nodeId}`));
    graph.on("node:completed", (e) => events.push(`node:completed:${e.nodeId}`));
    graph.on("graph:completed", () => events.push("graph:completed"));

    graph.addNode({ id: "a", name: "A", execute: async () => "a" });
    await graph.execute();

    expect(events).toContain("graph:started");
    expect(events).toContain("node:started:a");
    expect(events).toContain("node:completed:a");
    expect(events).toContain("graph:completed");
  });

  it("should serialize to JSON", () => {
    const graph = new AgentGraph();
    graph.addNode({ id: "a", name: "A", execute: async () => {} });
    graph.addNode({ id: "b", name: "B", execute: async () => {} });
    graph.addEdge({ from: "a", to: "b" });

    const json = graph.toJSON();
    expect(json.nodes).toHaveLength(2);
    expect(json.edges).toHaveLength(1);
    expect(json.edges[0]).toEqual({ from: "a", to: "b" });
  });

  it("should transform data along edges", async () => {
    const graph = new AgentGraph();

    graph.addNode({ id: "source", name: "Source", execute: async () => ({ count: 5 }) });
    graph.addNode({
      id: "consumer",
      name: "Consumer",
      execute: async (input) => input,
    });
    graph.addEdge({
      from: "source",
      to: "consumer",
      transform: (output: unknown) => ({ doubled: output.count * 2 }),
    });

    const result = await graph.execute();
    expect(result.success).toBe(true);
    expect(result.nodeResults.get("consumer")).toEqual({ doubled: 10 });
  });

  it("should handle timeout", async () => {
    const graph = new AgentGraph();

    graph.addNode({
      id: "slow",
      name: "Slow node",
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return "done";
      },
      timeout: 50,
      retries: 1,
    });

    const result = await graph.execute();
    expect(result.success).toBe(false);
    expect(result.errors.get("slow")?.message).toContain("timed out");
  });
});
