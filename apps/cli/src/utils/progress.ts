/**
 * CLI progress display with spinner, step counter, and ETA.
 * Provides clean, Claude Code-style output for test execution.
 */

/** Spinner frames for loading animation */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Status icons */
const ICONS = {
  pass: "✓",
  fail: "✗",
  skip: "⊘",
  warn: "⚠",
  info: "ℹ",
  running: "●",
  done: "◆",
} as const;

/** ANSI color codes (no external deps) */
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export interface ProgressState {
  phase: "planning" | "executing" | "verifying" | "done";
  currentStep: number;
  totalSteps: number;
  tokenCount: number;
  elapsed: number;
  currentAction?: string;
}

export interface StepResult {
  description: string;
  status: "pass" | "fail" | "skipped";
  duration: number;
  error?: string;
}

/**
 * Progress display for test execution.
 * Shows a spinner during execution and formatted step results.
 */
export class ProgressDisplay {
  private spinnerTimer?: ReturnType<typeof setInterval>;
  private frameIndex = 0;
  private startTime = 0;
  private stepResults: StepResult[] = [];
  private currentLine = "";
  private isTTY: boolean;

  constructor() {
    this.isTTY = process.stderr.isTTY ?? false;
  }

  /**
   * Start the progress display.
   */
  start(): void {
    this.startTime = Date.now();
    this.stepResults = [];

    if (this.isTTY) {
      this.spinnerTimer = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
        this.renderSpinner();
      }, 80);
    }
  }

  /**
   * Update progress state.
   */
  update(state: ProgressState): void {
    this.currentLine = this.formatState(state);
    if (this.isTTY) {
      this.renderSpinner();
    }
  }

  /**
   * Record a completed step.
   */
  step(result: StepResult): void {
    this.stepResults.push(result);
    this.clearLine();
    this.printStep(result);
  }

  /**
   * Print a message without affecting the spinner.
   */
  info(message: string): void {
    this.clearLine();
    process.stderr.write(`${C.blue}${ICONS.info}${C.reset} ${message}\n`);
  }

  warn(message: string): void {
    this.clearLine();
    process.stderr.write(`${C.yellow}${ICONS.warn}${C.reset} ${message}\n`);
  }

  error(message: string): void {
    this.clearLine();
    process.stderr.write(`${C.red}${ICONS.fail}${C.reset} ${message}\n`);
  }

  /**
   * Stop and show summary.
   */
  stop(status: "pass" | "fail" | "error" | "timeout"): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    this.clearLine();

    const elapsed = Date.now() - this.startTime;
    const passed = this.stepResults.filter((s) => s.status === "pass").length;
    const failed = this.stepResults.filter((s) => s.status === "fail").length;
    const skipped = this.stepResults.filter((s) => s.status === "skipped").length;

    process.stderr.write("\n");
    process.stderr.write(`${C.bold}${C.dim}──────${C.reset}\n\n`);

    const statusColor = status === "pass" ? C.green : C.red;
    const statusIcon = status === "pass" ? ICONS.pass : ICONS.fail;
    process.stderr.write(
      `  ${statusColor}${statusIcon} ${status.toUpperCase()}${C.reset}  ` +
        `${C.green}${passed} passed${C.reset}` +
        (failed > 0 ? `  ${C.red}${failed} failed${C.reset}` : "") +
        (skipped > 0 ? `  ${C.gray}${skipped} skipped${C.reset}` : "") +
        `  ${C.gray}${this.formatDuration(elapsed)}${C.reset}\n\n`,
    );
  }

  /**
   * Get summary for programmatic use.
   */
  getSummary(): { passed: number; failed: number; skipped: number; duration: number } {
    return {
      passed: this.stepResults.filter((s) => s.status === "pass").length,
      failed: this.stepResults.filter((s) => s.status === "fail").length,
      skipped: this.stepResults.filter((s) => s.status === "skipped").length,
      duration: Date.now() - this.startTime,
    };
  }

  private formatState(state: ProgressState): string {
    const phase = this.formatPhase(state.phase);
    const progress =
      state.totalSteps > 0
        ? `${state.currentStep + 1}/${state.totalSteps}`
        : `${state.currentStep + 1}`;
    const tokens = `${state.tokenCount} tokens`;
    const eta = state.totalSteps > 0 && state.currentStep > 0 ? this.estimateETA(state) : "";

    let line = `  ${phase} ${progress}`;
    if (state.currentAction) {
      line += ` ${C.dim}${state.currentAction.slice(0, 50)}${C.reset}`;
    }
    line += ` ${C.gray}${tokens}${C.reset}`;
    if (eta) {
      line += ` ${C.gray}ETA ${eta}${C.reset}`;
    }
    return line;
  }

  private formatPhase(phase: string): string {
    switch (phase) {
      case "planning":
        return `${C.cyan}Planning${C.reset}`;
      case "executing":
        return `${C.magenta}Running${C.reset}`;
      case "verifying":
        return `${C.yellow}Verifying${C.reset}`;
      case "done":
        return `${C.green}Done${C.reset}`;
      default:
        return phase;
    }
  }

  private estimateETA(state: ProgressState): string {
    const elapsedMs = state.elapsed;
    const avgPerStep = elapsedMs / (state.currentStep + 1);
    const remaining = (state.totalSteps - state.currentStep - 1) * avgPerStep;
    return this.formatDuration(remaining);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  private printStep(result: StepResult): void {
    const icon =
      result.status === "pass"
        ? `${C.green}${ICONS.pass}${C.reset}`
        : result.status === "fail"
          ? `${C.red}${ICONS.fail}${C.reset}`
          : `${C.gray}${ICONS.skip}${C.reset}`;

    const duration = C.gray + this.formatDuration(result.duration) + C.reset;
    const desc = result.description.slice(0, 80);

    process.stderr.write(`  ${icon} ${desc} ${duration}\n`);

    if (result.error) {
      process.stderr.write(`    ${C.red}${result.error.slice(0, 100)}${C.reset}\n`);
    }
  }

  private renderSpinner(): void {
    if (!this.isTTY) return;
    const frame = C.cyan + SPINNER_FRAMES[this.frameIndex] + C.reset;
    this.clearLine();
    process.stderr.write(`  ${frame} ${this.currentLine}`);
  }

  private clearLine(): void {
    if (this.isTTY) {
      process.stderr.write("\r\x1b[K");
    }
  }
}
