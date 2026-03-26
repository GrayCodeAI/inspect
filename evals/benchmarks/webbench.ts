// ============================================================================
// WebBench - Web Understanding Benchmark
// ============================================================================

import { readFile } from "node:fs/promises";
import { createTimer } from "@inspect/shared";

/** WebBench task categories */
export type WebBenchCategory =
  | "understanding"
  | "grounding"
  | "reasoning"
  | "planning"
  | "coding"
  | "qa";

/** WebBench task */
export interface WebBenchTask {
  taskId: string;
  category: WebBenchCategory;
  instruction: string;
  context: string;
  /** Expected answer (free-form or structured) */
  expectedAnswer: string;
  /** HTML/screenshot context */
  pageContent?: string;
  /** Screenshot (base64) */
  screenshot?: string;
  /** URL of the page */
  url?: string;
}

/** WebBench result */
export interface WebBenchResult {
  taskId: string;
  category: WebBenchCategory;
  instruction: string;
  agentAnswer: string;
  expectedAnswer: string;
  /** Score 0-1 (partial credit possible) */
  score: number;
  duration: number;
  error?: string;
}

/** WebBench summary */
export interface WebBenchSummary {
  totalTasks: number;
  averageScore: number;
  byCategory: Array<{ category: WebBenchCategory; tasks: number; averageScore: number }>;
  totalDuration: number;
}

/** Agent interface */
export interface WebBenchAgent {
  answer(
    instruction: string,
    context: string,
    screenshot?: string,
  ): Promise<{ answer: string }>;
}

/**
 * WebBenchmark evaluates web understanding capabilities including
 * grounding, reasoning, planning, and question answering.
 */
export class WebBenchmark {
  private tasks: WebBenchTask[] = [];

  async loadTasks(filePath: string): Promise<WebBenchTask[]> {
    const content = await readFile(filePath, "utf-8");
    const raw = JSON.parse(content) as unknown[];

    this.tasks = (Array.isArray(raw) ? raw : [raw]).map((item: unknown, idx: number) => {
      const task = item as Record<string, unknown>;
      return {
        taskId: (task.task_id ?? task.id ?? `wb_${idx}`) as string,
        category: (task.category ?? "understanding") as WebBenchCategory,
        instruction: (task.instruction ?? task.question ?? "") as string,
        context: (task.context ?? task.html ?? "") as string,
        expectedAnswer: (task.expected_answer ?? task.answer ?? "") as string,
        pageContent: task.page_content as string | undefined,
        screenshot: task.screenshot as string | undefined,
        url: task.url as string | undefined,
      };
    });

    return this.tasks;
  }

  async runTask(agent: WebBenchAgent, task: WebBenchTask): Promise<WebBenchResult> {
    const timer = createTimer();

    try {
      const result = await agent.answer(task.instruction, task.context, task.screenshot);

      const score = this.scoreAnswer(result.answer, task.expectedAnswer, task.category);

      return {
        taskId: task.taskId,
        category: task.category,
        instruction: task.instruction,
        agentAnswer: result.answer,
        expectedAnswer: task.expectedAnswer,
        score,
        duration: timer.elapsed(),
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        category: task.category,
        instruction: task.instruction,
        agentAnswer: "",
        expectedAnswer: task.expectedAnswer,
        score: 0,
        duration: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Score an answer against the expected answer.
   * Uses category-specific scoring strategies.
   */
  scoreAnswer(agentAnswer: string, expectedAnswer: string, category: WebBenchCategory): number {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const na = normalize(agentAnswer);
    const ne = normalize(expectedAnswer);

    // Exact match
    if (na === ne) return 1;

    // Contains match (partial credit)
    if (na.includes(ne) || ne.includes(na)) return 0.8;

    // Token overlap scoring
    const aTokens = new Set(na.split(" ").filter((t) => t.length > 2));
    const eTokens = new Set(ne.split(" ").filter((t) => t.length > 2));

    if (eTokens.size === 0) return na.length === 0 ? 1 : 0;

    let overlap = 0;
    for (const t of eTokens) {
      if (aTokens.has(t)) overlap++;
    }

    const recall = overlap / eTokens.size;
    const precision = aTokens.size > 0 ? overlap / aTokens.size : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return Math.round(f1 * 100) / 100;
  }

  async runAll(
    agent: WebBenchAgent,
    options?: {
      limit?: number;
      category?: WebBenchCategory;
      onTaskComplete?: (result: WebBenchResult, index: number, total: number) => void;
    },
  ): Promise<{ results: WebBenchResult[]; summary: WebBenchSummary }> {
    let tasks = [...this.tasks];
    if (options?.category) tasks = tasks.filter((t) => t.category === options.category);
    if (options?.limit) tasks = tasks.slice(0, options.limit);

    const results: WebBenchResult[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const result = await this.runTask(agent, tasks[i]);
      results.push(result);
      options?.onTaskComplete?.(result, i, tasks.length);
    }

    return { results, summary: this.summarize(results) };
  }

  private summarize(results: WebBenchResult[]): WebBenchSummary {
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);
    const averageScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;

    const categories = new Map<WebBenchCategory, WebBenchResult[]>();
    for (const r of results) {
      if (!categories.has(r.category)) categories.set(r.category, []);
      categories.get(r.category)!.push(r);
    }

    const byCategory = Array.from(categories.entries()).map(([category, rs]) => ({
      category,
      tasks: rs.length,
      averageScore: rs.reduce((s, r) => s + r.score, 0) / rs.length,
    }));

    return { totalTasks: results.length, averageScore, byCategory, totalDuration };
  }
}
