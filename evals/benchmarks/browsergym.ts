// ============================================================================
// Inspect Eval - Gymnasium-style Browser Environment for Agent Benchmarking
// ============================================================================

import { createTimer } from "@inspect/shared";

/** Observation from the browser environment */
export interface BrowserGymObservation {
  /** Current page URL */
  url: string;
  /** Page title */
  title: string;
  /** DOM snapshot or accessibility tree */
  domSnapshot: string;
  /** Screenshot (base64) */
  screenshot?: string;
  /** Error message if action failed */
  error?: string;
  /** Raw HTML content */
  html?: string;
  /** Console messages */
  console?: string[];
}

/** Action to take in the browser */
export interface BrowserGymAction {
  /** Action type */
  type: "click" | "type" | "scroll" | "navigate" | "select" | "hover" | "wait" | "done" | "noop";
  /** Target element selector or coordinates */
  target?: string;
  /** Value to type or select */
  value?: string;
  /** Scroll direction */
  direction?: "up" | "down" | "left" | "right";
  /** Amount (pixels for scroll, ms for wait) */
  amount?: number;
}

/** Task for the Gymnasium-style environment */
export interface BrowserGymTask {
  taskId: string;
  /** Task instruction */
  goal: string;
  /** Starting URL */
  startUrl: string;
  /** Maximum episode steps */
  maxSteps: number;
  /** Task category (e.g., "miniwob", "webarena", "workarena") */
  suite: string;
  /** Evaluation function name or config */
  evaluator?: string;
  /** Seed for reproducibility */
  seed?: number;
}

/** Step record in an episode */
export interface BrowserGymStep {
  stepIndex: number;
  observation: BrowserGymObservation;
  action: BrowserGymAction;
  reward: number;
  done: boolean;
  info: Record<string, unknown>;
}

/** Episode result */
export interface BrowserGymEpisode {
  taskId: string;
  goal: string;
  suite: string;
  steps: BrowserGymStep[];
  totalReward: number;
  success: boolean;
  numSteps: number;
  duration: number;
  error?: string;
}

/** BrowserGym summary */
export interface BrowserGymSummary {
  totalEpisodes: number;
  successCount: number;
  successRate: number;
  averageReward: number;
  averageSteps: number;
  bySuite: Array<{ suite: string; episodes: number; successRate: number; avgReward: number }>;
  totalDuration: number;
}

/** Environment interface - abstracts browser interaction */
export interface BrowserGymEnvironment {
  /** Reset the environment to the start of a task */
  reset(task: BrowserGymTask): Promise<BrowserGymObservation>;
  /** Execute an action and return the next observation */
  step(action: BrowserGymAction): Promise<{
    observation: BrowserGymObservation;
    reward: number;
    done: boolean;
    info: Record<string, unknown>;
  }>;
  /** Close the environment */
  close(): Promise<void>;
}

/** Agent policy that selects actions based on observations */
export interface BrowserGymPolicy {
  /** Select an action given the current observation and goal */
  act(
    goal: string,
    observation: BrowserGymObservation,
    history: BrowserGymStep[],
  ): Promise<BrowserGymAction>;
}

/**
 * BrowserGymBenchmark implements a Gymnasium-style evaluation loop
 * for browser-based agent tasks.
 *
 * Follows the standard RL loop: reset -> [observe -> act -> step] -> evaluate
 */
export class BrowserGymBenchmark {
  private tasks: BrowserGymTask[] = [];

  /**
   * Register tasks for evaluation.
   */
  setTasks(tasks: BrowserGymTask[]): void {
    this.tasks = tasks;
  }

  /**
   * Load tasks from a JSON file.
   */
  async loadTasks(filePath: string): Promise<BrowserGymTask[]> {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf-8");
    const raw = JSON.parse(content) as unknown[];

    this.tasks = (Array.isArray(raw) ? raw : [raw]).map((item: unknown, idx: number) => {
      const task = item as Record<string, unknown>;
      return {
        taskId: (task.task_id ?? `bg_${idx}`) as string,
        goal: (task.goal ?? task.instruction ?? "") as string,
        startUrl: (task.start_url ?? "") as string,
        maxSteps: (task.max_steps ?? 30) as number,
        suite: (task.suite ?? task.benchmark ?? "custom") as string,
        evaluator: task.evaluator as string | undefined,
        seed: task.seed as number | undefined,
      };
    });

    return this.tasks;
  }

  /**
   * Run a single episode (task) with the given agent policy.
   */
  async runEpisode(
    env: BrowserGymEnvironment,
    policy: BrowserGymPolicy,
    task: BrowserGymTask,
  ): Promise<BrowserGymEpisode> {
    const timer = createTimer();
    const steps: BrowserGymStep[] = [];
    let totalReward = 0;
    let success = false;

    try {
      // Reset environment
      let observation = await env.reset(task);

      for (let stepIdx = 0; stepIdx < task.maxSteps; stepIdx++) {
        // Agent selects action
        const action = await policy.act(task.goal, observation, steps);

        // Environment executes action
        const result = await env.step(action);

        const step: BrowserGymStep = {
          stepIndex: stepIdx,
          observation: result.observation,
          action,
          reward: result.reward,
          done: result.done,
          info: result.info,
        };

        steps.push(step);
        totalReward += result.reward;
        observation = result.observation;

        if (result.done) {
          success = totalReward > 0 || (result.info.success as boolean) === true;
          break;
        }

        // Check if agent signaled done
        if (action.type === "done") {
          success = totalReward > 0;
          break;
        }
      }
    } catch (error) {
      return {
        taskId: task.taskId,
        goal: task.goal,
        suite: task.suite,
        steps,
        totalReward,
        success: false,
        numSteps: steps.length,
        duration: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      taskId: task.taskId,
      goal: task.goal,
      suite: task.suite,
      steps,
      totalReward,
      success,
      numSteps: steps.length,
      duration: timer.elapsed(),
    };
  }

  /**
   * Run all tasks against an agent.
   */
  async runAll(
    env: BrowserGymEnvironment,
    policy: BrowserGymPolicy,
    options?: {
      limit?: number;
      suite?: string;
      onEpisodeComplete?: (episode: BrowserGymEpisode, index: number, total: number) => void;
    },
  ): Promise<{ episodes: BrowserGymEpisode[]; summary: BrowserGymSummary }> {
    let tasks = [...this.tasks];
    if (options?.suite) tasks = tasks.filter((t) => t.suite === options.suite);
    if (options?.limit) tasks = tasks.slice(0, options.limit);

    const episodes: BrowserGymEpisode[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const episode = await this.runEpisode(env, policy, tasks[i]);
      episodes.push(episode);
      options?.onEpisodeComplete?.(episode, i, tasks.length);
    }

    return { episodes, summary: this.summarize(episodes) };
  }

  private summarize(episodes: BrowserGymEpisode[]): BrowserGymSummary {
    const successCount = episodes.filter((e) => e.success).length;
    const totalDuration = episodes.reduce((s, e) => s + e.duration, 0);
    const totalSteps = episodes.reduce((s, e) => s + e.numSteps, 0);
    const totalReward = episodes.reduce((s, e) => s + e.totalReward, 0);

    const suites = new Map<string, BrowserGymEpisode[]>();
    for (const e of episodes) {
      if (!suites.has(e.suite)) suites.set(e.suite, []);
      suites.get(e.suite)!.push(e);
    }

    const bySuite = Array.from(suites.entries()).map(([suite, eps]) => ({
      suite,
      episodes: eps.length,
      successRate: eps.filter((e) => e.success).length / eps.length,
      avgReward: eps.reduce((s, e) => s + e.totalReward, 0) / eps.length,
    }));

    return {
      totalEpisodes: episodes.length,
      successCount,
      successRate: episodes.length > 0 ? successCount / episodes.length : 0,
      averageReward: episodes.length > 0 ? totalReward / episodes.length : 0,
      averageSteps: episodes.length > 0 ? totalSteps / episodes.length : 0,
      bySuite,
      totalDuration,
    };
  }
}
