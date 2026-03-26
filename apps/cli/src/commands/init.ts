import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

export interface InitOptions {
  template?: string;
  yes?: boolean;
}

const CONFIG_FILENAME = "inspect.config.ts";

const TEMPLATES: Record<string, () => string> = {
  default: () => `import { defineConfig } from "@inspect/sdk";

export default defineConfig({
  // Target URL — auto-detected from package.json scripts if omitted
  // url: "http://localhost:3000",

  // AI agent configuration
  agent: {
    primary: "claude",
    mode: "hybrid", // dom | hybrid | cua
    // fallback: "gpt",
  },

  // Devices to test on
  devices: ["desktop-chrome"],

  // Browser configuration
  browser: {
    type: "chromium",
    headless: true,
    // slowMo: 100,
  },

  // Git integration
  git: {
    scope: "unstaged", // unstaged | branch | commit:<sha>
    maxFiles: 12,
    maxDiffChars: 12000,
  },

  // Accessibility
  a11y: {
    enabled: false,
    standard: "2.1-AA",
  },

  // Visual regression
  visual: {
    enabled: false,
    threshold: 0.1,
    viewports: ["mobile", "tablet", "desktop"],
  },

  // Timeouts
  timeouts: {
    test: 120_000,     // 2 minutes per test
    step: 30_000,      // 30 seconds per step
    navigation: 15_000, // 15 seconds for page loads
  },

  // Maximum steps per test run
  maxSteps: 50,
});
`,

  minimal: () => `import { defineConfig } from "@inspect/sdk";

export default defineConfig({
  agent: { primary: "claude", mode: "hybrid" },
  devices: ["desktop-chrome"],
});
`,

  comprehensive: () => `import { defineConfig } from "@inspect/sdk";

export default defineConfig({
  // url: "http://localhost:3000",

  agent: {
    primary: "claude",
    mode: "hybrid",
    fallback: "gpt",
    specialists: {
      ux: "claude",
      security: "gpt",
      a11y: "claude",
      performance: "gemini",
    },
  },

  devices: [
    "desktop-chrome",
    "desktop-firefox",
    "iphone-15",
    "ipad-pro",
    "pixel-8",
    "galaxy-s24",
  ],

  browser: {
    type: "chromium",
    headless: true,
  },

  git: {
    scope: "branch",
    maxFiles: 12,
    maxDiffChars: 12000,
  },

  a11y: {
    enabled: true,
    standard: "2.1-AA",
  },

  lighthouse: {
    enabled: true,
    categories: ["performance", "accessibility", "seo", "best-practices"],
    budgets: {
      performance: 90,
      accessibility: 100,
      seo: 90,
    },
  },

  visual: {
    enabled: true,
    threshold: 0.05,
    viewports: ["mobile", "tablet", "desktop"],
    mask: [".dynamic-content", "[data-testid='timestamp']"],
  },

  chaos: {
    enabled: false,
    duration: 30,
    species: ["clicker", "formFiller", "scroller"],
    fpsThreshold: 10,
  },

  security: {
    enabled: false,
    scanner: "nuclei",
    severity: "medium",
  },

  network: {
    mock: false,
    // mockFile: "./mocks/handlers.ts",
    faultInjection: false,
    // faultProfile: "slow-3g",
  },

  timeouts: {
    test: 180_000,
    step: 30_000,
    navigation: 15_000,
  },

  maxSteps: 100,

  reporting: {
    format: "markdown",
    output: ".inspect/reports",
    prComment: true,
    commitStatus: true,
  },
});
`,
};

function detectPackageManager(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);
  const templateName = options.template ?? "default";
  const templateFn = TEMPLATES[templateName];

  if (!templateFn) {
    console.error(
      chalk.red(
        `Unknown template: "${templateName}". Available: ${Object.keys(TEMPLATES).join(", ")}`
      )
    );
    process.exit(1);
  }

  console.log(chalk.blue("\nInitializing Inspect configuration...\n"));

  // Check if config already exists
  if (existsSync(configPath)) {
    if (!options.yes) {
      console.log(
        chalk.yellow(
          `${CONFIG_FILENAME} already exists. Use --yes to overwrite.`
        )
      );
      return;
    }
    console.log(chalk.dim(`Overwriting existing ${CONFIG_FILENAME}`));
  }

  // Write config file
  const configContent = templateFn();
  writeFileSync(configPath, configContent, "utf-8");
  console.log(chalk.green(`  Created ${CONFIG_FILENAME} (template: ${templateName})`));

  // Create .inspect directory
  const inspectDir = join(cwd, ".inspect");
  if (!existsSync(inspectDir)) {
    mkdirSync(inspectDir, { recursive: true });
    console.log(chalk.green("  Created .inspect/ directory"));
  }

  // Create .inspect/.gitignore
  const gitignorePath = join(inspectDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(
      gitignorePath,
      [
        "# Inspect artifacts",
        "visual/current/",
        "visual/diff/",
        "reports/",
        "recordings/",
        "cache/",
        "*.har",
        "",
        "# Keep baselines",
        "!visual/baseline/",
      ].join("\n"),
      "utf-8"
    );
    console.log(chalk.green("  Created .inspect/.gitignore"));
  }

  // Create flows directory
  const flowsDir = join(inspectDir, "flows");
  if (!existsSync(flowsDir)) {
    mkdirSync(flowsDir, { recursive: true });
    console.log(chalk.green("  Created .inspect/flows/ directory"));
  }

  // Suggest installing dependencies
  const pm = detectPackageManager();
  console.log(chalk.blue("\nNext steps:"));
  console.log(chalk.dim(`  1. Install the SDK: ${pm} add @inspect/sdk`));
  console.log(chalk.dim("  2. Run doctor to verify setup: inspect doctor"));
  console.log(chalk.dim('  3. Run your first test: inspect test -m "test the homepage"'));
  console.log(chalk.dim("  4. Or just run: inspect (for the interactive TUI)"));
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize Inspect in your project")
    .option(
      "--template <template>",
      "Config template: default, minimal, comprehensive",
      "default"
    )
    .option("-y, --yes", "Overwrite existing config without prompting")
    .action(async (opts: InitOptions) => {
      try {
        await runInit(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
