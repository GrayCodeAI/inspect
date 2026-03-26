// ============================================================================
// Mind2Web Benchmark - Web Navigation Tasks
// https://arxiv.org/abs/2306.06070
// ============================================================================

import { readFile } from "node:fs/promises";
import { createTimer } from "@inspect/shared";

/** Mind2Web action type */
export type Mind2WebActionType = "click" | "type" | "select";

/** A single action step in a Mind2Web task */
export interface Mind2WebAction {
  /** Action type */
  actionType: Mind2WebActionType;
  /** Target element description */
  targetElement: string;
  /** Value to type or option to select (if applicable) */
  value?: string;
  /** Ground truth element ID or selector */
  groundTruthElement?: string;
  /** Screen position (if available) */
  position?: { x: number; y: number };
}

/** Mind2Web task definition */
export interface Mind2WebTask {
  taskId: string;
  /** Website domain */
  website: string;
  /** Website category */
  domain: string;
  /** High-level task instruction */
  instruction: string;
  /** Sequence of ground truth actions */
  actions: Mind2WebAction[];
  /** Starting URL */
  startUrl: string;
  /** Task annotation source */
  source?: string;
}

/** Result for a single action step */
export interface Mind2WebActionResult {
  /** Index of the action */
  index: number;
  /** Whether the action was correctly performed */
  correct: boolean;
  /** Whether the correct element was selected */
  elementMatch: boolean;
  /** Whether the action type was correct */
  actionTypeMatch: boolean;
  /** Agent's predicted action */
  predictedAction?: {
    actionType: string;
    targetElement: string;
    value?: string;
  };
  /** Ground truth action */
  groundTruth: Mind2WebAction;
}

/** Mind2Web task result */
export interface Mind2WebResult {
  taskId: string;
  instruction: string;
  website: string;
  /** Step-level results */
  actionResults: Mind2WebActionResult[];
  /** Element accuracy (correct elements / total actions) */
  elementAccuracy: number;
  /** Action F1 (correct element + action type) */
  actionF1: number;
  /** Step success rate (all actions in step correct) */
  stepSuccessRate: number;
  /** Task completion (all actions correct) */
  taskComplete: boolean;
  duration: number;
  error?: string;
}

/** Mind2Web benchmark summary */
export interface Mind2WebSummary {
  totalTasks: number;
  completedTasks: number;
  taskCompletionRate: number;
  averageElementAccuracy: number;
  averageActionF1: number;
  averageStepSuccess: number;
  byDomain: Array<{ domain: string; tasks: number; completionRate: number; elementAccuracy: number }>;
  totalDuration: number;
}

/** Agent interface for Mind2Web */
export interface Mind2WebAgent {
  /** Execute a task instruction and return predicted actions */
  execute(
    instruction: string,
    startUrl: string,
    maxSteps: number,
  ): Promise<Array<{ actionType: string; targetElement: string; value?: string }>>;
}

/**
 * Mind2WebBenchmark evaluates agents on real-world web navigation tasks
 * from the Mind2Web dataset.
 */
export class Mind2WebBenchmark {
  private tasks: Mind2WebTask[] = [];

  /**
   * Load tasks from a JSON file.
   */
  async loadTasks(filePath: string): Promise<Mind2WebTask[]> {
    const content = await readFile(filePath, "utf-8");
    const raw = JSON.parse(content) as unknown[];

    this.tasks = (Array.isArray(raw) ? raw : [raw]).map((item: unknown, idx: number) => {
      const task = item as Record<string, unknown>;
      const actions = (task.actions as unknown[] ?? []).map((a: unknown) => {
        const action = a as Record<string, unknown>;
        return {
          actionType: (action.action_type ?? action.actionType ?? "click") as Mind2WebActionType,
          targetElement: (action.target_element ?? action.targetElement ?? "") as string,
          value: action.value as string | undefined,
          groundTruthElement: action.element_id as string | undefined,
        };
      });

      return {
        taskId: (task.task_id ?? task.taskId ?? `m2w_${idx}`) as string,
        website: (task.website ?? "") as string,
        domain: (task.domain ?? task.subdomain ?? "general") as string,
        instruction: (task.confirmed_task ?? task.instruction ?? "") as string,
        actions,
        startUrl: (task.start_url ?? task.startUrl ?? "") as string,
        source: task.source as string | undefined,
      };
    });

    return this.tasks;
  }

  /**
   * Run a single Mind2Web task.
   */
  async runTask(agent: Mind2WebAgent, task: Mind2WebTask): Promise<Mind2WebResult> {
    const timer = createTimer();

    try {
      const predictedActions = await agent.execute(
        task.instruction,
        task.startUrl,
        task.actions.length + 5, // Allow some extra steps
      );

      // Compare predicted actions against ground truth
      const actionResults: Mind2WebActionResult[] = [];
      let elementCorrect = 0;
      let actionCorrect = 0;

      for (let i = 0; i < task.actions.length; i++) {
        const gt = task.actions[i];
        const pred = predictedActions[i];

        const elementMatch = pred
          ? this.fuzzyElementMatch(pred.targetElement, gt.targetElement)
          : false;
        const actionTypeMatch = pred
          ? pred.actionType.toLowerCase() === gt.actionType.toLowerCase()
          : false;
        const correct = elementMatch && actionTypeMatch;

        if (elementMatch) elementCorrect++;
        if (correct) actionCorrect++;

        actionResults.push({
          index: i,
          correct,
          elementMatch,
          actionTypeMatch,
          predictedAction: pred
            ? { actionType: pred.actionType, targetElement: pred.targetElement, value: pred.value }
            : undefined,
          groundTruth: gt,
        });
      }

      const totalActions = task.actions.length;
      const elementAccuracy = totalActions > 0 ? elementCorrect / totalActions : 0;
      const actionF1 = totalActions > 0 ? actionCorrect / totalActions : 0;
      const stepSuccessRate = totalActions > 0 ? actionCorrect / totalActions : 0;
      const taskComplete = actionCorrect === totalActions && totalActions > 0;

      return {
        taskId: task.taskId,
        instruction: task.instruction,
        website: task.website,
        actionResults,
        elementAccuracy,
        actionF1,
        stepSuccessRate,
        taskComplete,
        duration: timer.elapsed(),
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        instruction: task.instruction,
        website: task.website,
        actionResults: [],
        elementAccuracy: 0,
        actionF1: 0,
        stepSuccessRate: 0,
        taskComplete: false,
        duration: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run all tasks.
   */
  async runAll(
    agent: Mind2WebAgent,
    options?: {
      limit?: number;
      domain?: string;
      onTaskComplete?: (result: Mind2WebResult, index: number, total: number) => void;
    },
  ): Promise<{ results: Mind2WebResult[]; summary: Mind2WebSummary }> {
    let tasks = [...this.tasks];
    if (options?.domain) {
      tasks = tasks.filter((t) => t.domain === options.domain);
    }
    if (options?.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    const results: Mind2WebResult[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const result = await this.runTask(agent, tasks[i]);
      results.push(result);
      options?.onTaskComplete?.(result, i, tasks.length);
    }

    return { results, summary: this.summarize(results) };
  }

  /**
   * Fuzzy element matching - checks if the predicted element description
   * is similar to the ground truth.
   */
  private fuzzyElementMatch(predicted: string, groundTruth: string): boolean {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const p = normalize(predicted);
    const g = normalize(groundTruth);

    if (p === g) return true;
    if (p.includes(g) || g.includes(p)) return true;

    // Token overlap
    const pTokens = new Set(p.split(" "));
    const gTokens = new Set(g.split(" "));
    let overlap = 0;
    for (const t of pTokens) {
      if (gTokens.has(t)) overlap++;
    }
    const jaccardSimilarity = overlap / (pTokens.size + gTokens.size - overlap);
    return jaccardSimilarity >= 0.5;
  }

  private summarize(results: Mind2WebResult[]): Mind2WebSummary {
    const completed = results.filter((r) => r.taskComplete).length;
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);

    // By domain
    const domains = new Map<string, Mind2WebResult[]>();
    for (const r of results) {
      const domain = r.website || "unknown";
      if (!domains.has(domain)) domains.set(domain, []);
      domains.get(domain)!.push(r);
    }

    const byDomain = Array.from(domains.entries()).map(([domain, rs]) => ({
      domain,
      tasks: rs.length,
      completionRate: rs.filter((r) => r.taskComplete).length / rs.length,
      elementAccuracy: rs.reduce((s, r) => s + r.elementAccuracy, 0) / rs.length,
    }));

    return {
      totalTasks: results.length,
      completedTasks: completed,
      taskCompletionRate: results.length > 0 ? completed / results.length : 0,
      averageElementAccuracy: results.length > 0 ? results.reduce((s, r) => s + r.elementAccuracy, 0) / results.length : 0,
      averageActionF1: results.length > 0 ? results.reduce((s, r) => s + r.actionF1, 0) / results.length : 0,
      averageStepSuccess: results.length > 0 ? results.reduce((s, r) => s + r.stepSuccessRate, 0) / results.length : 0,
      byDomain,
      totalDuration,
    };
  }
}
