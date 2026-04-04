import { createLogger } from "@inspect/observability";

const _logger = createLogger("agent/orchestration/graph");

// ─── Types ────────────────────────────────────────────────────────────────

export interface GraphState {
  variables: Record<string, unknown>;
  stepResults: Map<string, unknown>;
  errors: Map<string, Error>;
  metadata: Record<string, unknown>;
}

export interface AgentNode {
  id: string;
  name: string;
  /** Agent execution function */
  execute: (input: unknown, state: GraphState) => Promise<unknown>;
  /** Condition for conditional execution */
  condition?: (state: GraphState) => boolean;
  /** Timeout in ms (default: 60000) */
  timeout?: number;
  /** Max retries (default: 1) */
  retries?: number;
}

export interface AgentEdge {
  from: string;
  to: string;
  /** Conditional routing */
  condition?: (output: unknown, state: GraphState) => boolean;
  /** Data transformation between nodes */
  transform?: (output: unknown) => unknown;
}

export type GraphEventType =
  | "graph:started"
  | "graph:completed"
  | "graph:error"
  | "node:started"
  | "node:completed"
  | "node:failed"
  | "node:skipped";

export interface GraphEvent {
  type: GraphEventType;
  nodeId?: string;
  data?: unknown;
  timestamp: number;
}

export interface GraphResult {
  success: boolean;
  state: GraphState;
  nodeResults: Map<string, unknown>;
  errors: Map<string, Error>;
  duration: number;
  nodesExecuted: number;
  nodesFailed: number;
}

export interface SerializedGraph {
  nodes: Array<{ id: string; name: string; timeout?: number; retries?: number }>;
  edges: Array<{ from: string; to: string }>;
  parallelGroups: string[][];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── AgentGraph ───────────────────────────────────────────────────────────

/**
 * DAG-based agent graph for multi-agent orchestration.
 * Supports parallel execution, conditional routing, and fan-out/fan-in.
 */
export class AgentGraph {
  private nodes = new Map<string, AgentNode>();
  private edges: AgentEdge[] = [];
  private parallelGroups: string[][] = [];
  private eventHandlers = new Map<GraphEventType, Array<(event: GraphEvent) => void>>();

  /**
   * Add an agent node to the graph.
   */
  addNode(node: AgentNode): this {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node "${node.id}" already exists`);
    }
    this.nodes.set(node.id, node);
    return this;
  }

  /**
   * Add a directed edge between two nodes.
   */
  addEdge(edge: AgentEdge): this {
    if (!this.nodes.has(edge.from)) {
      throw new Error(`Source node "${edge.from}" does not exist`);
    }
    if (!this.nodes.has(edge.to)) {
      throw new Error(`Target node "${edge.to}" does not exist`);
    }
    this.edges.push(edge);
    return this;
  }

  /**
   * Mark nodes as parallel (execute concurrently).
   */
  addParallel(nodeIds: string[]): this {
    for (const id of nodeIds) {
      if (!this.nodes.has(id)) {
        throw new Error(`Node "${id}" does not exist`);
      }
    }
    this.parallelGroups.push(nodeIds);
    return this;
  }

  /**
   * Fan-out: one source to multiple targets.
   */
  addFanOut(sourceId: string, targetIds: string[]): this {
    for (const targetId of targetIds) {
      this.addEdge({ from: sourceId, to: targetId });
    }
    return this;
  }

  /**
   * Fan-in: multiple sources to one target.
   */
  addFanIn(sourceIds: string[], targetId: string): this {
    for (const sourceId of sourceIds) {
      this.addEdge({ from: sourceId, to: targetId });
    }
    return this;
  }

  /**
   * Subscribe to graph events.
   */
  on(type: GraphEventType, handler: (event: GraphEvent) => void): this {
    const handlers = this.eventHandlers.get(type) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(type, handlers);
    return this;
  }

  /**
   * Execute the graph with topological ordering and parallel support.
   */
  async execute(initialState?: Partial<GraphState>): Promise<GraphResult> {
    const startTime = Date.now();
    const state: GraphState = {
      variables: initialState?.variables ?? {},
      stepResults: new Map(),
      errors: new Map(),
      metadata: initialState?.metadata ?? {},
    };

    this.emit({ type: "graph:started", timestamp: Date.now() });

    const executionOrder = this.topologicalSort();
    const nodeResults = new Map<string, unknown>();
    const errors = new Map<string, Error>();
    let nodesExecuted = 0;
    let nodesFailed = 0;

    try {
      // Execute in topological order, respecting parallel groups
      for (const batch of executionOrder) {
        const parallelNodes = batch.filter((id) => {
          const node = this.nodes.get(id)!;
          return !node.condition || node.condition(state);
        });

        const skippedNodes = batch.filter((id) => {
          const node = this.nodes.get(id)!;
          return node.condition && !node.condition(state);
        });

        // Mark skipped nodes
        for (const id of skippedNodes) {
          this.emit({ type: "node:skipped", nodeId: id, timestamp: Date.now() });
        }

        if (parallelNodes.length === 0) continue;

        // Execute batch in parallel
        const promises = parallelNodes.map(async (nodeId) => {
          const node = this.nodes.get(nodeId)!;
          const input = this.getNodeInput(nodeId, nodeResults);

          this.emit({ type: "node:started", nodeId, timestamp: Date.now() });

          const maxRetries = node.retries ?? 1;
          let lastError: Error | undefined;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              const timeout = node.timeout ?? 60_000;
              const result = await Promise.race([
                node.execute(input, state),
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Node "${nodeId}" timed out after ${timeout}ms`)),
                    timeout,
                  ),
                ),
              ]);

              nodeResults.set(nodeId, result);
              state.stepResults.set(nodeId, result);
              nodesExecuted++;

              this.emit({ type: "node:completed", nodeId, data: result, timestamp: Date.now() });
              return;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
              if (attempt < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
              }
            }
          }

          // All retries failed
          errors.set(nodeId, lastError!);
          state.errors.set(nodeId, lastError!);
          nodesFailed++;
          this.emit({ type: "node:failed", nodeId, data: lastError, timestamp: Date.now() });
        });

        await Promise.all(promises);
      }

      const success = errors.size === 0;
      this.emit({
        type: success ? "graph:completed" : "graph:error",
        timestamp: Date.now(),
        data: { nodesExecuted, nodesFailed },
      });

      return {
        success,
        state,
        nodeResults,
        errors,
        duration: Date.now() - startTime,
        nodesExecuted,
        nodesFailed,
      };
    } catch (err) {
      this.emit({ type: "graph:error", timestamp: Date.now(), data: err });
      return {
        success: false,
        state,
        nodeResults,
        errors: new Map([
          ...errors,
          ["__graph__", err instanceof Error ? err : new Error(String(err))],
        ]),
        duration: Date.now() - startTime,
        nodesExecuted,
        nodesFailed,
      };
    }
  }

  /**
   * Validate the graph structure.
   */
  validate(): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for cycles
    try {
      this.topologicalSort();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // Check for unreachable nodes
    const reachable = new Set<string>();
    const incomingEdges = new Map<string, number>();
    for (const node of this.nodes.keys()) {
      incomingEdges.set(node, 0);
    }
    for (const edge of this.edges) {
      incomingEdges.set(edge.to, (incomingEdges.get(edge.to) ?? 0) + 1);
    }
    // Nodes with no incoming edges are entry points
    const entryPoints = [...this.nodes.keys()].filter((id) => (incomingEdges.get(id) ?? 0) === 0);
    if (entryPoints.length === 0 && this.nodes.size > 0) {
      warnings.push("No entry points found — graph may have cycles");
    }

    // Check for dead-end nodes (no outgoing edges and not a terminal)
    for (const nodeId of this.nodes.keys()) {
      const hasOutgoing = this.edges.some((e) => e.from === nodeId);
      if (!hasOutgoing) {
        reachable.add(nodeId); // terminal nodes are reachable
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Serialize graph to JSON.
   */
  toJSON(): SerializedGraph {
    return {
      nodes: [...this.nodes.values()].map((n) => ({
        id: n.id,
        name: n.name,
        timeout: n.timeout,
        retries: n.retries,
      })),
      edges: this.edges.map((e) => ({ from: e.from, to: e.to })),
      parallelGroups: this.parallelGroups,
    };
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.length;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private getNodeInput(nodeId: string, results: Map<string, unknown>): unknown {
    const incomingEdges = this.edges.filter((e) => e.to === nodeId);
    if (incomingEdges.length === 0) return undefined;
    if (incomingEdges.length === 1) {
      const edge = incomingEdges[0];
      const output = results.get(edge.from);
      return edge.transform ? edge.transform(output) : output;
    }
    // Multiple inputs — merge into object
    const inputs: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      if (
        edge.condition &&
        !edge.condition(results.get(edge.from), {
          variables: {},
          stepResults: results,
          errors: new Map(),
          metadata: {},
        })
      ) {
        continue;
      }
      const output = results.get(edge.from);
      inputs[edge.from] = edge.transform ? edge.transform(output) : output;
    }
    return inputs;
  }

  /**
   * Topological sort returning batches of nodes that can execute in parallel.
   */
  private topologicalSort(): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of this.nodes.keys()) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }

    for (const edge of this.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      adjacency.get(edge.from)!.push(edge.to);
    }

    const batches: string[][] = [];
    const visited = new Set<string>();

    while (visited.size < this.nodes.size) {
      // Find all nodes with 0 in-degree (not yet visited)
      const batch = [...this.nodes.keys()].filter(
        (id) => !visited.has(id) && (inDegree.get(id) ?? 0) === 0,
      );

      if (batch.length === 0) {
        const remaining = [...this.nodes.keys()].filter((id) => !visited.has(id));
        throw new Error(`Graph has a cycle involving nodes: ${remaining.join(", ")}`);
      }

      batches.push(batch);

      for (const nodeId of batch) {
        visited.add(nodeId);
        for (const neighbor of adjacency.get(nodeId) ?? []) {
          inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
        }
      }
    }

    return batches;
  }

  private emit(event: GraphEvent): void {
    const handlers = this.eventHandlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }
}
