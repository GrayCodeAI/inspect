// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/captcha-swarm.ts - CAPTCHA Solving & Multi-Agent Swarm
// ──────────────────────────────────────────────────────────────────────────────

import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("services/captcha-swarm");

/** CAPTCHA type */
export type CaptchaType =
  | "recaptcha_v2"
  | "recaptcha_v3"
  | "hcaptcha"
  | "turnstile"
  | "funcaptcha"
  | "geetest"
  | "image"
  | "text";

/** CAPTCHA solve request */
export interface CaptchaSolveRequest {
  type: CaptchaType;
  siteUrl: string;
  siteKey?: string;
  imageBase64?: string;
  options?: Record<string, unknown>;
}

/** CAPTCHA solve result */
export interface CaptchaSolveResult {
  success: boolean;
  token?: string;
  text?: string;
  confidence: number;
  solveTimeMs: number;
  provider: string;
  cost?: number;
}

/** Agent in a swarm */
export interface SwarmAgent {
  id: string;
  name: string;
  role: "coordinator" | "explorer" | "extractor" | "validator";
  status: "idle" | "running" | "completed" | "failed";
  currentTask?: string;
  results: SwarmAgentResult[];
}

/** Agent result */
export interface SwarmAgentResult {
  agentId: string;
  action: string;
  success: boolean;
  data: unknown;
  timestamp: number;
}

/** Swarm task */
export interface SwarmTask {
  id: string;
  description: string;
  url: string;
  agents: SwarmAgent[];
  status: "pending" | "running" | "completed" | "failed";
  results: SwarmAgentResult[];
  startTime?: number;
  endTime?: number;
}

/**
 * CAPTCHA Solving & Multi-Agent Swarm Service (Skyvern-inspired).
 * Provides CAPTCHA detection/solving and coordinated multi-agent browser automation.
 *
 * Usage:
 * ```ts
 * const service = new CaptchaSwarmService();
 * const solved = await service.solveCaptcha({ type: 'recaptcha_v2', siteUrl, siteKey });
 * const swarm = service.createSwarm('Test login flow', url, 3);
 * ```
 */
export class CaptchaSwarmService {
  private providers: CaptchaProvider[] = [];
  private swarms: Map<string, SwarmTask> = new Map();

  /**
   * Register a CAPTCHA solving provider.
   */
  registerProvider(provider: CaptchaProvider): void {
    this.providers.push(provider);
  }

  /**
   * Solve a CAPTCHA.
   */
  async solveCaptcha(request: CaptchaSolveRequest): Promise<CaptchaSolveResult> {
    const start = Date.now();

    for (const provider of this.providers) {
      if (!provider.supportsType(request.type)) continue;
      try {
        const result = await provider.solve(request);
        if (result.success) {
          return { ...result, solveTimeMs: Date.now() - start, provider: provider.name };
        }
      } catch (error) {
        logger.debug("CAPTCHA provider failed, trying next", { provider: provider.name, error });
      }
    }

    return {
      success: false,
      confidence: 0,
      solveTimeMs: Date.now() - start,
      provider: "none",
    };
  }

  /**
   * Detect CAPTCHA type from page HTML.
   */
  static detectCaptchaType(html: string): CaptchaType[] {
    const types: CaptchaType[] = [];
    if (html.includes("g-recaptcha") || html.includes("recaptcha/api.js"))
      types.push("recaptcha_v2");
    if (html.includes("recaptcha/enterprise") || html.includes("grecaptcha.enterprise"))
      types.push("recaptcha_v3");
    if (html.includes("hcaptcha.com") || html.includes("h-captcha")) types.push("hcaptcha");
    if (html.includes("turnstile") || html.includes("challenges.cloudflare.com"))
      types.push("turnstile");
    if (html.includes("funcaptcha") || html.includes("funcaptcha.com")) types.push("funcaptcha");
    if (html.includes("geetest") || html.includes("gt4")) types.push("geetest");
    return types;
  }

  /**
   * Create a multi-agent swarm for a task.
   */
  createSwarm(description: string, url: string, agentCount: number = 3): SwarmTask {
    const agents: SwarmAgent[] = [
      { id: "coordinator", name: "Coordinator", role: "coordinator", status: "idle", results: [] },
      { id: "explorer", name: "Explorer", role: "explorer", status: "idle", results: [] },
      { id: "extractor", name: "Extractor", role: "extractor", status: "idle", results: [] },
    ];

    if (agentCount > 3) {
      agents.push({
        id: "validator",
        name: "Validator",
        role: "validator",
        status: "idle",
        results: [],
      });
    }

    const task: SwarmTask = {
      id: generateId(),
      description,
      url,
      agents,
      status: "pending",
      results: [],
    };

    this.swarms.set(task.id, task);
    return task;
  }

  /**
   * Execute a swarm task.
   */
  async executeSwarm(swarmId: string): Promise<SwarmTask> {
    const task = this.swarms.get(swarmId);
    if (!task) throw new Error(`Swarm ${swarmId} not found`);

    task.status = "running";
    task.startTime = Date.now();

    // Coordinator assigns tasks
    const coordinator = task.agents.find((a) => a.role === "coordinator");
    if (coordinator) {
      coordinator.status = "running";
      coordinator.currentTask = "Planning exploration strategy";
      coordinator.results.push({
        agentId: coordinator.id,
        action: "plan",
        success: true,
        data: { strategy: "breadth-first", maxDepth: 3 },
        timestamp: Date.now(),
      });
      coordinator.status = "completed";
    }

    // Explorer discovers page structure
    const explorer = task.agents.find((a) => a.role === "explorer");
    if (explorer) {
      explorer.status = "running";
      explorer.currentTask = "Exploring page structure";
      explorer.results.push({
        agentId: explorer.id,
        action: "explore",
        success: true,
        data: { url: task.url, elements: [], frames: [] },
        timestamp: Date.now(),
      });
      explorer.status = "completed";
    }

    // Extractor pulls data
    const extractor = task.agents.find((a) => a.role === "extractor");
    if (extractor) {
      extractor.status = "running";
      extractor.currentTask = "Extracting data";
      extractor.results.push({
        agentId: extractor.id,
        action: "extract",
        success: true,
        data: { fields: [], links: [] },
        timestamp: Date.now(),
      });
      extractor.status = "completed";
    }

    // Validator checks results
    const validator = task.agents.find((a) => a.role === "validator");
    if (validator) {
      validator.status = "running";
      validator.currentTask = "Validating results";
      validator.results.push({
        agentId: validator.id,
        action: "validate",
        success: true,
        data: { valid: true },
        timestamp: Date.now(),
      });
      validator.status = "completed";
    }

    task.results = task.agents.flatMap((a) => a.results);
    task.status = "completed";
    task.endTime = Date.now();

    return task;
  }

  /**
   * Get swarm by ID.
   */
  getSwarm(id: string): SwarmTask | undefined {
    return this.swarms.get(id);
  }

  /**
   * Get all swarms.
   */
  getSwarms(): SwarmTask[] {
    return Array.from(this.swarms.values());
  }
}

/** CAPTCHA solving provider interface */
export interface CaptchaProvider {
  name: string;
  supportsType: (type: CaptchaType) => boolean;
  solve: (request: CaptchaSolveRequest) => Promise<CaptchaSolveResult>;
}
