import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

/**
 * Parsed pull request identifier.
 */
export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Pull request diff information.
 */
export interface PRDiff {
  raw: string;
  files: string[];
  additions: number;
  deletions: number;
}

/**
 * GitHubPR provides methods for interacting with GitHub pull requests.
 * Supports both the GitHub CLI (gh) and direct API access via curl.
 */
export class GitHubPR {
  private token?: string;

  constructor(token?: string) {
    this.token = token ?? process.env.GITHUB_TOKEN;
  }

  /**
   * Parse a PR URL, shorthand, or number into a PRInfo object.
   *
   * Supported formats:
   * - https://github.com/owner/repo/pull/123
   * - owner/repo#123
   * - 123 (requires defaultRepo)
   */
  parsePRUrl(
    input: string,
    defaultRepo?: string
  ): PRInfo {
    // Full URL
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

    // Shorthand: owner/repo#123
    const shortMatch = input.match(
      /^([^/]+)\/([^#]+)#(\d+)$/
    );
    if (shortMatch) {
      return {
        owner: shortMatch[1],
        repo: shortMatch[2],
        number: parseInt(shortMatch[3], 10),
      };
    }

    // PR number only
    const num = parseInt(input, 10);
    if (!isNaN(num) && defaultRepo) {
      const parts = defaultRepo.split("/");
      if (parts.length === 2) {
        return {
          owner: parts[0],
          repo: parts[1],
          number: num,
        };
      }
    }

    throw new Error(
      `Cannot parse PR reference: "${input}". ` +
        `Use URL (https://github.com/owner/repo/pull/123), shorthand (owner/repo#123), or number with --repo.`
    );
  }

  /**
   * Fetch the raw diff for a pull request.
   * Tries gh CLI first, then falls back to curl with auth token.
   */
  async getPRDiff(pr: PRInfo): Promise<PRDiff> {
    let raw: string;

    try {
      // Try gh CLI
      const { stdout } = await exec(
        `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number} ` +
          `--header "Accept: application/vnd.github.v3.diff"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      raw = stdout;
    } catch {
      // Fallback to curl
      const authHeader = this.token
        ? `-H "Authorization: Bearer ${this.token}"`
        : "";
      const { stdout } = await exec(
        `curl -sL ${authHeader} ` +
          `-H "Accept: application/vnd.github.v3.diff" ` +
          `"https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      raw = stdout;
    }

    // Parse diff to extract file list and stats
    const files = new Set<string>();
    let additions = 0;
    let deletions = 0;

    for (const line of raw.split("\n")) {
      const fileMatch = line.match(/^diff --git a\/(.+?) b\//);
      if (fileMatch) {
        files.add(fileMatch[1]);
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
      }
    }

    return {
      raw,
      files: [...files],
      additions,
      deletions,
    };
  }

  /**
   * Fetch the list of changed files in a pull request.
   */
  async getPRFiles(pr: PRInfo): Promise<string[]> {
    try {
      const { stdout } = await exec(
        `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files --jq '.[].filename'`
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      // Fallback: parse from diff
      const diff = await this.getPRDiff(pr);
      return diff.files;
    }
  }

  /**
   * Detect preview/deployment URL from PR comments.
   * Checks for Vercel, Netlify, Railway, Render, and generic preview URLs.
   */
  async getPreviewUrl(pr: PRInfo): Promise<string | null> {
    try {
      const { stdout } = await exec(
        `gh api repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments --jq '.[].body'`
      );

      // Vercel
      const vercelMatch = stdout.match(
        /https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app/i
      );
      if (vercelMatch) return vercelMatch[0];

      // Netlify
      const netlifyMatch = stdout.match(
        /https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app/i
      );
      if (netlifyMatch) return netlifyMatch[0];

      // Railway
      const railwayMatch = stdout.match(
        /https:\/\/[a-z0-9-]+\.up\.railway\.app/i
      );
      if (railwayMatch) return railwayMatch[0];

      // Render
      const renderMatch = stdout.match(
        /https:\/\/[a-z0-9-]+\.onrender\.com/i
      );
      if (renderMatch) return renderMatch[0];

      // Generic "Preview:" or "Deploy preview:" patterns
      const genericMatch = stdout.match(
        /(?:preview|deploy|staging)[\s:]+(?:url)?[\s:]*(?:\*\*)?(https?:\/\/\S+?)(?:\*\*)?(?:\s|\)|$)/i
      );
      if (genericMatch) return genericMatch[1];

      // Check deployment statuses
      try {
        const { stdout: deploymentsRaw } = await exec(
          `gh api repos/${pr.owner}/${pr.repo}/deployments --jq '.[0].id'`
        );
        const deploymentId = deploymentsRaw.trim();
        if (deploymentId) {
          const { stdout: statusRaw } = await exec(
            `gh api repos/${pr.owner}/${pr.repo}/deployments/${deploymentId}/statuses --jq '.[0].environment_url'`
          );
          const envUrl = statusRaw.trim();
          if (envUrl && envUrl !== "null") return envUrl;
        }
      } catch {
        // Deployment API not available
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get basic PR metadata.
   */
  async getPRMetadata(pr: PRInfo): Promise<{
    title: string;
    body: string;
    author: string;
    headBranch: string;
    baseBranch: string;
    state: string;
  }> {
    const { stdout } = await exec(
      `gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number} ` +
        `--jq '{title: .title, body: .body, author: .user.login, headBranch: .head.ref, baseBranch: .base.ref, state: .state}'`
    );
    return JSON.parse(stdout);
  }
}
