import type { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
}

async function getCommandVersion(
  cmd: string
): Promise<string | null> {
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
  try {
    const { stdout } = await exec("npx playwright --version");
    const version = stdout.trim();

    // Check if browsers are installed
    try {
      await exec("npx playwright install --dry-run chromium", {
        timeout: 10000,
      });
      return {
        name: "Playwright",
        status: "pass",
        message: `${version} (browsers installed)`,
      };
    } catch {
      return {
        name: "Playwright",
        status: "warn",
        message: `${version} (browsers may need installation)`,
        detail: 'Run "npx playwright install" to install browsers',
      };
    }
  } catch {
    return {
      name: "Playwright",
      status: "warn",
      message: "Not installed (will be installed with @inspect/browser)",
      detail: "Run: pnpm add playwright @playwright/test",
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
  const configFiles = [
    "inspect.config.ts",
    "inspect.config.js",
    "inspect.config.json",
  ];

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
  const keys = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GOOGLE_AI_KEY: !!process.env.GOOGLE_AI_KEY,
  };

  const found = Object.entries(keys)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (found.length > 0) {
    return {
      name: "API Keys",
      status: "pass",
      message: `Found: ${found.join(", ")}`,
    };
  }

  return {
    name: "API Keys",
    status: "warn",
    message: "No AI API keys found in environment",
    detail:
      "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_KEY for AI features",
  };
}

async function runDoctor(): Promise<void> {
  console.log(chalk.blue("\nInspect Doctor\n"));
  console.log(chalk.dim("Checking your environment...\n"));

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

  // Summary
  const passes = checks.filter((c) => c.status === "pass").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const fails = checks.filter((c) => c.status === "fail").length;

  console.log(
    `\n  ${chalk.green(`${passes} passed`)}${warns > 0 ? `, ${chalk.yellow(`${warns} warnings`)}` : ""}${fails > 0 ? `, ${chalk.red(`${fails} failed`)}` : ""}`
  );

  if (fails > 0) {
    console.log(
      chalk.red("\nFix the failed checks above before using Inspect.")
    );
    process.exit(1);
  } else if (warns > 0) {
    console.log(
      chalk.yellow(
        "\nSome optional dependencies are missing. Core features will work."
      )
    );
  } else {
    console.log(chalk.green("\nEverything looks good!"));
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check your environment and diagnose issues")
    .action(async () => {
      try {
        await runDoctor();
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
