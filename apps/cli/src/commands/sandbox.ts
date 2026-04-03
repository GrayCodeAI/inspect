import type { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";

export interface SandboxOptions {
  code: string;
  runtime: string;
  timeout?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  UNSUPPORTED_RUNTIME: 2,
  TIMEOUT: 3,
} as const;

async function runSandbox(options: SandboxOptions): Promise<void> {
  if (!options.code) {
    console.error(chalk.red("Error: Code is required. Use --code <code>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const runtime = options.runtime ?? "node";
  const supportedRuntimes = ["node", "python", "bash"];
  if (!supportedRuntimes.includes(runtime)) {
    console.error(
      chalk.red(`Error: Unsupported runtime "${runtime}". Use: ${supportedRuntimes.join(", ")}`),
    );
    process.exit(EXIT_CODES.UNSUPPORTED_RUNTIME);
  }

  console.log(chalk.blue("\nInspect Sandbox\n"));
  console.log(chalk.dim(`Runtime: ${runtime}`));
  console.log(
    chalk.dim(`Code: ${options.code.slice(0, 50)}${options.code.length > 50 ? "..." : ""}`),
  );

  try {
    const timeout = parseInt(options.timeout ?? "30000", 10);
    const result = await executeInSandbox(options.code, runtime, timeout);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.stdout) {
        console.log(chalk.dim("\nOutput:"));
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.log(chalk.yellow("\nStderr:"));
        console.log(result.stderr);
      }
      console.log(chalk.dim(`\nExit code: ${result.exitCode}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nExecution failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  runtime: string;
}

async function executeInSandbox(
  code: string,
  runtime: string,
  timeout: number,
): Promise<SandboxResult> {
  return new Promise((resolve, reject) => {
    const command = runtime === "python" ? "python3" : runtime === "bash" ? "bash" : "node";
    const args = runtime === "bash" ? ["-c", code] : ["-e", code];

    const child = spawn(command, args, { timeout });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
        runtime,
      });
    });

    child.on("error", reject);
  });
}

export function registerSandboxCommand(program: Command): void {
  program
    .command("sandbox")
    .description("Execute code in sandbox")
    .requiredOption("--code <code>", "Code to execute")
    .requiredOption("--runtime <runtime>", "Runtime: node, python, bash")
    .option("--timeout <ms>", "Timeout in milliseconds", "30000")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect sandbox --code "console.log('Hello')" --runtime node
  $ inspect sandbox --code "print('Hello')" --runtime python
  $ inspect sandbox --code "echo Hello" --runtime bash --timeout 5000
`,
    )
    .action(async (opts: SandboxOptions) => {
      await runSandbox(opts);
    });
}
