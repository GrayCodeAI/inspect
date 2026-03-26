// ============================================================================
// WebVoyager Benchmark - End-to-end Web Task Completion
// https://arxiv.org/abs/2401.13919
// ============================================================================

import { readFile } from "node:fs/promises";
import { createTimer } from "@inspect/shared";

/** WebVoyager task definition */
export interface WebVoyagerTask {
  taskId: string;
  /** Website name */
  website: string;
  /** Task instruction */
  instruction: string;
  /** Starting URL */
  startUrl: string;
  /** Expected end state description */
  expectedEndState: string;
  /** Maximum allowed steps */
  maxSteps: number;
  /** Evaluation criteria */
  evaluationCriteria?: string;
}

/** WebVoyager task result */
export interface WebVoyagerResult {
  taskId: string;
  website: string;
  instruction: string;
  /** Whether the task was completed successfully */
  success: boolean;
  /** Number of steps taken */
  steps: number;
  /** Final page URL */
  finalUrl?: string;
  /** Final page screenshot (base64) */
  finalScreenshot?: string;
  /** Agent's explanation of completion */
  agentExplanation?: string;
  duration: number;
  error?: string;
}

/** WebVoyager summary */
export interface WebVoyagerSummary {
  totalTasks: number;
  successCount: number;
  successRate: number;
  averageSteps: number;
  averageDuration: number;
  byWebsite: Array<{ website: string; tasks: number; successRate: number }>;
  totalDuration: number;
}

/** Agent interface for WebVoyager */
export interface WebVoyagerAgent {
  run(instruction: string, startUrl: string, maxSteps: number): Promise<{
    success: boolean;
    steps: number;
    finalUrl?: string;
    finalScreenshot?: string;
    explanation?: string;
  }>;
}

/**
 * WebVoyagerBenchmark evaluates web agents on end-to-end task
 * completion across real websites like Google Flights, Allrecipes, etc.
 */
export class WebVoyagerBenchmark {
  private tasks: WebVoyagerTask[] = [];

  async loadTasks(filePath: string): Promise<WebVoyagerTask[]> {
    const content = await readFile(filePath, "utf-8");
    const raw = JSON.parse(content) as unknown[];

    this.tasks = (Array.isArray(raw) ? raw : [raw]).map((item: unknown, idx: number) => {
      const task = item as Record<string, unknown>;
      return {
        taskId: (task.task_id ?? task.taskId ?? `wv_${idx}`) as string,
        website: (task.website ?? "") as string,
        instruction: (task.ques ?? task.instruction ?? task.question ?? "") as string,
        startUrl: (task.web ?? task.start_url ?? task.startUrl ?? "") as string,
        expectedEndState: (task.expected_end_state ?? "") as string,
        maxSteps: (task.max_steps ?? 15) as number,
        evaluationCriteria: task.evaluation_criteria as string | undefined,
      };
    });

    return this.tasks;
  }

  async runTask(agent: WebVoyagerAgent, task: WebVoyagerTask): Promise<WebVoyagerResult> {
    const timer = createTimer();

    try {
      const result = await agent.run(task.instruction, task.startUrl, task.maxSteps);

      return {
        taskId: task.taskId,
        website: task.website,
        instruction: task.instruction,
        success: result.success,
        steps: result.steps,
        finalUrl: result.finalUrl,
        finalScreenshot: result.finalScreenshot,
        agentExplanation: result.explanation,
        duration: timer.elapsed(),
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        website: task.website,
        instruction: task.instruction,
        success: false,
        steps: 0,
        duration: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async runAll(
    agent: WebVoyagerAgent,
    options?: {
      limit?: number;
      website?: string;
      onTaskComplete?: (result: WebVoyagerResult, index: number, total: number) => void;
    },
  ): Promise<{ results: WebVoyagerResult[]; summary: WebVoyagerSummary }> {
    let tasks = [...this.tasks];
    if (options?.website) tasks = tasks.filter((t) => t.website === options.website);
    if (options?.limit) tasks = tasks.slice(0, options.limit);

    const results: WebVoyagerResult[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const result = await this.runTask(agent, tasks[i]);
      results.push(result);
      options?.onTaskComplete?.(result, i, tasks.length);
    }

    return { results, summary: this.summarize(results) };
  }

  private summarize(results: WebVoyagerResult[]): WebVoyagerSummary {
    const successCount = results.filter((r) => r.success).length;
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);
    const totalSteps = results.reduce((s, r) => s + r.steps, 0);

    const websites = new Map<string, WebVoyagerResult[]>();
    for (const r of results) {
      if (!websites.has(r.website)) websites.set(r.website, []);
      websites.get(r.website)!.push(r);
    }

    const byWebsite = Array.from(websites.entries()).map(([website, rs]) => ({
      website,
      tasks: rs.length,
      successRate: rs.filter((r) => r.success).length / rs.length,
    }));

    return {
      totalTasks: results.length,
      successCount,
      successRate: results.length > 0 ? successCount / results.length : 0,
      averageSteps: results.length > 0 ? totalSteps / results.length : 0,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      byWebsite,
      totalDuration,
    };
  }
}
