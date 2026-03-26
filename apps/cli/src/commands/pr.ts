import type { Command } from "commander";
import chalk from "chalk";

export interface PROptions {
  repo?: string;
  agent?: string;
  mode?: "dom" | "hybrid" | "cua";
  headed?: boolean;
  url?: string;
  devices?: string;
  verbose?: boolean;
  comment?: boolean;
  status?: boolean;
}

interface PRInfo {
  owner: string;
  repo: string;
  number: number;
}

function parsePRInput(input: string, repoOpt?: string): PRInfo {
  // Handle full URL: https://github.com/owner/repo/pull/123
  const urlMatch = input.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: parseInt(urlMatch[3], 10),
    };
  }

  // Handle PR number with --repo
  const num = parseInt(input, 10);
  if (!isNaN(num) && repoOpt) {
    const [owner, repo] = repoOpt.split("/");
    if (owner && repo) {
      return { owner, repo, number: num };
    }
  }

  // Handle shorthand: owner/repo#123
  const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10),
    };
  }

  throw new Error(
    `Invalid PR reference: "${input}". Use a URL, owner/repo#number, or a number with --repo.`
  );
}

async function fetchPRDiff(pr: PRInfo): Promise<string> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    // Try gh CLI first (authenticated)
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number} --header "Accept: application/vnd.github.v3.diff"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout;
  } catch {
    // Fallback to curl
    try {
      const { stdout } = await execAsync(
        `curl -sL "https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}.diff"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout;
    } catch (err) {
      throw new Error(`Failed to fetch PR diff: ${err}`);
    }
  }
}

async function fetchPRFiles(pr: PRInfo): Promise<string[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files --jq '.[].filename'`
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    // Parse diff to extract filenames as fallback
    const diff = await fetchPRDiff(pr);
    const files = new Set<string>();
    for (const line of diff.split("\n")) {
      const match = line.match(/^diff --git a\/(.+?) b\//);
      if (match) files.add(match[1]);
    }
    return [...files];
  }
}

async function detectPreviewUrl(pr: PRInfo): Promise<string | null> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    // Check PR comments for Vercel/Netlify preview URLs
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments --jq '.[].body'`
    );

    // Look for Vercel preview
    const vercelMatch = stdout.match(
      /https:\/\/[a-z0-9-]+\.vercel\.app/i
    );
    if (vercelMatch) return vercelMatch[0];

    // Look for Netlify preview
    const netlifyMatch = stdout.match(
      /https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app/i
    );
    if (netlifyMatch) return netlifyMatch[0];

    // Look for generic preview URLs
    const previewMatch = stdout.match(
      /Preview:\s*(https?:\/\/\S+)/i
    );
    if (previewMatch) return previewMatch[1];

    return null;
  } catch {
    return null;
  }
}

async function runPRTest(input: string, options: PROptions): Promise<void> {
  const pr = parsePRInput(input, options.repo);
  console.log(
    chalk.blue(
      `\nTesting PR #${pr.number} on ${pr.owner}/${pr.repo}`
    )
  );

  // Fetch PR information
  console.log(chalk.dim("Fetching PR diff..."));
  const diff = await fetchPRDiff(pr);
  const files = await fetchPRFiles(pr);

  console.log(chalk.dim(`Changed files: ${files.length}`));
  for (const file of files.slice(0, 15)) {
    console.log(chalk.dim(`  - ${file}`));
  }
  if (files.length > 15) {
    console.log(chalk.dim(`  ... and ${files.length - 15} more`));
  }

  // Detect preview URL
  let targetUrl = options.url;
  if (!targetUrl) {
    console.log(chalk.dim("Detecting preview URL..."));
    targetUrl = await detectPreviewUrl(pr) ?? undefined;
    if (targetUrl) {
      console.log(chalk.green(`Found preview URL: ${targetUrl}`));
    } else {
      console.log(
        chalk.yellow(
          "No preview URL detected. Use --url to specify the target."
        )
      );
    }
  }

  // Build test instruction from PR context
  const instruction = [
    `Test the changes in PR #${pr.number} on ${pr.owner}/${pr.repo}.`,
    "",
    `Changed files: ${files.join(", ")}`,
    "",
    "Focus on:",
    "1. Verify the PR changes work as expected",
    "2. Check for regressions in related functionality",
    "3. Test edge cases around the changed code",
    "4. Verify UI/UX if frontend files changed",
  ].join("\n");

  // Prepare prompt with diff context
  const prompt = [
    instruction,
    "",
    "## PR Diff (truncated to 12000 chars)",
    "```diff",
    diff.slice(0, 12000),
    diff.length > 12000 ? "... (truncated)" : "",
    "```",
  ].join("\n");

  if (options.verbose) {
    console.log(chalk.dim("\n--- Prompt ---"));
    console.log(chalk.dim(prompt));
    console.log(chalk.dim("--- End Prompt ---\n"));
  }

  console.log(
    chalk.blue(
      `\nRunning tests with agent: ${options.agent ?? "claude"} (mode: ${options.mode ?? "hybrid"})`
    )
  );

  // In a full implementation, this would:
  // 1. Launch the TestExecutor with the prompt
  // 2. Stream results to the TUI
  // 3. Optionally post a comment to the PR
  // 4. Optionally set commit status
  console.log(chalk.dim("Test execution starting..."));
  console.log(
    chalk.yellow(
      "\nFull agent execution not yet wired — PR context gathered successfully."
    )
  );

  if (options.comment) {
    console.log(
      chalk.dim("Will post results as PR comment when tests complete.")
    );
  }
  if (options.status) {
    console.log(
      chalk.dim("Will set commit status when tests complete.")
    );
  }
}

export function registerPRCommand(program: Command): void {
  program
    .command("pr")
    .description(
      "Run AI-powered tests against a pull request"
    )
    .argument(
      "<pr>",
      "PR URL, owner/repo#number, or number (with --repo)"
    )
    .option(
      "--repo <repo>",
      "Repository in owner/repo format (when using PR number)"
    )
    .option(
      "-a, --agent <agent>",
      "AI agent to use",
      "claude"
    )
    .option(
      "--mode <mode>",
      "Agent mode: dom, hybrid, cua",
      "hybrid"
    )
    .option("--headed", "Run in headed browser mode")
    .option("--url <url>", "Preview URL to test against")
    .option(
      "--devices <devices>",
      "Comma-separated device presets",
      "desktop-chrome"
    )
    .option("--verbose", "Show detailed output")
    .option(
      "--comment",
      "Post test results as PR comment"
    )
    .option(
      "--status",
      "Set commit status based on results"
    )
    .action(async (pr: string, opts: PROptions) => {
      try {
        await runPRTest(pr, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
