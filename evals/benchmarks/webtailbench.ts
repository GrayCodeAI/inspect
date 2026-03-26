// ============================================================================
// WebTailBench - Long-tail Web Task Benchmark
// ============================================================================

import { readFile } from "node:fs/promises";
import { createTimer } from "@inspect/shared";

/** WebTailBench task */
export interface WebTailTask {
  taskId: string;
  instruction: string;
  website: string;
  startUrl: string;
  expectedOutcome: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
}

/** WebTailBench result */
export interface WebTailResult {
  taskId: string;
  instruction: string;
  success: boolean;
  partialCredit: number;
  steps: number;
  duration: number;
  error?: string;
}

/** WebTailBench summary */
export interface WebTailSummary {
  totalTasks: number;
  successCount: number;
  successRate: number;
  averagePartialCredit: number;
  byDifficulty: Array<{ difficulty: string; tasks: number; successRate: number }>;
  byCategory: Array<{ category: string; tasks: number; successRate: number }>;
  totalDuration: number;
}

/** Agent interface */
export interface WebTailAgent {
  run(instruction: string, startUrl: string): Promise<{
    success: boolean;
    partialCredit?: number;
    steps: number;
  }>;
}

/**
 * WebTailBenchmark evaluates agents on long-tail web tasks
 * that are less common and harder to solve.
 */
export class WebTailBenchmark {
  private tasks: WebTailTask[] = [];

  async loadTasks(filePath: string): Promise<WebTailTask[]> {
    const content = await readFile(filePath, "utf-8");
    const raw = JSON.parse(content) as unknown[];

    this.tasks = (Array.isArray(raw) ? raw : [raw]).map((item: unknown, idx: number) => {
      const task = item as Record<string, unknown>;
      return {
        taskId: (task.task_id ?? `wt_${idx}`) as string,
        instruction: (task.instruction ?? task.question ?? "") as string,
        website: (task.website ?? "") as string,
        startUrl: (task.start_url ?? "") as string,
        expectedOutcome: (task.expected_outcome ?? "") as string,
        difficulty: (task.difficulty ?? "medium") as "easy" | "medium" | "hard",
        category: (task.category ?? "general") as string,
      };
    });

    return this.tasks;
  }

  async runTask(agent: WebTailAgent, task: WebTailTask): Promise<WebTailResult> {
    const timer = createTimer();

    try {
      const result = await agent.run(task.instruction, task.startUrl);
      return {
        taskId: task.taskId,
        instruction: task.instruction,
        success: result.success,
        partialCredit: result.partialCredit ?? (result.success ? 1 : 0),
        steps: result.steps,
        duration: timer.elapsed(),
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        instruction: task.instruction,
        success: false,
        partialCredit: 0,
        steps: 0,
        duration: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async runAll(
    agent: WebTailAgent,
    options?: {
      limit?: number;
      difficulty?: "easy" | "medium" | "hard";
      onTaskComplete?: (result: WebTailResult, index: number, total: number) => void;
    },
  ): Promise<{ results: WebTailResult[]; summary: WebTailSummary }> {
    let tasks = [...this.tasks];
    if (options?.difficulty) tasks = tasks.filter((t) => t.difficulty === options.difficulty);
    if (options?.limit) tasks = tasks.slice(0, options.limit);

    const results: WebTailResult[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const result = await this.runTask(agent, tasks[i]);
      results.push(result);
      options?.onTaskComplete?.(result, i, tasks.length);
    }

    return { results, summary: this.summarize(results) };
  }

  private summarize(results: WebTailResult[]): WebTailSummary {
    const successCount = results.filter((r) => r.success).length;
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);

    const difficulties = new Map<string, WebTailResult[]>();
    const categories = new Map<string, WebTailResult[]>();

    for (const r of results) {
      const task = this.tasks.find((t) => t.taskId === r.taskId);
      if (task) {
        if (!difficulties.has(task.difficulty)) difficulties.set(task.difficulty, []);
        difficulties.get(task.difficulty)!.push(r);
        if (!categories.has(task.category)) categories.set(task.category, []);
        categories.get(task.category)!.push(r);
      }
    }

    return {
      totalTasks: results.length,
      successCount,
      successRate: results.length > 0 ? successCount / results.length : 0,
      averagePartialCredit: results.length > 0 ? results.reduce((s, r) => s + r.partialCredit, 0) / results.length : 0,
      byDifficulty: Array.from(difficulties.entries()).map(([d, rs]) => ({
        difficulty: d,
        tasks: rs.length,
        successRate: rs.filter((r) => r.success).length / rs.length,
      })),
      byCategory: Array.from(categories.entries()).map(([c, rs]) => ({
        category: c,
        tasks: rs.length,
        successRate: rs.filter((r) => r.success).length / rs.length,
      })),
      totalDuration,
    };
  }
}
