import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
}

async function getCommandVersion(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await exec(`${cmd} --version`);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await exec(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function checkNode(): Promise<CheckResult> {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 22) {
    return {
      name: "Node.js",
      status: "pass",
      message: `${version}`,
    };
  } else if (major >= 20) {
    return {
      name: "Node.js",
      status: "pass",
      message: `${version} (22+ recommended for best performance)`,
    };
  } else {
    return {
      name: "Node.js",
      status: "fail",
      message: `${version} — Node.js 20+ required`,
      detail: "Install Node.js 20+: https://nodejs.org or use nvm/fnm",
    };
  }
}

async function checkPnpm(): Promise<CheckResult> {
  const version = await getCommandVersion("pnpm");
  if (version) {
    return {
      name: "pnpm",
      status: "pass",
      message: version,
    };
  }
  return {
    name: "pnpm",
    status: "fail",
    message: "Not installed",
    detail: "Install: npm install -g pnpm",
  };
}

async function checkGit(): Promise<CheckResult> {
  const version = await getCommandVersion("git");
  if (version) {
    return {
      name: "git",
      status: "pass",
      message: version,
    };
  }
  return {
    name: "git",
    status: "fail",
    message: "Not installed",
    detail: "Install git: https://git-scm.com",
  };
}

async function checkGhCli(): Promise<CheckResult> {
  const version = await getCommandVersion("gh");
  if (version) {
    // Check if authenticated
    try {
      await exec("gh auth status");
      return {
        name: "GitHub CLI (gh)",
        status: "pass",
        message: `${version} (authenticated)`,
      };
    } catch {
      return {
        name: "GitHub CLI (gh)",
        status: "warn",
        message: `${version} (not authenticated)`,
        detail: 'Run "gh auth login" to authenticate for PR features',
      };
    }
  }
  return {
    name: "GitHub CLI (gh)",
    status: "warn",
    message: "Not installed (optional, needed for PR features)",
    detail: "Install: https://cli.github.com",
  };
}

async function checkPlaywrightBrowsers(): Promise<CheckResult> {
  // Find playwright in local node_modules
  const { join } = await import("node:path");
  const { existsSync: fileExists } = await import("node:fs");

  const candidates = [
    join(process.cwd(), "node_modules", "playwright-core", "cli.js"),
    join(process.cwd(), "node_modules", "playwright", "cli.js"),
  ];

  // Also search in pnpm's flat structure
  try {
    const { readdirSync } = await import("node:fs");
    const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
    if (fileExists(pnpmDir)) {
      const dirs = readdirSync(pnpmDir).filter(
        (d) => d.startsWith("playwright-core@") || d.startsWith("playwright@"),
      );
      for (const d of dirs) {
        const name = d.startsWith("playwright-core") ? "playwright-core" : "playwright";
        candidates.push(join(pnpmDir, d, "node_modules", name, "cli.js"));
      }
    }
  } catch {
    /* pnpm directory not found */
  }

  let playwrightCli = "";
  for (const c of candidates) {
    if (fileExists(c)) {
      playwrightCli = c;
      break;
    }
  }

  if (!playwrightCli) {
    // Try npx as fallback
    try {
      const { stdout } = await exec("npx playwright --version", { timeout: 10000 });
      return { name: "Playwright", status: "pass", message: stdout.trim() };
    } catch {
      return {
        name: "Playwright",
        status: "warn",
        message: "Not found",
        detail: "Run: /install to install browsers",
      };
    }
  }

  try {
    const { stdout } = await exec(`${process.execPath} ${playwrightCli} --version`, {
      timeout: 10000,
    });
    const version = stdout.trim();
    return {
      name: "Playwright",
      status: "pass",
      message: `${version} (local)`,
    };
  } catch {
    return {
      name: "Playwright",
      status: "pass",
      message: "Installed (local)",
    };
  }
}

async function checkChrome(): Promise<CheckResult> {
  // Check common Chrome locations
  const chromePaths = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];

  for (const chromePath of chromePaths) {
    if (await commandExists(chromePath)) {
      const version = await getCommandVersion(chromePath);
      return {
        name: "Chrome/Chromium",
        status: "pass",
        message: version ?? "Found",
      };
    }
  }

  return {
    name: "Chrome/Chromium",
    status: "warn",
    message: "System Chrome not found (Playwright provides its own)",
  };
}

async function checkConfig(): Promise<CheckResult> {
  const cwd = process.cwd();
  const configFiles = ["inspect.config.ts", "inspect.config.js", "inspect.config.json"];

  for (const file of configFiles) {
    if (existsSync(`${cwd}/${file}`)) {
      return {
        name: "Inspect config",
        status: "pass",
        message: `Found ${file}`,
      };
    }
  }

  return {
    name: "Inspect config",
    status: "warn",
    message: "No config file found",
    detail: 'Run "inspect init" to create one',
  };
}

async function checkInspectDir(): Promise<CheckResult> {
  const cwd = process.cwd();
  if (existsSync(`${cwd}/.inspect`)) {
    return {
      name: ".inspect directory",
      status: "pass",
      message: "Found",
    };
  }
  return {
    name: ".inspect directory",
    status: "warn",
    message: "Not found",
    detail: 'Run "inspect init" to create it',
  };
}

async function checkApiKeys(): Promise<CheckResult> {
  // Check both environment variables AND saved keys in .inspect/keys.json
  const { join } = await import("node:path");
  let savedKeys: Record<string, string> = {};
  try {
    const keysPath = join(process.cwd(), ".inspect", "keys.json");
    if (existsSync(keysPath)) {
      savedKeys = JSON.parse(readFileSync(keysPath, "utf-8"));
    }
  } catch {
    /* keys not readable */
  }

  const keyChecks = [
    { name: "ANTHROPIC_API_KEY", label: "Claude" },
    { name: "OPENAI_API_KEY", label: "OpenAI" },
    { name: "GOOGLE_AI_KEY", label: "Gemini" },
    { name: "DEEPSEEK_API_KEY", label: "DeepSeek" },
    { name: "OPENCODE_API_KEY", label: "OpenCode" },
  ];

  const found: string[] = [];
  for (const k of keyChecks) {
    if (process.env[k.name] || savedKeys[k.name]) {
      found.push(k.label);
    }
  }

  if (found.length > 0) {
    const model = savedKeys._activeModel;
    return {
      name: "API Keys",
      status: "pass",
      message: `${found.join(", ")}${model ? ` (model: ${model})` : ""}`,
    };
  }

  return {
    name: "API Keys",
    status: "warn",
    message: "No API keys configured",
    detail: "Run /config in the REPL to set up a provider",
  };
}

interface DoctorOptions {
  json?: boolean;
  jq?: string;
}

async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  if (!options.json) {
    console.log(chalk.blue("\nInspect Doctor\n"));
    console.log(chalk.dim("Checking your environment...\n"));
  }

  const checks = await Promise.all([
    checkNode(),
    checkPnpm(),
    checkGit(),
    checkGhCli(),
    checkPlaywrightBrowsers(),
    checkChrome(),
    checkConfig(),
    checkInspectDir(),
    checkApiKeys(),
  ]);

  // Summary counts
  const passes = checks.filter((c) => c.status === "pass").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const fails = checks.filter((c) => c.status === "fail").length;

  // JSON output mode
  if (options.json) {
    const output = {
      version: "0.1.0",
      status: fails > 0 ? "fail" : warns > 0 ? "warn" : "pass",
      summary: { passed: passes, warnings: warns, failed: fails },
      checks: checks.map((c) => ({
        name: c.name,
        status: c.status,
        message: c.message,
        ...(c.detail ? { detail: c.detail } : {}),
      })),
    };
    if (options.jq) {
      const { jqFilter } = await import("../utils/jq.js");
      const filtered = jqFilter(output, options.jq);
      process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    }
    if (fails > 0) process.exit(1);
    return;
  }

  // Display results
  for (const check of checks) {
    const icon =
      check.status === "pass"
        ? chalk.green("✓")
        : check.status === "warn"
          ? chalk.yellow("⚠")
          : chalk.red("✗");

    console.log(`  ${icon} ${chalk.bold(check.name)}: ${check.message}`);
    if (check.detail && check.status !== "pass") {
      console.log(chalk.dim(`    → ${check.detail}`));
    }
  }

  console.log(
    `\n  ${chalk.green(`${passes} passed`)}${warns > 0 ? `, ${chalk.yellow(`${warns} warnings`)}` : ""}${fails > 0 ? `, ${chalk.red(`${fails} failed`)}` : ""}`,
  );

  if (fails > 0) {
    console.log(chalk.red("\nFix the failed checks above before using Inspect."));
    process.exit(1);
  } else if (warns > 0) {
    console.log(chalk.yellow("\nSome optional dependencies are missing. Core features will work."));
  } else {
    console.log(chalk.green("\nEverything looks good!"));
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check your environment and diagnose issues")
    .option("--json", "Output results as JSON (for CI/scripting)")
    .option("--jq <query>", "Filter JSON output with jq-like query (requires --json)")
    .addHelpText(
      "after",
      `
Checks performed:
  Node.js           Verifies version 20+ is installed
  pnpm              Checks package manager availability
  git               Verifies git is available
  GitHub CLI (gh)   Checks gh CLI and authentication status
  Playwright        Verifies browser automation framework
  Chrome/Chromium   Detects system browser installation
  Config file       Looks for inspect.config.ts/js/json
  .inspect dir      Checks for project setup directory
  API Keys          Detects configured AI provider keys

Examples:
  $ inspect doctor                  Run all checks with colored output
  $ inspect doctor --json           Output results as JSON
  $ inspect doctor --json | jq .    Pipe JSON to jq for processing
`,
    )
    .action(async (opts: DoctorOptions) => {
      try {
        await runDoctor(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
