// Enhanced Watch Engine with fingerprint-based dedup, settle delay, heuristic+LLM assessment
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/watch-engine");

export interface WatchEngineOptions {
  cwd: string;
  pollIntervalMs?: number;
  settleDelayMs?: number;
  instruction?: string;
  onRunStart?: (changedFiles: string[]) => void;
  onRunComplete?: (result: WatchRunResult) => void;
  onSkip?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export interface WatchRunResult {
  runId: number;
  changedFiles: string[];
  decision: "run" | "skip";
  decisionSource: "heuristic" | "agent" | "manual";
  reason: string;
  passed: boolean;
  duration: number;
}

export interface WatchState {
  status: "idle" | "settling" | "assessing" | "running" | "stopped";
  lastFingerprint: string;
  lastRunId: number;
  pendingRerun: boolean;
  settleDeadline: number;
  lastRunResult?: WatchRunResult;
}

export type WatchEvent =
  | { type: "polling"; timestamp: number }
  | { type: "change_detected"; changedFiles: string[]; fingerprint: string }
  | { type: "settling"; deadline: number }
  | { type: "assessing"; changedFiles: string[] }
  | { type: "run_starting"; runId: number; changedFiles: string[]; source: string }
  | { type: "run_update"; runId: number; status: string }
  | { type: "run_completed"; result: WatchRunResult }
  | { type: "skipped"; reason: string }
  | { type: "error"; error: Error }
  | { type: "stopped"; timestamp: number };

export class WatchEngine {
  private options: Required<WatchEngineOptions>;
  private state: WatchState;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<string, Set<(event: WatchEvent) => void>> = new Map();

  constructor(options: WatchEngineOptions) {
    this.options = {
      cwd: options.cwd,
      pollIntervalMs: options.pollIntervalMs ?? 2000,
      settleDelayMs: options.settleDelayMs ?? 3000,
      instruction: options.instruction ?? "Test the recent changes",
      onRunStart: options.onRunStart ?? (() => {}),
      onRunComplete: options.onRunComplete ?? (() => {}),
      onSkip: options.onSkip ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
    this.state = {
      status: "idle",
      lastFingerprint: "",
      lastRunId: 0,
      pendingRerun: false,
      settleDeadline: 0,
    };
  }

  on(event: string, handler: (event: WatchEvent) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  emit(event: WatchEvent): void {
    const handlers = this.listeners.get("*");
    if (handlers) for (const h of handlers) h(event);
    const specific = this.listeners.get(event.type);
    if (specific) for (const h of specific) h(event);
  }

  start(): void {
    if (this.state.status !== "stopped" && this.pollingTimer) return;
    this.state.status = "idle";
    logger.info("Watch engine started", { pollIntervalMs: this.options.pollIntervalMs });
    this.pollingTimer = setInterval(() => this.poll(), this.options.pollIntervalMs);
    this.poll();
  }

  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    this.state.status = "stopped";
    this.emit({ type: "stopped", timestamp: Date.now() });
    logger.info("Watch engine stopped");
  }

  getState(): Readonly<WatchState> {
    return { ...this.state };
  }

  private async poll(): Promise<void> {
    if (this.state.status === "running" || this.state.status === "stopped") return;
    this.emit({ type: "polling", timestamp: Date.now() });
    try {
      const { changedFiles, fingerprint } = await this.getGitSnapshot();
      if (fingerprint === this.state.lastFingerprint) return;
      this.state.lastFingerprint = fingerprint;
      this.emit({ type: "change_detected", changedFiles, fingerprint });
      this.startSettle(changedFiles);
    } catch (error) {
      this.emit({ type: "error", error: error as Error });
    }
  }

  private startSettle(changedFiles: string[]): void {
    this.state.status = "settling";
    this.state.settleDeadline = Date.now() + this.options.settleDelayMs;
    this.emit({ type: "settling", deadline: this.state.settleDeadline });
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.assess(changedFiles), this.options.settleDelayMs);
  }

  private async assess(changedFiles: string[]): Promise<void> {
    this.state.status = "assessing";
    this.emit({ type: "assessing", changedFiles });

    const decision = this.heuristicAssess(changedFiles);
    if (decision.decision === "skip") {
      this.emit({ type: "skipped", reason: decision.reason });
      this.options.onSkip(decision.reason);
      this.state.status = "idle";
      return;
    }

    this.execute(changedFiles, "heuristic");
  }

  private heuristicAssess(changedFiles: string[]): { decision: "run" | "skip"; reason: string } {
    const skipPatterns = [".md", ".txt", ".json", ".lock", "CHANGELOG", "LICENSE", ".gitignore"];
    const runPatterns = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".css", ".html"];

    const allDocs = changedFiles.every((f) => skipPatterns.some((p) => f.endsWith(p)));
    if (allDocs && changedFiles.length > 0) {
      return {
        decision: "skip",
        reason: "All changed files are documentation/config — no browser impact",
      };
    }

    const hasCode = changedFiles.some((f) => runPatterns.some((p) => f.endsWith(p)));
    if (hasCode) {
      return { decision: "run", reason: `${changedFiles.length} code file(s) changed` };
    }

    return { decision: "run", reason: "Defaulting to run for safety" };
  }

  private async execute(
    changedFiles: string[],
    source: "heuristic" | "agent" | "manual",
  ): Promise<void> {
    const runId = ++this.state.lastRunId;
    this.state.status = "running";
    this.emit({ type: "run_starting", runId, changedFiles, source });
    this.options.onRunStart(changedFiles);

    const startTime = Date.now();
    let passed = true;

    try {
      execSync(`npx inspect test -m "${this.options.instruction}" -t unstaged -y`, {
        cwd: this.options.cwd,
        stdio: "inherit",
        env: { ...process.env, INSPECT_WATCH_MODE: "true" },
      });
    } catch {
      passed = false;
    }

    const result: WatchRunResult = {
      runId,
      changedFiles,
      decision: "run",
      decisionSource: source,
      reason: source === "heuristic" ? "Code change detected" : "Agent assessment",
      passed,
      duration: Date.now() - startTime,
    };

    this.state.lastRunResult = result;
    this.emit({ type: "run_completed", result });
    this.options.onRunComplete(result);
    this.state.status = "idle";

    if (this.state.pendingRerun) {
      this.state.pendingRerun = false;
      await this.poll();
    }
  }

  private async getGitSnapshot(): Promise<{ changedFiles: string[]; fingerprint: string }> {
    try {
      const diff = execSync("git diff --name-only HEAD", {
        cwd: this.options.cwd,
        encoding: "utf-8",
      }).trim();
      const unstaged = execSync("git diff --name-only", {
        cwd: this.options.cwd,
        encoding: "utf-8",
      }).trim();
      const staged = execSync("git diff --cached --name-only", {
        cwd: this.options.cwd,
        encoding: "utf-8",
      }).trim();

      const files = new Set([
        ...diff.split("\n").filter(Boolean),
        ...unstaged.split("\n").filter(Boolean),
        ...staged.split("\n").filter(Boolean),
      ]);

      const diffContent = execSync("git diff HEAD 2>/dev/null || echo ''", {
        cwd: this.options.cwd,
        encoding: "utf-8",
      });
      const hash = createHash("sha256").update(diffContent).digest("hex");

      return { changedFiles: [...files], fingerprint: hash };
    } catch {
      return { changedFiles: [], fingerprint: "" };
    }
  }
}
