import type { Command } from "commander";
import chalk from "chalk";

export interface TenantOptions {
  plan?: string;
  name?: string;
  json?: boolean;
}

const PLAN_DEFAULTS: Record<
  string,
  {
    maxConcurrentTests: number;
    monthlyTokenBudget: number;
    monthlyCostBudget: number;
    maxUsers: number;
    allowedProviders: string[];
    features: string[];
  }
> = {
  free: {
    maxConcurrentTests: 2,
    monthlyTokenBudget: 100_000,
    monthlyCostBudget: 10,
    allowedProviders: ["ollama"],
    maxUsers: 1,
    features: ["basic-testing"],
  },
  team: {
    maxConcurrentTests: 10,
    monthlyTokenBudget: 1_000_000,
    monthlyCostBudget: 100,
    allowedProviders: ["anthropic", "openai", "gemini", "ollama"],
    maxUsers: 10,
    features: ["basic-testing", "reports", "scheduling", "ci-cd"],
  },
  enterprise: {
    maxConcurrentTests: 50,
    monthlyTokenBudget: 10_000_000,
    monthlyCostBudget: 1000,
    allowedProviders: ["anthropic", "openai", "gemini", "deepseek", "ollama"],
    maxUsers: 100,
    features: [
      "basic-testing",
      "reports",
      "scheduling",
      "ci-cd",
      "sso",
      "rbac",
      "audit",
      "priority-support",
    ],
  },
};

async function manageTenant(options: TenantOptions): Promise<void> {
  const { TenantManager } = await import("@inspect/enterprise");
  const manager = new TenantManager();

  if (options.name) {
    const plan = (options.plan ?? "free") as "free" | "team" | "enterprise";
    const tenant = manager.createTenant(options.name, plan);

    if (options.json) {
      console.log(JSON.stringify(tenant, null, 2));
      return;
    }

    console.log(chalk.green(`\nTenant created: ${chalk.bold(tenant.name)}\n`));
    console.log(`  ID:     ${tenant.id}`);
    console.log(`  Plan:   ${tenant.plan}`);
    console.log(`  Users:  ${tenant.config.maxUsers} max`);
    console.log(`  Budget: $${tenant.config.monthlyCostBudget}/month`);
    console.log(`  Providers: ${tenant.config.allowedProviders.join(", ")}`);
    console.log();
    return;
  }

  if (options.plan) {
    const config = PLAN_DEFAULTS[options.plan];
    if (!config) {
      console.error(chalk.red(`Invalid plan: ${options.plan}`));
      console.error(chalk.dim("Valid plans: free, team, enterprise"));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify({ plan: options.plan, ...config }, null, 2));
      return;
    }

    console.log(chalk.blue(`\nTenant Plan: ${chalk.bold(options.plan.toUpperCase())}\n`));
    console.log(`  Max concurrent tests: ${config.maxConcurrentTests}`);
    console.log(`  Monthly token budget: ${config.monthlyTokenBudget.toLocaleString()}`);
    console.log(`  Monthly cost budget:  $${config.monthlyCostBudget}`);
    console.log(`  Max users:            ${config.maxUsers}`);
    console.log(`  Providers:            ${config.allowedProviders.join(", ")}`);
    console.log(`  Features:             ${config.features.join(", ")}`);
    console.log();
    return;
  }

  // Show plan comparison
  console.log(chalk.blue("\nTenant Plans\n"));
  console.log(chalk.dim("  Plan          Tests  Tokens     Cost    Users  Providers"));
  console.log(chalk.dim("  ──────────────────────────────────────────────────────────"));
  for (const [name, c] of Object.entries(PLAN_DEFAULTS)) {
    console.log(
      `  ${chalk.bold(name.padEnd(13))} ${String(c.maxConcurrentTests).padEnd(6)} ${String(c.monthlyTokenBudget / 1000).padEnd(5)}k     $${String(c.monthlyCostBudget).padEnd(6)} ${String(c.maxUsers).padEnd(6)} ${c.allowedProviders.length}`,
    );
  }
  console.log();
}

export function registerTenantCommand(program: Command): void {
  program
    .command("tenant")
    .description("Manage tenant plans and quotas")
    .option("-p, --plan <plan>", "Show details for plan (free, team, enterprise)")
    .option("-n, --name <name>", "Create a new tenant with this name")
    .option("--json", "Output as JSON")
    .action(async (opts: TenantOptions) => {
      try {
        await manageTenant(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
