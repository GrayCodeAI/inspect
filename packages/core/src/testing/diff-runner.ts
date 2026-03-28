// ============================================================================
// @inspect/core - Diff-Based Test Runner
//
// Analyzes git diff to determine which components/pages changed, then
// selects and runs only the tests that cover those changes.
// ============================================================================

import { GitManager } from "../git/git.js";

export interface DiffTestConfig {
  /** Git scope: unstaged, staged, branch, or commit range */
  scope: "unstaged" | "staged" | "branch" | "commit";
  /** Base branch for comparison. Default: "main" */
  baseBranch?: string;
  /** Commit range (for scope: "commit"). e.g., "HEAD~3..HEAD" */
  commitRange?: string;
  /** Map of file patterns to test tags/names */
  coverageMap?: CoverageMapEntry[];
}

export interface CoverageMapEntry {
  /** Glob pattern for source files (e.g., "src/auth/**") */
  filePattern: string;
  /** Test tags or names to run when these files change */
  testTags: string[];
  /** Specific test IDs to run */
  testIds?: string[];
}

export interface DiffAnalysis {
  /** Files that changed */
  changedFiles: string[];
  /** File extensions changed */
  changedExtensions: Set<string>;
  /** Directories with changes */
  changedDirs: Set<string>;
  /** Detected change categories */
  categories: Set<ChangeCategory>;
  /** Tags of tests that should be run based on the coverage map */
  recommendedTags: string[];
  /** Specific test IDs recommended */
  recommendedTestIds: string[];
  /** Whether the changes are test-only (no source changes) */
  testOnly: boolean;
  /** Whether config files changed (needs full run) */
  configChanged: boolean;
}

export type ChangeCategory =
  | "component"
  | "page"
  | "api"
  | "style"
  | "config"
  | "test"
  | "dependency"
  | "docs"
  | "other";

// Default coverage map — maps common file patterns to test categories
const DEFAULT_COVERAGE_MAP: CoverageMapEntry[] = [
  { filePattern: "src/auth/**", testTags: ["auth", "login", "signup"] },
  { filePattern: "src/login/**", testTags: ["auth", "login"] },
  { filePattern: "src/checkout/**", testTags: ["checkout", "payment"] },
  { filePattern: "src/search/**", testTags: ["search"] },
  { filePattern: "src/components/**", testTags: ["component"] },
  { filePattern: "src/pages/**", testTags: ["page", "navigation"] },
  { filePattern: "src/api/**", testTags: ["api"] },
  { filePattern: "src/styles/**", testTags: ["visual"] },
  { filePattern: "src/utils/**", testTags: ["critical"] },
  { filePattern: "src/hooks/**", testTags: ["component"] },
  { filePattern: "src/context/**", testTags: ["critical"] },
  { filePattern: "src/store/**", testTags: ["critical"] },
];

// File patterns that indicate config changes (need full test run)
const CONFIG_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /\.env/,
  /next\.config/,
  /vite\.config/,
  /webpack\.config/,
  /tailwind\.config/,
];

/**
 * DiffRunner analyzes git changes and determines which tests to run.
 */
export class DiffRunner {
  private gitManager: GitManager;
  private coverageMap: CoverageMapEntry[];

  constructor(cwd?: string, coverageMap?: CoverageMapEntry[]) {
    this.gitManager = new GitManager(cwd ?? process.cwd());
    this.coverageMap = coverageMap ?? DEFAULT_COVERAGE_MAP;
  }

  /**
   * Analyze the git diff and determine what to test.
   */
  async analyze(config: DiffTestConfig): Promise<DiffAnalysis> {
    const changedFiles = await this.getChangedFiles(config);

    const changedExtensions = new Set<string>();
    const changedDirs = new Set<string>();
    const categories = new Set<ChangeCategory>();
    const recommendedTags = new Set<string>();
    const recommendedTestIds = new Set<string>();

    let testOnly = true;
    let configChanged = false;

    for (const file of changedFiles) {
      // Extract extension
      const ext = file.split(".").pop() ?? "";
      changedExtensions.add(ext);

      // Extract directory
      const dir = file.replace(/\/[^/]+$/, "");
      changedDirs.add(dir);

      // Categorize
      const category = this.categorizeFile(file);
      categories.add(category);

      if (category !== "test" && category !== "docs") {
        testOnly = false;
      }

      // Check config patterns
      if (CONFIG_PATTERNS.some((p) => p.test(file))) {
        configChanged = true;
      }

      // Match against coverage map
      for (const entry of this.coverageMap) {
        if (this.matchesPattern(file, entry.filePattern)) {
          for (const tag of entry.testTags) recommendedTags.add(tag);
          if (entry.testIds) {
            for (const id of entry.testIds) recommendedTestIds.add(id);
          }
        }
      }
    }

    // If config changed, recommend all critical tests
    if (configChanged) {
      recommendedTags.add("critical");
      recommendedTags.add("smoke");
    }

    return {
      changedFiles,
      changedExtensions,
      changedDirs,
      categories,
      recommendedTags: [...recommendedTags],
      recommendedTestIds: [...recommendedTestIds],
      testOnly,
      configChanged,
    };
  }

  /**
   * Get a tag expression string for the recommended tests.
   */
  async getTagExpression(config: DiffTestConfig): Promise<string> {
    const analysis = await this.analyze(config);

    if (analysis.configChanged) {
      return "critical OR smoke";
    }

    if (analysis.testOnly) {
      return ""; // No source changes, skip testing
    }

    if (analysis.recommendedTags.length === 0) {
      return "smoke"; // Default to smoke tests
    }

    return analysis.recommendedTags.join(" OR ");
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async getChangedFiles(config: DiffTestConfig): Promise<string[]> {
    try {
      return await this.gitManager.getChangedFiles(config.scope);
    } catch {
      return [];
    }
  }

  private categorizeFile(file: string): ChangeCategory {
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) return "test";
    if (/\.(md|txt|rst)$/.test(file) || file.startsWith("docs/")) return "docs";
    if (/package\.json|yarn\.lock|pnpm-lock/.test(file)) return "dependency";
    if (CONFIG_PATTERNS.some((p) => p.test(file))) return "config";
    if (/\.(css|scss|less|styl)$/.test(file)) return "style";
    if (/src\/(pages|routes|views)\//.test(file)) return "page";
    if (/src\/(api|server|backend)\//.test(file)) return "api";
    if (/src\/(components|ui|widgets)\//.test(file)) return "component";
    return "other";
  }

  private matchesPattern(file: string, pattern: string): boolean {
    // Simple glob matching: convert ** to regex
    const regex = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\//g, "\\/");
    return new RegExp(`^${regex}`).test(file);
  }
}
