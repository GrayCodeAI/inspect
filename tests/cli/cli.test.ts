/**
 * E2E tests for the Inspect CLI.
 * These test the actual CLI binary (compiled JS) to verify
 * commands work end-to-end without mocking.
 */
import { describe, it, expect } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const execFile = promisify(execFileCb);

const CLI = join(__dirname, "../../apps/cli/dist/index.js");
const NODE = process.execPath;

/** Run the CLI with arguments and return stdout/stderr */
async function runCLI(
  args: string[],
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFile(NODE, [CLI, ...args], {
      timeout: options?.timeout ?? 15000,
      env: { ...process.env, ...options?.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.code ?? 1,
    };
  }
}

describe("CLI E2E", () => {
  it("built CLI binary exists", () => {
    expect(existsSync(CLI)).toBe(true);
  });

  describe("--help", () => {
    it("shows help text with examples", async () => {
      const { stdout, exitCode } = await runCLI(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("AI-Powered Browser Testing Platform");
      expect(stdout).toContain("Commands:");
      expect(stdout).toContain("Examples:");
      expect(stdout).toContain("inspect test");
      expect(stdout).toContain("Environment Variables:");
    });

    it("shows version with platform info", async () => {
      const { stdout, exitCode } = await runCLI(["--version"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("inspect v0.1.0");
      expect(stdout).toContain("node");
    });
  });

  describe("test --help", () => {
    it("shows test command options and examples", async () => {
      const { stdout, exitCode } = await runCLI(["test", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--message");
      expect(stdout).toContain("--agent");
      expect(stdout).toContain("--json");
      expect(stdout).toContain("--dry-run");
      expect(stdout).toContain("--retries");
      expect(stdout).toContain("--workers");
      expect(stdout).toContain("--grep");
      expect(stdout).toContain("--reporter");
      expect(stdout).toContain("--preset");
      expect(stdout).toContain("--project");
      expect(stdout).toContain("--shard");
      expect(stdout).toContain("--budget");
      expect(stdout).toContain("--trace");
      expect(stdout).toContain("Examples:");
    });
  });

  describe("test --dry-run", () => {
    it("shows dry-run output without launching browser", async () => {
      const { stdout, exitCode } = await runCLI([
        "test", "-m", "test something", "--dry-run",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Dry Run");
      expect(stdout).toContain("test something");
      expect(stdout).toContain("Agent:");
      expect(stdout).toContain("Prompt size:");
    });

    it("outputs JSON in dry-run mode", async () => {
      const { stdout, exitCode } = await runCLI([
        "test", "-m", "test something", "--dry-run", "--json",
      ]);
      expect(exitCode).toBe(0);
      // stdout may contain non-JSON prefix lines — extract the JSON object
      const jsonStart = stdout.indexOf("{");
      expect(jsonStart).toBeGreaterThanOrEqual(0);
      const data = JSON.parse(stdout.slice(jsonStart));
      expect(data.dryRun).toBe(true);
      expect(data.instruction).toBe("test something");
      expect(data.agent).toBe("claude");
    });

    it("respects --preset in dry-run", async () => {
      const { stdout, exitCode } = await runCLI([
        "test", "-m", "test", "--dry-run", "--json", "--preset", "mobile",
      ]);
      expect(exitCode).toBe(0);
      const jsonStart = stdout.indexOf("{");
      expect(jsonStart).toBeGreaterThanOrEqual(0);
      const data = JSON.parse(stdout.slice(jsonStart));
      expect(data.dryRun).toBe(true);
    });
  });

  describe("doctor", () => {
    it("runs all checks", async () => {
      const { stdout, exitCode } = await runCLI(["doctor"]);
      expect(exitCode).toBeLessThanOrEqual(1); // may warn
      expect(stdout).toContain("Node.js");
      expect(stdout).toContain("git");
      expect(stdout).toContain("passed");
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCLI(["doctor", "--json"]);
      expect(exitCode).toBeLessThanOrEqual(1);
      const data = JSON.parse(stdout);
      expect(data.version).toBe("0.1.0");
      expect(data.checks).toBeInstanceOf(Array);
      expect(data.checks.length).toBeGreaterThan(0);
      expect(data.summary).toBeDefined();
      expect(data.summary.passed).toBeGreaterThan(0);
    });

    it("supports --jq filtering", async () => {
      const { stdout, exitCode } = await runCLI([
        "doctor", "--json", "--jq", ".summary",
      ]);
      expect(exitCode).toBeLessThanOrEqual(1);
      const data = JSON.parse(stdout);
      expect(data.passed).toBeDefined();
      expect(data.warnings).toBeDefined();
      expect(data.failed).toBeDefined();
    });
  });

  describe("devices", () => {
    it("lists device presets", async () => {
      const { stdout, exitCode } = await runCLI(["devices"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Device Presets");
      expect(stdout).toContain("iphone");
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCLI(["devices", "--json"]);
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(typeof data).toBe("object");
      // Check at least one device preset exists
      expect(Object.keys(data).length).toBeGreaterThan(0);
    });
  });

  describe("models", () => {
    it("lists available models", async () => {
      const { stdout, exitCode } = await runCLI(["models"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Model");
      expect(stdout).toContain("Provider");
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCLI(["models", "--json"]);
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(typeof data).toBe("object");
    });
  });

  describe("init --help", () => {
    it("shows templates and CI options", async () => {
      const { stdout, exitCode } = await runCLI(["init", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--template");
      expect(stdout).toContain("minimal");
      expect(stdout).toContain("comprehensive");
      expect(stdout).toContain("--ci");
      expect(stdout).toContain("github-actions");
    });
  });

  describe("completions", () => {
    it("generates bash completions", async () => {
      const { stdout, exitCode } = await runCLI(["completions", "bash"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("_inspect_completions");
      expect(stdout).toContain("complete -F");
    });

    it("generates zsh completions", async () => {
      const { stdout, exitCode } = await runCLI(["completions", "zsh"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("#compdef inspect");
      expect(stdout).toContain("_inspect");
    });

    it("generates fish completions", async () => {
      const { stdout, exitCode } = await runCLI(["completions", "fish"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("complete -c inspect");
    });

    it("errors on unknown shell", async () => {
      const { exitCode } = await runCLI(["completions", "powershell"]);
      expect(exitCode).toBe(1);
    });
  });

  describe("alias", () => {
    it("shows alias help", async () => {
      const { stdout, exitCode } = await runCLI(["alias", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("set");
      expect(stdout).toContain("list");
      expect(stdout).toContain("delete");
    });
  });

  describe("headless detection", () => {
    it("shows helpful message when no TTY", async () => {
      const { stdout, exitCode } = await runCLI([], {
        env: { CI: "true" },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("inspect v0.1.0");
      expect(stdout).toContain("inspect test");
    });
  });

  describe("unknown command", () => {
    it("shows error for unknown commands", async () => {
      const { stderr, exitCode } = await runCLI(["nonexistent"]);
      expect(exitCode).toBe(1);
      // Commander may say "unknown command" or "too many arguments"
      expect(stderr.length).toBeGreaterThan(0);
    });
  });
});
