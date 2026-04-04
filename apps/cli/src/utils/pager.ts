import { spawn } from "node:child_process";

/**
 * Pipe long output through a pager (less/more) if:
 * 1. Output is longer than terminal height
 * 2. stdout is a TTY
 * 3. INSPECT_PAGER is not set to "none"
 *
 * Falls back to direct stdout.write if pager is unavailable.
 */
export function pipeToPager(content: string): void {
  const lines = content.split("\n").length;
  const termHeight = process.stdout.rows ?? 24;

  // Don't page if content fits in terminal or not a TTY
  if (lines <= termHeight - 2 || !process.stdout.isTTY) {
    process.stdout.write(content);
    return;
  }

  const pagerCmd = process.env.INSPECT_PAGER ?? process.env.PAGER ?? "less";

  if (pagerCmd === "none" || pagerCmd === "cat") {
    process.stdout.write(content);
    return;
  }

  try {
    const pager = spawn(pagerCmd, ["-R"], {
      // -R for color support
      stdio: ["pipe", "inherit", "inherit"],
    });

    pager.stdin.write(content);
    pager.stdin.end();

    pager.on("error", () => {
      // Pager not available — fall back to direct output
      process.stdout.write(content);
    });
  } catch {
    process.stdout.write(content);
  }
}
