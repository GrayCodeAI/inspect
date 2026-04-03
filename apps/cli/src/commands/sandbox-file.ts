import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export interface SandboxFileOptions {
  runtime: string;
  timeout?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  FILE_NOT_FOUND: 2,
  UNSUPPORTED_RUNTIME: 3,
} as const;

async function runSandboxFile(
  filePath: string | undefined,
  options: SandboxFileOptions,
): Promise<void> {
  if (!filePath) {
    console.error(chalk.red("Error: File path is required."));
    console.log(chalk.dim("Usage: inspect sandbox:file <path>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: File not found: ${filePath}`));
    process.exit(EXIT_CODES.FILE_NOT_FOUND);
  }

  const runtime = options.runtime ?? "node";
  const supportedRuntimes = ["node", "python", "bash"];
  if (!supportedRuntimes.includes(runtime)) {
    console.error(
      chalk.red(`Error: Unsupported runtime "${runtime}". Use: ${supportedRuntimes.join(", ")}`),
    );
    process.exit(EXIT_CODES.UNSUPPORTED_RUNTIME);
  }

  console.log(chalk.blue("\nInspect Sandbox File\n"));
  console.log(chalk.dim(`File: ${filePath}`));
  console.log(chalk.dim(`Runtime: ${runtime}`));

  try {
    const code = readFileSync(resolvedPath, "utf-8");
    const timeout = parseInt(options.timeout ?? "30000", 10);

    const result = await executeFileInSandbox(code, runtime, timeout);

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

async function executeFileInSandbox(
  code: string,
  runtime: string,
  timeout: number,
): Promise<SandboxResult> {
  return new Promise((resolve, reject) => {
    const command = runtime === "python" ? "python3" : runtime === "bash" ? "bash" : "node";
    const child = spawn(command, ["-e", code], { timeout });

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

export function registerSandboxFileCommand(program: Command): void {
  program
    .command("sandbox:file")
    .description("Execute file in sandbox")
    .argument("<path>", "Path to file")
    .requiredOption("--runtime <runtime>", "Runtime: node, python, bash")
    .option("--timeout <ms>", "Timeout in milliseconds", "30000")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect sandbox:file ./script.js --runtime node
  $ inspect sandbox:file ./script.py --runtime python
`,
    )
    .action(async (path: string | undefined, opts: SandboxFileOptions) => {
      await runSandboxFile(path, opts);
    });
}
