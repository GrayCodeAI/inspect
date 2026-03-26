// ============================================================================
// GAIA Benchmark - General AI Assistant Benchmark
// https://arxiv.org/abs/2311.12983
// ============================================================================

import { readFile } from "node:fs/promises";
import { createTimer } from "@inspect/shared";

/** GAIA task definition */
export interface GAIATask {
  /** Unique task ID */
  taskId: string;
  /** Natural language question */
  question: string;
  /** Expected final answer */
  expectedAnswer: string;
  /** Difficulty level (1-3) */
  level: 1 | 2 | 3;
  /** Steps description (for annotation) */
  annotatorSteps?: string;
  /** Required file attachments */
  fileNames?: string[];
  /** Category tag */
  category?: string;
}

/** GAIA task result */
export interface GAIAResult {
  taskId: string;
  question: string;
  expectedAnswer: string;
  agentAnswer: string;
  correct: boolean;
  level: number;
  duration: number;
  steps: number;
  error?: string;
}

/** GAIA benchmark summary */
export interface GAIASummary {
  totalTasks: number;
  correct: number;
  accuracy: number;
  accuracyByLevel: { level: number; total: number; correct: number; accuracy: number }[];
  averageDuration: number;
  averageSteps: number;
  totalDuration: number;
}

/** Agent interface for running GAIA tasks */
export interface GAIAAgent {
  /** Run a GAIA task and return the final answer */
  run(question: string, files?: string[]): Promise<{ answer: string; steps: number }>;
}

/**
 * GAIABenchmark implements the GAIA evaluation protocol for
 * measuring general AI assistant capabilities on real-world tasks.
 */
export class GAIABenchmark {
  private tasks: GAIATask[] = [];

  /**
   * Load GAIA tasks from a JSONL file.
   * Expected format: one JSON object per line with question, expectedAnswer, level fields.
   */
  async loadTasks(filePath: string): Promise<GAIATask[]> {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    this.tasks = lines.map((line, index) => {
      const raw = JSON.parse(line) as Record<string, unknown>;
      return {
        taskId: (raw.task_id as string) ?? `gaia_${index}`,
        question: (raw.Question as string) ?? (raw.question as string) ?? "",
        expectedAnswer: (raw.Final_answer as string) ?? (raw.final_answer as string) ?? (raw.expectedAnswer as string) ?? "",
        level: (raw.Level as 1 | 2 | 3) ?? (raw.level as 1 | 2 | 3) ?? 1,
        annotatorSteps: raw.Annotator_steps as string | undefined,
        fileNames: raw.file_name ? [raw.file_name as string] : undefined,
        category: raw.category as string | undefined,
      };
    });

    return this.tasks;
  }

  /**
   * Run a single GAIA task.
   */
  async runTask(agent: GAIAAgent, task: GAIATask): Promise<GAIAResult> {
    const timer = createTimer();
    let agentAnswer = "";
    let steps = 0;

    try {
      const result = await agent.run(task.question, task.fileNames);
      agentAnswer = result.answer;
      steps = result.steps;
    } catch (error) {
      return {
        taskId: task.taskId,
        question: task.question,
        expectedAnswer: task.expectedAnswer,
        agentAnswer: "",
        correct: false,
        level: task.level,
        duration: timer.elapsed(),
        steps: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const correct = this.score(agentAnswer, task.expectedAnswer);

    return {
      taskId: task.taskId,
      question: task.question,
      expectedAnswer: task.expectedAnswer,
      agentAnswer,
      correct,
      level: task.level,
      duration: timer.elapsed(),
      steps,
    };
  }

  /**
   * Score a result by comparing the agent answer to the expected answer.
   * Uses exact match after normalization (lowercase, trim, strip punctuation).
   */
  score(agentAnswer: string, expectedAnswer: string): boolean {
    const normalize = (s: string): string =>
      s.toLowerCase()
        .trim()
        .replace(/[.,!?;:'"()[\]{}\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const normalizedAgent = normalize(agentAnswer);
    const normalizedExpected = normalize(expectedAnswer);

    // Exact match
    if (normalizedAgent === normalizedExpected) return true;

    // Check if expected is contained in agent answer (for longer answers)
    if (normalizedAgent.includes(normalizedExpected)) return true;

    // Check numeric equivalence
    const numAgent = parseFloat(normalizedAgent);
    const numExpected = parseFloat(normalizedExpected);
    if (!isNaN(numAgent) && !isNaN(numExpected) && Math.abs(numAgent - numExpected) < 0.001) {
      return true;
    }

    return false;
  }

  /**
   * Run all loaded tasks against an agent.
   */
  async runAll(
    agent: GAIAAgent,
    options?: {
      /** Maximum tasks to run (for subset evaluation) */
      limit?: number;
      /** Filter by level */
      level?: 1 | 2 | 3;
      /** Callback after each task */
      onTaskComplete?: (result: GAIAResult, index: number, total: number) => void;
    },
  ): Promise<{ results: GAIAResult[]; summary: GAIASummary }> {
    let tasks = [...this.tasks];

    if (options?.level) {
      tasks = tasks.filter((t) => t.level === options.level);
    }
    if (options?.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    const results: GAIAResult[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const result = await this.runTask(agent, tasks[i]);
      results.push(result);
      options?.onTaskComplete?.(result, i, tasks.length);
    }

    return { results, summary: this.summarize(results) };
  }

  /**
   * Compute summary statistics from results.
   */
  private summarize(results: GAIAResult[]): GAIASummary {
    const correct = results.filter((r) => r.correct).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);

    // Group by level
    const levels = [1, 2, 3];
    const accuracyByLevel = levels.map((level) => {
      const levelResults = results.filter((r) => r.level === level);
      const levelCorrect = levelResults.filter((r) => r.correct).length;
      return {
        level,
        total: levelResults.length,
        correct: levelCorrect,
        accuracy: levelResults.length > 0 ? levelCorrect / levelResults.length : 0,
      };
    }).filter((l) => l.total > 0);

    return {
      totalTasks: results.length,
      correct,
      accuracy: results.length > 0 ? correct / results.length : 0,
      accuracyByLevel,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      averageSteps: results.length > 0 ? totalSteps / results.length : 0,
      totalDuration,
    };
  }
}
