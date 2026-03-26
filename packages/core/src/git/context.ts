import { GitManager } from "./git.js";
import { Fingerprint } from "./fingerprint.js";

/**
 * Limits for context building to avoid overwhelming AI prompts.
 */
export interface ContextLimits {
  /** Maximum number of changed files to include. */
  maxFiles: number;
  /** Maximum character length for diff content. */
  maxDiffChars: number;
  /** Maximum number of recent commits. */
  maxCommits: number;
}

/**
 * The complete git context that gets sent to the AI agent.
 */
export interface GitContext {
  /** Current branch name. */
  branch: string;
  /** Main/default branch name. */
  mainBranch: string;
  /** Git scope used for gathering changes. */
  scope: string;
  /** List of changed files. */
  changedFiles: string[];
  /** Truncated files list if exceeding limits. */
  totalChangedFiles: number;
  /** Diff content (may be truncated). */
  diff: string;
  /** Whether the diff was truncated. */
  diffTruncated: boolean;
  /** Recent commit messages. */
  recentCommits: string[];
  /** SHA256 fingerprint of the current state. */
  fingerprint: string;
  /** Whether state has changed since last test. */
  hasChangedSinceLastTest: boolean;
  /** Working tree status summary. */
  status: {
    staged: number;
    modified: number;
    untracked: number;
    deleted: number;
  };
}

const DEFAULT_LIMITS: ContextLimits = {
  maxFiles: 12,
  maxDiffChars: 12000,
  maxCommits: 5,
};

/**
 * ContextBuilder gathers all git context needed for AI-powered testing.
 * It collects changed files, diffs, commits, and fingerprints, then
 * formats them within configured limits.
 */
export class ContextBuilder {
  private git: GitManager;
  private fingerprint: Fingerprint;
  private limits: ContextLimits;

  constructor(cwd?: string, limits?: Partial<ContextLimits>) {
    this.git = new GitManager(cwd);
    this.fingerprint = new Fingerprint(cwd);
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /**
   * Build the complete git context for a given scope.
   */
  async buildContext(scope: string = "unstaged"): Promise<GitContext> {
    // Gather all git information in parallel
    const [branch, mainBranch, allChangedFiles, diff, recentCommits, treeStatus] =
      await Promise.all([
        this.git.getCurrentBranch(),
        this.git.getMainBranch(),
        this.git.getChangedFiles(scope),
        this.git.getDiff(scope),
        this.git.getRecentCommits(this.limits.maxCommits),
        this.git.getWorkingTreeStatus(),
      ]);

    // Apply file limit
    const changedFiles = allChangedFiles.slice(0, this.limits.maxFiles);
    const totalChangedFiles = allChangedFiles.length;

    // Apply diff limit
    const diffTruncated = diff.length > this.limits.maxDiffChars;
    const truncatedDiff = diffTruncated
      ? diff.slice(0, this.limits.maxDiffChars)
      : diff;

    // Generate fingerprint
    const hash = this.fingerprint.generate(
      allChangedFiles,
      diff,
      branch
    );
    const hasChangedSinceLastTest = this.fingerprint.hasChanged(hash);

    return {
      branch,
      mainBranch,
      scope,
      changedFiles,
      totalChangedFiles,
      diff: truncatedDiff,
      diffTruncated,
      recentCommits,
      fingerprint: hash,
      hasChangedSinceLastTest,
      status: {
        staged: treeStatus.staged.length,
        modified: treeStatus.modified.length,
        untracked: treeStatus.not_added.length,
        deleted: treeStatus.deleted.length,
      },
    };
  }

  /**
   * Format the context as a string suitable for an AI prompt.
   */
  formatForPrompt(context: GitContext): string {
    const sections: string[] = [];

    // Header
    sections.push(`Branch: ${context.branch} (base: ${context.mainBranch})`);
    sections.push(`Scope: ${context.scope}`);
    sections.push(
      `Status: ${context.status.modified} modified, ${context.status.staged} staged, ${context.status.untracked} untracked`
    );

    // Changed files
    if (context.changedFiles.length > 0) {
      sections.push("");
      sections.push(
        `Changed Files (${context.changedFiles.length}${context.totalChangedFiles > context.changedFiles.length ? ` of ${context.totalChangedFiles}` : ""}):`
      );
      for (const file of context.changedFiles) {
        sections.push(`  - ${file}`);
      }
      if (context.totalChangedFiles > context.changedFiles.length) {
        sections.push(
          `  ... and ${context.totalChangedFiles - context.changedFiles.length} more files`
        );
      }
    }

    // Diff
    if (context.diff) {
      sections.push("");
      sections.push("Diff:");
      sections.push("```diff");
      sections.push(context.diff);
      if (context.diffTruncated) {
        sections.push("... (truncated)");
      }
      sections.push("```");
    }

    // Recent commits
    if (context.recentCommits.length > 0) {
      sections.push("");
      sections.push("Recent Commits:");
      for (const commit of context.recentCommits) {
        sections.push(`  - ${commit}`);
      }
    }

    // Fingerprint
    sections.push("");
    sections.push(`Fingerprint: ${context.fingerprint.slice(0, 12)}...`);
    sections.push(
      `Changed since last test: ${context.hasChangedSinceLastTest ? "yes" : "no"}`
    );

    return sections.join("\n");
  }

  /**
   * Save the current fingerprint (call after successful test run).
   */
  async saveFingerprint(context: GitContext): Promise<void> {
    this.fingerprint.save(
      context.fingerprint,
      context.changedFiles,
      context.diff,
      context.branch
    );
  }
}
