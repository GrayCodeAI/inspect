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

interface _TestResult {
  steps?: Array<{ description?: string; status?: string; error?: string }>;
  summary?: string;
}

function parsePRInput(input: string, repoOpt?: string): PRInfo {
  const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: parseInt(urlMatch[3], 10),
    };
  }

  const num = parseInt(input, 10);
  if (!isNaN(num) && repoOpt) {
    const [owner, repo] = repoOpt.split("/");
    if (owner && repo) {
      return { owner, repo, number: num };
    }
  }

  const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10),
    };
  }

  throw new Error(
    `Invalid PR reference: "${input}". Use a URL, owner/repo#number, or a number with --repo.`,
  );
}

async function fetchPRDiff(pr: PRInfo): Promise<string> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number} --header "Accept: application/vnd.github.v3.diff"`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    try {
      const { stdout } = await execAsync(
        `curl -sL "https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}.diff"`,
        { maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout;
    } catch (err) {
      throw new Error(
        `Failed to fetch PR diff: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }
}

async function fetchPRFiles(pr: PRInfo): Promise<string[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files --jq '.[].filename'`,
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
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
    const { stdout } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments --jq '.[].body'`,
    );

    const vercelMatch = stdout.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    if (vercelMatch) return vercelMatch[0];

    const netlifyMatch = stdout.match(/https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app/i);
    if (netlifyMatch) return netlifyMatch[0];

    const previewMatch = stdout.match(/Preview:\s*(https?:\/\/\S+)/i);
    if (previewMatch) return previewMatch[1];

    return null;
  } catch {
    return null;
  }
}

async function postPRComment(pr: PRInfo, message: string): Promise<boolean> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const escapedMessage = message.replace(/"/g, '\\"');
    await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments -X POST -f body="${escapedMessage}"`,
      { maxBuffer: 5 * 1024 * 1024 },
    );
    return true;
  } catch (err) {
    console.error(
      chalk.dim(`Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`),
    );
    return false;
  }
}

async function setPRCommitStatus(
  pr: PRInfo,
  status: "success" | "failure" | "pending",
  description: string,
  detailsUrl?: string,
): Promise<boolean> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const stateMap: Record<string, string> = {
    success: "success",
    failure: "failure",
    pending: "pending",
  };
  const state = stateMap[status];

  try {
    const { stdout: sha } = await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number} --jq '.head.sha'`,
    );

    const context = "inspect/ai-test";
    const targetUrl = detailsUrl ?? "https://github.com/factoryai/inspect";

    await execAsync(
      `gh api repos/${pr.owner}/${pr.repo}/statuses/${sha.trim()} -X POST -f state="${state}" -f context="${context}" -f description="${description}" -f target_url="${targetUrl}"`,
      { maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch (err) {
    console.error(
      chalk.dim(`Failed to set commit status: ${err instanceof Error ? err.message : String(err)}`),
    );
    return false;
  }
}

async function runPRTest(input: string, options: PROptions): Promise<void> {
  const pr = parsePRInput(input, options.repo);
  console.log(chalk.blue(`\nTesting PR #${pr.number} on ${pr.owner}/${pr.repo}`));

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

  let targetUrl = options.url;
  if (!targetUrl) {
    console.log(chalk.dim("Detecting preview URL..."));
    targetUrl = (await detectPreviewUrl(pr)) ?? undefined;
    if (targetUrl) {
      console.log(chalk.green(`Found preview URL: ${targetUrl}`));
    } else {
      console.log(chalk.yellow("No preview URL detected. Use --url to specify the target."));
    }
  }

  if (options.status) {
    console.log(chalk.dim("Setting pending commit status..."));
    await setPRCommitStatus(pr, "pending", "AI tests running");
  }

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

  if (options.verbose) {
    console.log(chalk.dim("\n--- Prompt ---"));
    console.log(chalk.dim(`Test PR #${pr.number}: ${instruction}`));
    console.log(chalk.dim("## PR Diff (truncated)"));
    console.log(chalk.dim(diff.slice(0, 2000)));
    console.log(chalk.dim("--- End Prompt ---\n"));
  }

  console.log(
    chalk.blue(
      `\nRunning tests with agent: ${options.agent ?? "claude"} (mode: ${options.mode ?? "hybrid"})`,
    ),
  );

  const { runTestWithResult } = await import("./test.js");
  const testResult = await runTestWithResult({
    message: `Test PR #${pr.number}: ${instruction}`,
    url: targetUrl,
    agent: options.agent ?? "claude",
    target: "branch",
    mode: options.mode ?? "hybrid",
    headed: options.headed ?? false,
    devices: options.devices ?? "desktop-chrome",
    verbose: options.verbose ?? false,
    browser: "chromium",
    json: true,
  });

  if (options.comment) {
    const passed = testResult?.steps?.filter((s) => s.status === "pass").length ?? 0;
    const failed = testResult?.steps?.filter((s) => s.status === "fail").length ?? 0;
    const status = failed > 0 ? "FAIL" : "PASS";
    const statusBadge =
      status === "PASS"
        ? "https://img.shields.io/badge/Inspect-PASS-green?style=flat-square"
        : "https://img.shields.io/badge/Inspect-FAIL-red?style=flat-square";
    const statusEmoji = status === "PASS" ? "✅" : "❌";

    const stepsTable =
      testResult?.steps
        ?.map((s, i) => {
          const icon =
            s.status === "pass" ? "✅ PASS" : s.status === "fail" ? "❌ FAIL" : "⏭ SKIP";
          const errorDetail = s.error ? ` — ${s.error.slice(0, 120)}` : "";
          return `| ${i + 1} | ${s.description ?? "Unknown"} | ${icon}${errorDetail} |`;
        })
        .join("\n") ?? "";

    const commentBody = `## AI Test Results — PR #${pr.number}

![${status}](${statusBadge})

**Status:** ${statusEmoji} **${status}** | **Passed:** ${passed} | **Failed:** ${failed}

### Summary
${testResult?.summary ?? "No summary available"}

### Steps
| # | Description | Status |
|---|-------------|--------|
${stepsTable}

---
*Powered by [Inspect](https://github.com/factoryai/inspect)*
`;

    const posted = await postPRComment(pr, commentBody);
    if (posted) {
      console.log(chalk.green("Test results posted as PR comment"));
    } else {
      console.log(chalk.yellow("Failed to post PR comment (check gh CLI auth)"));
    }
  }

  if (options.status) {
    const failed = testResult?.steps?.filter((s) => s.status === "fail").length ?? 0;
    const status = failed > 0 ? "failure" : "success";
    const description = failed > 0 ? `AI tests: ${failed} failure(s)` : "AI tests passed";
    const setStatus = await setPRCommitStatus(pr, status, description);
    if (setStatus) {
      console.log(chalk.green(`Commit status set to: ${status}`));
    } else {
      console.log(chalk.yellow("Failed to set commit status (check gh CLI auth)"));
    }
  }
}

export function registerPRCommand(program: Command): void {
  program
    .command("pr")
    .description("Run AI-powered tests against a pull request")
    .argument("<pr>", "PR URL, owner/repo#number, or number (with --repo)")
    .option("--repo <repo>", "Repository in owner/repo format (when using PR number)")
    .option("-a, --agent <agent>", "AI agent to use", "claude")
    .option("--mode <mode>", "Agent mode: dom, hybrid, cua", "hybrid")
    .option("--headed", "Run in headed browser mode")
    .option("--url <url>", "Preview URL to test against")
    .option("--devices <devices>", "Comma-separated device presets", "desktop-chrome")
    .option("--verbose", "Show detailed output")
    .option("--comment", "Post test results as PR comment")
    .option("--status", "Set commit status based on results")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect pr https://github.com/owner/repo/pull/123
  $ inspect pr owner/repo#42 --agent claude --headed
  $ inspect pr 15 --repo owner/repo --comment --status
  $ inspect pr owner/repo#7 --devices "iphone-15,desktop-chrome"
`,
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
