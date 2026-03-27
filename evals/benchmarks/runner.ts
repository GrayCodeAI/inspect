// ──────────────────────────────────────────────────────────────────────────────
// evals/benchmarks/runner.ts - Agent Benchmark Runner
// ──────────────────────────────────────────────────────────────────────────────

/** Benchmark task definition */
export interface BenchmarkTask {
  id: string;
  name: string;
  suite: string;
  url: string;
  goal: string;
  maxSteps: number;
  timeout: number;
  validator?: (result: BenchmarkStepResult) => boolean;
}

/** Single step result during benchmark */
export interface BenchmarkStepResult {
  stepIndex: number;
  action: string;
  success: boolean;
  url: string;
  timestamp: number;
  error?: string;
}

/** Result for a single benchmark task */
export interface BenchmarkTaskResult {
  taskId: string;
  taskName: string;
  suite: string;
  success: boolean;
  steps: BenchmarkStepResult[];
  totalSteps: number;
  durationMs: number;
  reward: number;
  error?: string;
}

/** Aggregated benchmark results */
export interface BenchmarkResult {
  suite: string;
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  successRate: number;
  averageSteps: number;
  averageDurationMs: number;
  averageReward: number;
  results: BenchmarkTaskResult[];
  timestamp: number;
}

/** Benchmark comparison result */
export interface BenchmarkComparison {
  agentA: BenchmarkResult;
  agentB: BenchmarkResult;
  winRate: number;
  averageRewardDiff: number;
  averageStepsDiff: number;
}

/**
 * MiniWoB benchmark suite - small interactive web tasks.
 */
export const MINIWOB_TASKS: BenchmarkTask[] = [
  {
    id: "click-button",
    name: "Click Button",
    suite: "miniwob",
    url: "about:blank",
    goal: "Click the button",
    maxSteps: 5,
    timeout: 10_000,
  },
  {
    id: "click-checkbox",
    name: "Click Checkbox",
    suite: "miniwob",
    url: "about:blank",
    goal: "Check the checkbox",
    maxSteps: 5,
    timeout: 10_000,
  },
  {
    id: "enter-text",
    name: "Enter Text",
    suite: "miniwob",
    url: "about:blank",
    goal: "Type 'hello' in the input",
    maxSteps: 5,
    timeout: 10_000,
  },
  {
    id: "select-option",
    name: "Select Option",
    suite: "miniwob",
    url: "about:blank",
    goal: "Select 'Option B' from dropdown",
    maxSteps: 5,
    timeout: 10_000,
  },
  {
    id: "login-user",
    name: "Login Form",
    suite: "miniwob",
    url: "about:blank",
    goal: "Fill and submit the login form",
    maxSteps: 10,
    timeout: 15_000,
  },
];

/**
 * WebArena benchmark suite - realistic web application tasks.
 */
export const WEBARENA_TASKS: BenchmarkTask[] = [
  {
    id: "search-product",
    name: "Search Product",
    suite: "webarena",
    url: "about:blank",
    goal: "Search for a specific product",
    maxSteps: 15,
    timeout: 30_000,
  },
  {
    id: "add-to-cart",
    name: "Add to Cart",
    suite: "webarena",
    url: "about:blank",
    goal: "Add an item to the shopping cart",
    maxSteps: 15,
    timeout: 30_000,
  },
  {
    id: "checkout",
    name: "Checkout",
    suite: "webarena",
    url: "about:blank",
    goal: "Complete the checkout process",
    maxSteps: 25,
    timeout: 60_000,
  },
];

/**
 * WorkArena benchmark suite - enterprise application tasks.
 */
export const WORKARENA_TASKS: BenchmarkTask[] = [
  {
    id: "create-ticket",
    name: "Create Ticket",
    suite: "workarena",
    url: "about:blank",
    goal: "Create a support ticket",
    maxSteps: 20,
    timeout: 30_000,
  },
  {
    id: "update-status",
    name: "Update Status",
    suite: "workarena",
    url: "about:blank",
    goal: "Update ticket status to resolved",
    maxSteps: 15,
    timeout: 20_000,
  },
];

/** All benchmark suites */
export const BENCHMARK_SUITES: Record<string, BenchmarkTask[]> = {
  miniwob: MINIWOB_TASKS,
  webarena: WEBARENA_TASKS,
  workarena: WORKARENA_TASKS,
};

/**
 * Agent function type for benchmark execution.
 */
export type AgentFn = (task: BenchmarkTask) => Promise<{
  success: boolean;
  steps: BenchmarkStepResult[];
  error?: string;
}>;

/**
 * Benchmark runner for evaluating agent performance.
 * Supports parallel execution, multiple suites, and comparison.
 *
 * Usage:
 * ```ts
 * const runner = new BenchmarkRunner();
 * runner.addSuite("miniwob");
 * const result = await runner.run(async (task) => {
 *   // Execute agent
 *   return { success: true, steps: [] };
 * });
 * ```
 */
export class BenchmarkRunner {
  private tasks: BenchmarkTask[] = [];
  private concurrency: number = 1;

  /**
   * Add a benchmark suite.
   */
  addSuite(name: string): this {
    const suite = BENCHMARK_SUITES[name];
    if (suite) {
      this.tasks.push(...suite);
    }
    return this;
  }

  /**
   * Add a single task.
   */
  addTask(task: BenchmarkTask): this {
    this.tasks.push(task);
    return this;
  }

  /**
   * Set parallel execution concurrency.
   */
  withConcurrency(n: number): this {
    this.concurrency = n;
    return this;
  }

  /**
   * Run all tasks with the given agent function.
   */
  async run(agentFn: AgentFn): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const results: BenchmarkTaskResult[] = [];

    // Run tasks in batches based on concurrency
    for (let i = 0; i < this.tasks.length; i += this.concurrency) {
      const batch = this.tasks.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((task) => this.runTask(task, agentFn)),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        }
      }
    }

    const passed = results.filter((r) => r.success).length;
    const failed = results.length - passed;

    return {
      suite: [...new Set(this.tasks.map((t) => t.suite))].join(","),
      totalTasks: results.length,
      passedTasks: passed,
      failedTasks: failed,
      successRate: results.length > 0 ? passed / results.length : 0,
      averageSteps:
        results.length > 0 ? results.reduce((sum, r) => sum + r.totalSteps, 0) / results.length : 0,
      averageDurationMs:
        results.length > 0 ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length : 0,
      averageReward:
        results.length > 0 ? results.reduce((sum, r) => sum + r.reward, 0) / results.length : 0,
      results,
      timestamp: startTime,
    };
  }

  /**
   * Compare two benchmark results.
   */
  static compare(resultA: BenchmarkResult, resultB: BenchmarkResult): BenchmarkComparison {
    return {
      agentA: resultA,
      agentB: resultB,
      winRate: resultA.successRate / (resultA.successRate + resultB.successRate || 1),
      averageRewardDiff: resultA.averageReward - resultB.averageReward,
      averageStepsDiff: resultA.averageSteps - resultB.averageSteps,
    };
  }

  /**
   * Export results as JSON.
   */
  static export(result: BenchmarkResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate a leaderboard from multiple results.
   */
  static leaderboard(
    results: Array<{ agent: string; result: BenchmarkResult }>,
  ): Array<{ agent: string; score: number; rank: number }> {
    const sorted = results
      .map((r) => ({
        agent: r.agent,
        score:
          r.result.successRate * 100 + r.result.averageReward * 10 - r.result.averageSteps * 0.1,
      }))
      .sort((a, b) => b.score - a.score);

    return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private async runTask(task: BenchmarkTask, agentFn: AgentFn): Promise<BenchmarkTaskResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        agentFn(task),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Task timeout")), task.timeout),
        ),
      ]);

      return {
        taskId: task.id,
        taskName: task.name,
        suite: task.suite,
        success: result.success,
        steps: result.steps,
        totalSteps: result.steps.length,
        durationMs: Date.now() - startTime,
        reward: result.success ? 1.0 : 0.0,
        error: result.error,
      };
    } catch (error) {
      return {
        taskId: task.id,
        taskName: task.name,
        suite: task.suite,
        success: false,
        steps: [],
        totalSteps: 0,
        durationMs: Date.now() - startTime,
        reward: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
