import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { getCwd } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/git");

/**
 * GitManager provides all git-related operations for the Inspect platform.
 * Uses simple-git for reliable cross-platform git interaction.
 */
export class GitManager {
  private git: SimpleGit;
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? getCwd();
    this.git = simpleGit({ baseDir: this.cwd });
  }

  /**
   * Get changed files based on the given scope.
   * @param scope - "unstaged" | "branch" | "commit:<sha>" | "changes"
   */
  async getChangedFiles(scope: string = "unstaged"): Promise<string[]> {
    if (scope === "unstaged") {
      return this.getUnstagedFiles();
    }

    if (scope === "branch") {
      return this.getBranchChangedFiles();
    }

    if (scope.startsWith("commit:")) {
      const sha = scope.slice(7);
      return this.getCommitFiles(sha);
    }

    if (scope === "changes") {
      // All changes: staged + unstaged + untracked
      const status = await this.git.status();
      return [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.deleted,
        ...status.renamed.map((r) => r.to),
      ];
    }

    return this.getUnstagedFiles();
  }

  /**
   * Get the diff for the given scope.
   */
  async getDiff(scope: string = "unstaged"): Promise<string> {
    if (scope === "unstaged") {
      // Unstaged changes
      const diff = await this.git.diff();
      const stagedDiff = await this.git.diff(["--cached"]);
      return [diff, stagedDiff].filter(Boolean).join("\n");
    }

    if (scope === "branch") {
      const mainBranch = await this.getMainBranch();
      try {
        return await this.git.diff([`${mainBranch}...HEAD`]);
      } catch (error) {
        logger.debug("Branch diff failed, falling back to working tree diff", {
          mainBranch,
          err: error instanceof Error ? error.message : String(error),
        });
        return await this.git.diff();
      }
    }

    if (scope.startsWith("commit:")) {
      const sha = scope.slice(7);
      return await this.git.diff([`${sha}^`, sha]);
    }

    return await this.git.diff();
  }

  /**
   * Get recent commit messages.
   */
  async getRecentCommits(count: number = 5): Promise<string[]> {
    try {
      const log = await this.git.log({
        maxCount: count,
        format: { hash: "%h", message: "%s", date: "%cr" },
      });

      return log.all.map((entry) => {
        const e = entry as unknown as { hash: string; message: string; date: string };
        return `${e.hash} ${e.message} (${e.date})`;
      });
    } catch (error) {
      logger.debug("Failed to get recent commits", {
        err: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
      return branch.trim();
    } catch (error) {
      logger.debug("Failed to get current branch", {
        err: error instanceof Error ? error.message : String(error),
      });
      return "unknown";
    }
  }

  /**
   * Detect the main/default branch name.
   */
  async getMainBranch(): Promise<string> {
    try {
      // Try common branch names
      const branches = await this.git.branch();
      const candidates = ["main", "master", "develop", "dev"];

      for (const candidate of candidates) {
        if (branches.all.includes(candidate)) {
          return candidate;
        }
        // Also check remote tracking branches
        if (branches.all.includes(`remotes/origin/${candidate}`)) {
          return `origin/${candidate}`;
        }
      }

      // Fallback: try to get the default from remote
      try {
        const remote = await this.git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
        return remote.trim().replace("refs/remotes/origin/", "");
      } catch (error) {
        logger.debug("Failed to resolve remote HEAD", {
          err: error instanceof Error ? error.message : String(error),
        });
        return "main";
      }
    } catch (error) {
      logger.debug("Failed to detect main branch", {
        err: error instanceof Error ? error.message : String(error),
      });
      return "main";
    }
  }

  /**
   * Get the full working tree status.
   */
  async getWorkingTreeStatus(): Promise<StatusResult> {
    return await this.git.status();
  }

  /**
   * Check if the current directory is inside a git repository.
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(["--is-inside-work-tree"]);
      return true;
    } catch (error) {
      logger.debug("Not a git repository", {
        cwd: this.cwd,
        err: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get the repository root directory.
   */
  async getRepoRoot(): Promise<string> {
    const root = await this.git.revparse(["--show-toplevel"]);
    return root.trim();
  }

  // -- Private helpers --

  private async getUnstagedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [...status.modified, ...status.not_added, ...status.created];
  }

  private async getBranchChangedFiles(): Promise<string[]> {
    const mainBranch = await this.getMainBranch();
    try {
      const result = await this.git.diff(["--name-only", `${mainBranch}...HEAD`]);
      return result.trim().split("\n").filter(Boolean);
    } catch (error) {
      logger.debug("Branch diff --name-only failed, falling back to unstaged", {
        err: error instanceof Error ? error.message : String(error),
      });
      return this.getUnstagedFiles();
    }
  }

  private async getCommitFiles(sha: string): Promise<string[]> {
    try {
      const result = await this.git.diff(["--name-only", `${sha}^`, sha]);
      return result.trim().split("\n").filter(Boolean);
    } catch (error) {
      logger.debug("Failed to get commit files", {
        sha,
        err: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
