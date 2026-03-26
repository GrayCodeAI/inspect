import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";

export interface CompareOptions {
  format?: string;
  output?: string;
  threshold?: string;
}

interface RunResult {
  id?: string;
  name?: string;
  startedAt: string;
  finishedAt?: string;
  tests: Array<{
    name: string;
    status: string;
    duration: number;
    steps?: Array<{ action: string; result: string }>;
    error?: { message: string };
  }>;
}

function loadRunResult(ref: string): RunResult | null {
  // Try as direct file path
  if (existsSync(ref) && ref.endsWith(".json")) {
    return JSON.parse(readFileSync(ref, "utf-8"));
  }

  // Try as run ID in .inspect/runs/
  const runsDir = resolve(".inspect/runs");
  if (existsSync(runsDir)) {
    const runFile = join(runsDir, `${ref}.json`);
    if (existsSync(runFile)) {
      return JSON.parse(readFileSync(runFile, "utf-8"));
    }

    // Try partial match
    const files = readdirSync(runsDir).filter((f) => f.includes(ref) && f.endsWith(".json"));
    if (files.length > 0) {
      return JSON.parse(readFileSync(join(runsDir, files[0]), "utf-8"));
    }
  }

  // Try as git branch/ref (load latest run from that branch)
  const branchDir = resolve(`.inspect/runs/${ref}`);
  if (existsSync(branchDir)) {
    const files = readdirSync(branchDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length > 0) {
      return JSON.parse(readFileSync(join(branchDir, files[0]), "utf-8"));
    }
  }

  return null;
}

async function runCompare(
  baseline: string | undefined,
  current: string | undefined,
  options: CompareOptions,
): Promise<void> {
  if (!baseline || !current) {
    console.error(chalk.red("Error: Both baseline and current run references are required."));
    console.log(chalk.dim("Usage: inspect compare <baseline> <current>"));
    console.log(chalk.dim("  References can be: file path, run ID, or branch name"));
    process.exit(1);
  }

  console.log(chalk.blue("\nCompare Test Runs\n"));

  const baselineResult = loadRunResult(baseline);
  const currentResult = loadRunResult(current);

  if (!baselineResult) {
    console.error(chalk.red(`Baseline not found: ${baseline}`));
    process.exit(1);
  }

  if (!currentResult) {
    console.error(chalk.red(`Current not found: ${current}`));
    process.exit(1);
  }

  const baselineLabel = baselineResult.name ?? baselineResult.id ?? basename(baseline);
  const currentLabel = currentResult.name ?? currentResult.id ?? basename(current);

  console.log(chalk.dim(`Baseline: ${baselineLabel}`));
  console.log(chalk.dim(`Current:  ${currentLabel}`));

  // Build comparison
  const baselineTests = new Map(baselineResult.tests.map((t) => [t.name, t]));
  const currentTests = new Map(currentResult.tests.map((t) => [t.name, t]));

  const allTestNames = new Set([...baselineTests.keys(), ...currentTests.keys()]);

  const comparison = {
    added: [] as string[],
    removed: [] as string[],
    improved: [] as Array<{ name: string; from: string; to: string }>,
    regressed: [] as Array<{ name: string; from: string; to: string; error?: string }>,
    unchanged: [] as string[],
    fasterTests: [] as Array<{ name: string; baseline: number; current: number; diff: number }>,
    slowerTests: [] as Array<{ name: string; baseline: number; current: number; diff: number }>,
  };

  for (const name of allTestNames) {
    const base = baselineTests.get(name);
    const curr = currentTests.get(name);

    if (!base) {
      comparison.added.push(name);
    } else if (!curr) {
      comparison.removed.push(name);
    } else if (base.status !== curr.status) {
      if (curr.status === "passed" && base.status !== "passed") {
        comparison.improved.push({ name, from: base.status, to: curr.status });
      } else if (curr.status !== "passed" && base.status === "passed") {
        comparison.regressed.push({
          name,
          from: base.status,
          to: curr.status,
          error: curr.error?.message,
        });
      } else {
        comparison.unchanged.push(name);
      }
    } else {
      comparison.unchanged.push(name);
      // Check timing differences
      const threshold = parseFloat(options.threshold ?? "0.2");
      const timeDiff = curr.duration - base.duration;
      const ratio = base.duration > 0 ? Math.abs(timeDiff) / base.duration : 0;
      if (ratio > threshold) {
        const entry = { name, baseline: base.duration, current: curr.duration, diff: timeDiff };
        if (timeDiff < 0) {
          comparison.fasterTests.push(entry);
        } else {
          comparison.slowerTests.push(entry);
        }
      }
    }
  }

  // Display results
  console.log(chalk.dim("\n─────────────────────────────────────────\n"));

  const baseTotal = baselineResult.tests.length;
  const currTotal = currentResult.tests.length;
  const basePassed = baselineResult.tests.filter((t) => t.status === "passed").length;
  const currPassed = currentResult.tests.filter((t) => t.status === "passed").length;

  console.log(chalk.bold("Summary:\n"));
  console.log(`  ${"".padEnd(15)} ${"Baseline".padEnd(12)} ${"Current".padEnd(12)} ${"Change"}`);
  console.log(`  ${"Total".padEnd(15)} ${String(baseTotal).padEnd(12)} ${String(currTotal).padEnd(12)} ${currTotal - baseTotal >= 0 ? "+" : ""}${currTotal - baseTotal}`);
  console.log(`  ${"Passed".padEnd(15)} ${String(basePassed).padEnd(12)} ${String(currPassed).padEnd(12)} ${currPassed - basePassed >= 0 ? chalk.green("+" + (currPassed - basePassed)) : chalk.red(String(currPassed - basePassed))}`);

  if (comparison.regressed.length > 0) {
    console.log(chalk.red(`\n  Regressions (${comparison.regressed.length}):`));
    for (const r of comparison.regressed) {
      console.log(chalk.red(`    ✗ ${r.name}: ${r.from} → ${r.to}`));
      if (r.error) console.log(chalk.dim(`      ${r.error.slice(0, 120)}`));
    }
  }

  if (comparison.improved.length > 0) {
    console.log(chalk.green(`\n  Improvements (${comparison.improved.length}):`));
    for (const i of comparison.improved) {
      console.log(chalk.green(`    ✓ ${i.name}: ${i.from} → ${i.to}`));
    }
  }

  if (comparison.added.length > 0) {
    console.log(chalk.blue(`\n  New tests (${comparison.added.length}):`));
    for (const name of comparison.added) {
      console.log(chalk.blue(`    + ${name}`));
    }
  }

  if (comparison.removed.length > 0) {
    console.log(chalk.yellow(`\n  Removed tests (${comparison.removed.length}):`));
    for (const name of comparison.removed) {
      console.log(chalk.yellow(`    - ${name}`));
    }
  }

  if (comparison.slowerTests.length > 0) {
    console.log(chalk.yellow(`\n  Slower tests:`));
    for (const t of comparison.slowerTests.slice(0, 5)) {
      console.log(chalk.dim(`    ${t.name}: ${t.baseline}ms → ${t.current}ms (+${t.diff}ms)`));
    }
  }

  if (comparison.fasterTests.length > 0) {
    console.log(chalk.green(`\n  Faster tests:`));
    for (const t of comparison.fasterTests.slice(0, 5)) {
      console.log(chalk.dim(`    ${t.name}: ${t.baseline}ms → ${t.current}ms (${t.diff}ms)`));
    }
  }

  console.log(`\n  ${chalk.dim(`${comparison.unchanged.length} tests unchanged`)}\n`);

  // Save output
  if (options.format === "json" || options.output) {
    const outputPath = options.output
      ? resolve(options.output)
      : resolve(".inspect/comparison.json");
    writeFileSync(outputPath, JSON.stringify(comparison, null, 2), "utf-8");
    console.log(chalk.green(`Comparison saved to: ${outputPath}\n`));
  }

  // Exit with failure if regressions
  if (comparison.regressed.length > 0) {
    process.exit(1);
  }
}

export function registerCompareCommand(program: Command): void {
  program
    .command("compare")
    .description("Compare test results between two runs or branches")
    .argument("[baseline]", "Baseline run ID, file path, or branch")
    .argument("[current]", "Current run ID, file path, or branch")
    .option("--format <format>", "Output format: cli, json", "cli")
    .option("-o, --output <file>", "Output file path")
    .option("--threshold <ratio>", "Timing change threshold (ratio)", "0.2")
    .action(async (baseline: string | undefined, current: string | undefined, opts: CompareOptions) => {
      await runCompare(baseline, current, opts);
    });
}
