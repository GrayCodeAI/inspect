import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { PRInfo } from "./pr.js";
import { createLogger } from "@inspect/observability";
import { formatDuration } from "@inspect/shared";
import { formatDuration } from "@inspect/shared";

const execFile = promisify(execFileCb);
const logger = createLogger("core/github-comments");

/**
 * Safely execute a gh CLI command with arguments as an array.
 */
function ghApi(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile("gh", ["api", ...args]);
}

/**
 * The payload for posting a comment to a PR.
 */
export interface CommentPayload {
  pr: PRInfo;
  body: string;
  /** If set, updates an existing comment instead of creating a new one. */
  existingCommentId?: number;
}

/**
 * The payload for setting a commit status.
 */
export interface StatusPayload {
  pr: PRInfo;
  sha: string;
  state: "pending" | "success" | "failure" | "error";
  description: string;
  context: string;
  targetUrl?: string;
}

/**
 * A test result formatted for PR comments.
 */
interface TestReport {
  status: "pass" | "fail";
  instruction: string;
  agent: string;
  device: string;
  duration: number;
  tokenCount: number;
  steps: Array<{
    description: string;
    status: "pass" | "fail" | "skipped";
    error?: string;
  }>;
}

const COMMENT_MARKER = "<!-- inspect-test-results -->";

/**
 * PRComments manages posting test results and status checks to GitHub PRs.
 */
export class PRComments {
  private token?: string;

  constructor(token?: string) {
    this.token = token ?? process.env.GITHUB_TOKEN;
  }

  /**
   * Post a test results comment to a PR.
   * If a previous Inspect comment exists, it updates that comment instead.
   */
  async postComment(payload: CommentPayload): Promise<{ commentId: number; url: string }> {
    const { pr, body } = payload;
    const markedBody = `${COMMENT_MARKER}\n${body}`;

    // Check for existing comment to update
    let existingId: number | undefined = payload.existingCommentId ?? undefined;
    if (!existingId) {
      existingId = (await this.findExistingComment(pr)) ?? undefined;
    }

    if (existingId) {
      // Update existing comment
      const { stdout } = await ghApi([
        `repos/${pr.owner}/${pr.repo}/issues/comments/${existingId}`,
        "-X",
        "PATCH",
        "-f",
        `body=${markedBody}`,
        "--jq",
        "{id: .id, url: .html_url}",
      ]);
      const result = JSON.parse(stdout);
      return { commentId: result.id, url: result.url };
    }

    // Create new comment
    const { stdout } = await ghApi([
      `repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`,
      "-X",
      "POST",
      "-f",
      `body=${markedBody}`,
      "--jq",
      "{id: .id, url: .html_url}",
    ]);
    const result = JSON.parse(stdout);
    return { commentId: result.id, url: result.url };
  }

  /**
   * Post a formatted test report as a PR comment.
   */
  async postReport(pr: PRInfo, report: TestReport): Promise<{ commentId: number; url: string }> {
    const body = this.formatReport(report);
    return this.postComment({ pr, body });
  }

  /**
   * Set a commit status (check) on the PR's head commit.
   */
  async setStatus(payload: StatusPayload): Promise<void> {
    const { pr, sha, state, description, context, targetUrl } = payload;

    const args = [
      `repos/${pr.owner}/${pr.repo}/statuses/${sha}`,
      "-X",
      "POST",
      "-f",
      `state=${state}`,
      "-f",
      `description=${description}`,
      "-f",
      `context=${context}`,
    ];

    if (targetUrl) {
      args.push("-f", `target_url=${targetUrl}`);
    }

    await ghApi(args);
  }

  /**
   * Get the HEAD SHA for a PR (needed for setting commit status).
   */
  async getPRHeadSha(pr: PRInfo): Promise<string> {
    const { stdout } = await ghApi([
      `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
      "--jq",
      ".head.sha",
    ]);
    return stdout.trim();
  }

  /**
   * Post results and set status in one call.
   */
  async postResultsAndStatus(pr: PRInfo, report: TestReport): Promise<void> {
    // Post comment
    await this.postReport(pr, report);

    // Set commit status
    const sha = await this.getPRHeadSha(pr);
    await this.setStatus({
      pr,
      sha,
      state: report.status === "pass" ? "success" : "failure",
      description:
        report.status === "pass"
          ? `All ${report.steps.length} tests passed`
          : `${report.steps.filter((s) => s.status === "fail").length} of ${report.steps.length} tests failed`,
      context: "inspect/test",
    });
  }

  // -- Private helpers --

  /**
   * Find an existing Inspect comment on the PR to update.
   */
  private async findExistingComment(pr: PRInfo): Promise<number | null> {
    try {
      const { stdout } = await ghApi([
        `repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`,
        "--jq",
        `[.[] | select(.body | contains("${COMMENT_MARKER}")) | .id][0]`,
      ]);
      const id = parseInt(stdout.trim(), 10);
      return isNaN(id) ? null : id;
    } catch (error) {
      logger.debug("Failed to find existing comment", {
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Format a TestReport into a Markdown comment body.
   */
  private formatReport(report: TestReport): string {
    const icon = report.status === "pass" ? "&#x2705;" : "&#x274C;";
    const passed = report.steps.filter((s) => s.status === "pass").length;
    const failed = report.steps.filter((s) => s.status === "fail").length;
    const total = report.steps.length;

    const lines: string[] = [];

    lines.push(`## ${icon} Inspect Test Results`);
    lines.push("");
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Status** | ${report.status === "pass" ? "Passed" : "Failed"} |`);
    lines.push(`| **Instruction** | ${report.instruction} |`);
    lines.push(`| **Agent** | ${report.agent} |`);
    lines.push(`| **Device** | ${report.device} |`);
    lines.push(`| **Duration** | ${formatDuration(report.duration)} |`);
    lines.push(`| **Tokens** | ${report.tokenCount.toLocaleString()} |`);
    lines.push(
      `| **Result** | ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""} |`,
    );
    lines.push("");

    // Steps table
    lines.push("<details>");
    lines.push(`<summary>Test Steps (${passed}/${total} passed)</summary>`);
    lines.push("");
    lines.push("| # | Step | Status |");
    lines.push("|---|------|--------|");

    for (let i = 0; i < report.steps.length; i++) {
      const step = report.steps[i];
      const stepIcon =
        step.status === "pass" ? "&#x2705;" : step.status === "fail" ? "&#x274C;" : "&#x23ED;";
      lines.push(`| ${i + 1} | ${step.description} | ${stepIcon} |`);
      if (step.error) {
        lines.push(`| | _Error: ${step.error}_ | |`);
      }
    }

    lines.push("");
    lines.push("</details>");
    lines.push("");
    lines.push(
      `_Generated by [Inspect](https://github.com/inspect) at ${new Date().toISOString()}_`,
    );

    return lines.join("\n");
  }
}
