// ──────────────────────────────────────────────────────────────────────────────
// Code Interpreter — Multi-language sandbox extension
// Adds support for Go, Java, Rust, PHP, C/C++ via compiler detection
// ──────────────────────────────────────────────────────────────────────────────

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const ADDITIONAL_RUNTIMES = {
  go: {
    checkCommand: "go version",
    runCommand: (file: string) => `go run "${file}"`,
    extension: ".go",
    mimeType: "text/x-go",
  },
  java: {
    checkCommand: "java --version",
    runCommand: (file: string) => `java "${file}"`,
    extension: ".java",
    mimeType: "text/x-java",
  },
  rust: {
    checkCommand: "rustc --version",
    runCommand: (file: string) => `rustc "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".rs",
    mimeType: "text/x-rust",
  },
  php: {
    checkCommand: "php --version",
    runCommand: (file: string) => `php "${file}"`,
    extension: ".php",
    mimeType: "text/x-php",
  },
  c: {
    checkCommand: "gcc --version",
    runCommand: (file: string) => `gcc "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".c",
    mimeType: "text/x-c",
  },
  cpp: {
    checkCommand: "g++ --version",
    runCommand: (file: string) => `g++ "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".cpp",
    mimeType: "text/x-c++",
  },
} as const;

export type AdditionalRuntime = keyof typeof ADDITIONAL_RUNTIMES;

/** Check which additional runtimes are available on the system. */
export async function checkAdditionalRuntimes(): Promise<
  Partial<Record<AdditionalRuntime, string>>
> {
  const available: Partial<Record<AdditionalRuntime, string>> = {};

  for (const [runtime, config] of Object.entries(ADDITIONAL_RUNTIMES)) {
    try {
      const { stdout } = await execAsync(config.checkCommand, { timeout: 5000 });
      available[runtime as AdditionalRuntime] = stdout.trim().split("\n")[0].trim();
    } catch {
      // Runtime not available
    }
  }

  return available;
}

/** Execute code in an additional runtime (Go, Java, Rust, PHP, C/C++). */
export async function executeInRuntime(
  runtime: AdditionalRuntime,
  code: string,
  timeoutMs = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const config = ADDITIONAL_RUNTIMES[runtime];
  if (!config) {
    throw new Error(
      `Unsupported runtime: ${runtime}. Supported: ${Object.keys(ADDITIONAL_RUNTIMES).join(", ")}`,
    );
  }

  // Check runtime availability
  try {
    await execAsync(config.checkCommand, { timeout: 3000 });
  } catch {
    throw new Error(`${runtime} is not installed. Run: ${config.checkCommand} to verify.`);
  }

  // Write to temp file
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const tempDir = await mkdtemp(join(tmpdir(), `inspect-${runtime}-`));
  const fileName = `main${config.extension}`;
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, code);

  try {
    const command = config.runCommand(filePath);
    const { stdout, stderr } = await execAsync(command, { cwd: tempDir, timeout: timeoutMs });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { code?: string; stdout?: string; stderr?: string };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? String(execError),
      exitCode: 1,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Validate code syntax for an additional runtime. */
export async function validateSyntax(
  runtime: AdditionalRuntime,
  code: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const config = ADDITIONAL_RUNTIMES[runtime];
  if (!config) {
    return { valid: false, errors: [`Unsupported runtime: ${runtime}`] };
  }

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const tempDir = await mkdtemp(join(tmpdir(), `inspect-validate-${runtime}-`));
  const fileName = `main${config.extension}`;
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, code);

  try {
    const checkCommands: Partial<Record<AdditionalRuntime, string>> = {
      go: `go vet "${filePath}"`,
      java: `javac "${filePath}"`,
      rust: `rustc --edition 2021 "${filePath}"`,
      php: `php -l "${filePath}"`,
      c: `gcc -fsyntax-only "${filePath}"`,
      cpp: `g++ -fsyntax-only "${filePath}"`,
    };

    const checkCmd = checkCommands[runtime];
    if (!checkCmd) {
      return { valid: true, errors: [] };
    }

    await execAsync(checkCmd, { cwd: tempDir, timeout: 5000 });
    return { valid: true, errors: [] };
  } catch (error: unknown) {
    const execError = error as { stderr?: string };
    return {
      valid: false,
      errors: [(execError.stderr ?? String(execError)).trim().split("\n").slice(0, 5)],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
