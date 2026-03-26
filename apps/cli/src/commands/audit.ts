import type { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface AuditOptions {
  fix?: boolean;
  reporter?: string;
}

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  duration: number;
  details?: string[];
}

function runCheck(
  name: string,
  command: string,
  options?: { cwd?: string; fix?: boolean },
): CheckResult {
  const startTime = Date.now();

  try {
    const output = execSync(command, {
      cwd: options?.cwd ?? process.cwd(),
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      name,
      status: "pass",
      message: "OK",
      duration: Date.now() - startTime,
      details: output.trim() ? output.trim().split("\n").slice(0, 5) : undefined,
    };
  } catch (err: unknown) {
    const error = err as { stderr?: string; stdout?: string; status?: number };
    const output = (error.stdout ?? error.stderr ?? "").trim();
    const lines = output.split("\n").filter(Boolean);

    return {
      name,
      status: "fail",
      message: lines[0]?.slice(0, 200) ?? "Check failed",
      duration: Date.now() - startTime,
      details: lines.slice(0, 10),
    };
  }
}

async function runAudit(options: AuditOptions): Promise<void> {
  const reporter = options.reporter ?? "cli";

  console.log(chalk.blue("\nCode Quality Audit\n"));

  const results: CheckResult[] = [];
  const cwd = process.cwd();
  const startTime = Date.now();

  // 1. TypeScript type checking
  console.log(chalk.dim("  Checking types..."));
  if (existsSync(resolve(cwd, "tsconfig.json"))) {
    const tscResult = runCheck(
      "TypeScript",
      "npx tsc --noEmit 2>&1",
      { cwd },
    );
    results.push(tscResult);
    const icon = tscResult.status === "pass" ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} TypeScript: ${tscResult.status === "pass" ? "No errors" : tscResult.message.slice(0, 100)}`);
  } else {
    results.push({ name: "TypeScript", status: "skip", message: "No tsconfig.json found", duration: 0 });
    console.log(chalk.dim("  - TypeScript: Skipped (no tsconfig.json)"));
  }

  // 2. ESLint
  console.log(chalk.dim("  Checking lint..."));
  const eslintConfig = [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs"].some(
    (f) => existsSync(resolve(cwd, f)),
  );
  if (eslintConfig) {
    const fixFlag = options.fix ? " --fix" : "";
    const eslintResult = runCheck(
      "ESLint",
      `npx eslint . --ext .ts,.tsx${fixFlag} 2>&1`,
      { cwd },
    );
    results.push(eslintResult);
    const icon = eslintResult.status === "pass" ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} ESLint: ${eslintResult.status === "pass" ? "No issues" : eslintResult.message.slice(0, 100)}`);
  } else {
    results.push({ name: "ESLint", status: "skip", message: "No ESLint config found", duration: 0 });
    console.log(chalk.dim("  - ESLint: Skipped (no config)"));
  }

  // 3. Prettier / formatting
  console.log(chalk.dim("  Checking formatting..."));
  const prettierConfig = [".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js"].some(
    (f) => existsSync(resolve(cwd, f)),
  );
  if (prettierConfig) {
    const formatCmd = options.fix
      ? 'npx prettier --write "**/*.{ts,tsx,json}" 2>&1'
      : 'npx prettier --check "**/*.{ts,tsx,json}" 2>&1';
    const formatResult = runCheck("Prettier", formatCmd, { cwd });
    results.push(formatResult);
    const icon = formatResult.status === "pass" ? chalk.green("✓") : chalk.yellow("!");
    console.log(`  ${icon} Prettier: ${formatResult.status === "pass" ? "All formatted" : formatResult.message.slice(0, 100)}`);
  } else {
    results.push({ name: "Prettier", status: "skip", message: "No Prettier config found", duration: 0 });
    console.log(chalk.dim("  - Prettier: Skipped (no config)"));
  }

  // 4. Test suite
  console.log(chalk.dim("  Running tests..."));
  const vitestConfig = ["vitest.config.ts", "vitest.config.js"].some(
    (f) => existsSync(resolve(cwd, f)),
  );
  if (vitestConfig) {
    const testResult = runCheck("Tests", "npx vitest run --reporter=verbose 2>&1", { cwd });
    results.push(testResult);
    const icon = testResult.status === "pass" ? chalk.green("✓") : chalk.red("✗");
    // Extract test count from output
    const testLine = testResult.details?.find((l) => l.includes("Tests") && l.includes("passed"));
    console.log(`  ${icon} Tests: ${testLine ?? testResult.message.slice(0, 100)}`);
  } else {
    results.push({ name: "Tests", status: "skip", message: "No vitest config found", duration: 0 });
    console.log(chalk.dim("  - Tests: Skipped (no vitest config)"));
  }

  // 5. Package audit (security)
  console.log(chalk.dim("  Auditing dependencies..."));
  const hasPnpm = existsSync(resolve(cwd, "pnpm-lock.yaml"));
  if (hasPnpm) {
    const auditResult = runCheck("Dependencies", "pnpm audit --prod 2>&1", { cwd });
    results.push(auditResult);
    const icon = auditResult.status === "pass" ? chalk.green("✓") : chalk.yellow("!");
    console.log(`  ${icon} Dependencies: ${auditResult.status === "pass" ? "No vulnerabilities" : auditResult.message.slice(0, 100)}`);
  } else {
    const auditResult = runCheck("Dependencies", "npm audit --production 2>&1", { cwd });
    results.push(auditResult);
    const icon = auditResult.status === "pass" ? chalk.green("✓") : chalk.yellow("!");
    console.log(`  ${icon} Dependencies: ${auditResult.status === "pass" ? "No vulnerabilities" : auditResult.message.slice(0, 100)}`);
  }

  // 6. Build check
  console.log(chalk.dim("  Checking build..."));
  const buildResult = runCheck("Build", "pnpm build 2>&1", { cwd });
  results.push(buildResult);
  const buildIcon = buildResult.status === "pass" ? chalk.green("✓") : chalk.red("✗");
  console.log(`  ${buildIcon} Build: ${buildResult.status === "pass" ? "Successful" : buildResult.message.slice(0, 100)}`);

  const elapsed = Date.now() - startTime;

  // Summary
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const warned = results.filter((r) => r.status === "warn").length;

  console.log(chalk.dim("\n─────────────────────────────────────────\n"));
  console.log(chalk.bold("Audit Summary:\n"));
  console.log(`  ${chalk.green(`${passed} passed`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : ""}  ${skipped > 0 ? chalk.dim(`${skipped} skipped`) : ""}  ${warned > 0 ? chalk.yellow(`${warned} warnings`) : ""}`);
  console.log(chalk.dim(`  Duration: ${(elapsed / 1000).toFixed(1)}s\n`));

  // Show details for failures
  if (failed > 0 && reporter === "cli") {
    console.log(chalk.red("Failures:\n"));
    for (const result of results.filter((r) => r.status === "fail")) {
      console.log(chalk.red(`  ${result.name}:`));
      if (result.details) {
        for (const line of result.details.slice(0, 5)) {
          console.log(chalk.dim(`    ${line}`));
        }
      }
      console.log();
    }
  }

  // JSON output
  if (reporter === "json") {
    console.log(JSON.stringify({ results, summary: { passed, failed, skipped, warned, duration: elapsed } }, null, 2));
  }

  if (failed > 0) process.exit(1);
}

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description("Run code quality audit (typecheck, lint, format, tests, deps, build)")
    .option("--fix", "Auto-fix issues where possible")
    .option("--reporter <format>", "Report format: cli, json", "cli")
    .action(async (opts: AuditOptions) => {
      await runAudit(opts);
    });
}
