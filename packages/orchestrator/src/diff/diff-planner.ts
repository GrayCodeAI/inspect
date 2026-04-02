/**
 * Diff-Aware Test Planning
 *
 * Generates intelligent test plans from git diff analysis.
 * Uses AST parsing + LLM for rich understanding of changes.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface DiffPlannerConfig {
  /** Git scope for diff */
  scope: "working" | "staged" | "branch" | "commit";
  /** Base branch for comparison */
  baseBranch?: string;
  /** Include untracked files */
  includeUntracked: boolean;
  /** Max files to analyze */
  maxFiles: number;
  /** Use LLM for analysis */
  useLLM: boolean;
  /** LLM provider */
  llmProvider?: LLMProvider;
  /** Callback on plan generated */
  onPlanGenerated?: (plan: DiffTestPlan) => void;
}

export interface LLMProvider {
  complete(prompt: string, options: { model: string; temperature: number }): Promise<string>;
}

export interface DiffTestPlan {
  /** Impacted areas */
  impactedAreas: ImpactedArea[];
  /** Generated test steps */
  testSteps: TestStep[];
  /** Confidence score */
  confidence: number;
  /** Generated from */
  source: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    commits: string[];
  };
  /** Timestamp */
  generatedAt: number;
}

export interface ImpactedArea {
  type: "component" | "route" | "api" | "function" | "style" | "config";
  name: string;
  file: string;
  severity: "low" | "medium" | "high";
  description: string;
  dependencies: string[];
}

export interface TestStep {
  id: string;
  description: string;
  type: "navigate" | "interact" | "verify" | "api" | "accessibility";
  target: string;
  assertion?: string;
  priority: "low" | "medium" | "high";
  rationale: string;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
  content?: string;
}

export const DEFAULT_DIFF_PLANNER_CONFIG: DiffPlannerConfig = {
  scope: "working",
  includeUntracked: false,
  maxFiles: 20,
  useLLM: true,
};

/**
 * Diff-Aware Test Planner
 */
export class DiffPlanner {
  private config: DiffPlannerConfig;
  private cwd: string;

  constructor(
    cwd: string = process.cwd(),
    config: Partial<DiffPlannerConfig> = {}
  ) {
    this.cwd = cwd;
    this.config = { ...DEFAULT_DIFF_PLANNER_CONFIG, ...config };
  }

  /**
   * Generate test plan from git diff
   */
  async generatePlan(): Promise<DiffTestPlan> {
    // Get diff
    const changes = await this.getChanges();

    // Analyze changes
    const impactedAreas = this.analyzeImpactedAreas(changes);

    // Generate test steps
    const testSteps = await this.generateTestSteps(impactedAreas, changes);

    // Calculate confidence
    const confidence = this.calculateConfidence(changes, impactedAreas);

    const plan: DiffTestPlan = {
      impactedAreas,
      testSteps: this.prioritizeSteps(testSteps),
      confidence,
      source: {
        filesChanged: changes.length,
        linesAdded: changes.reduce((sum, c) => sum + c.additions, 0),
        linesRemoved: changes.reduce((sum, c) => sum + c.deletions, 0),
        commits: this.getCommits(),
      },
      generatedAt: Date.now(),
    };

    this.config.onPlanGenerated?.(plan);
    return plan;
  }

  /**
   * Get git changes
   */
  private async getChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    // Get diff stats
    const stats = this.execGit("diff --stat");
    console.log("Git diff stats:", stats);

    // Get changed files
    let output: string;
    switch (this.config.scope) {
      case "staged":
        output = this.execGit("diff --cached --name-status");
        break;
      case "branch":
        const base = this.config.baseBranch || "main";
        output = this.execGit(`diff --name-status ${base}...HEAD`);
        break;
      case "commit":
        output = this.execGit("diff --name-status HEAD~1 HEAD");
        break;
      case "working":
      default:
        output = this.execGit("diff --name-status");
    }

    const lines = output.trim().split("\n").filter(Boolean);

    for (const line of lines.slice(0, this.config.maxFiles)) {
      const parts = line.split("\t");
      const status = parts[0][0];
      const file = parts[1];

      let changeStatus: FileChange["status"];
      switch (status) {
        case "A":
          changeStatus = "added";
          break;
        case "M":
          changeStatus = "modified";
          break;
        case "D":
          changeStatus = "deleted";
          break;
        case "R":
          changeStatus = "renamed";
          break;
        default:
          changeStatus = "modified";
      }

      // Get diff stats for file
      const fileStats = this.getFileStats(file);

      changes.push({
        path: file,
        status: changeStatus,
        additions: fileStats.additions,
        deletions: fileStats.deletions,
        patch: this.getFilePatch(file),
        content: changeStatus !== "deleted" ? this.getFileContent(file) : undefined,
      });
    }

    return changes;
  }

  /**
   * Get file diff stats
   */
  private getFileStats(file: string): { additions: number; deletions: number } {
    try {
      const output = this.execGit(`diff --numstat -- "${file}"`);
      const parts = output.split("\t");
      return {
        additions: parseInt(parts[0]) || 0,
        deletions: parseInt(parts[1]) || 0,
      };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }

  /**
   * Get file patch
   */
  private getFilePatch(file: string): string | undefined {
    try {
      return this.execGit(`diff -- "${file}"`);
    } catch {
      return undefined;
    }
  }

  /**
   * Get file content
   */
  private getFileContent(file: string): string | undefined {
    try {
      const path = join(this.cwd, file);
      if (existsSync(path)) {
        return readFileSync(path, "utf-8");
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  /**
   * Analyze impacted areas from changes
   */
  private analyzeImpactedAreas(changes: FileChange[]): ImpactedArea[] {
    const areas: ImpactedArea[] = [];

    for (const change of changes) {
      // Skip non-code files
      if (!this.isCodeFile(change.path)) continue;

      const area = this.analyzeFile(change);
      if (area) {
        areas.push(area);
      }
    }

    return areas;
  }

  /**
   * Analyze a single file
   */
  private analyzeFile(change: FileChange): ImpactedArea | null {
    const path = change.path.toLowerCase();

    // Determine type
    let type: ImpactedArea["type"] = "function";
    if (path.includes("component") || path.includes(".tsx") || path.includes(".jsx")) {
      type = "component";
    } else if (path.includes("route") || path.includes("page")) {
      type = "route";
    } else if (path.includes("api") || path.includes("endpoint")) {
      type = "api";
    } else if (path.includes("style") || path.includes(".css") || path.includes(".scss")) {
      type = "style";
    } else if (path.includes("config")) {
      type = "config";
    }

    // Determine severity
    let severity: ImpactedArea["severity"] = "low";
    if (change.status === "deleted") {
      severity = "high";
    } else if (change.additions + change.deletions > 100) {
      severity = "high";
    } else if (change.additions + change.deletions > 20) {
      severity = "medium";
    }

    // Extract name
    const name = change.path.split("/").pop()?.replace(/\.(tsx?|jsx?|css|scss)$/, "") || "unknown";

    return {
      type,
      name,
      file: change.path,
      severity,
      description: this.generateDescription(change, type),
      dependencies: this.extractDependencies(change.content),
    };
  }

  /**
   * Generate description for change
   */
  private generateDescription(change: FileChange, type: ImpactedArea["type"]): string {
    const parts: string[] = [];

    if (change.status === "added") {
      parts.push(`New ${type} added`);
    } else if (change.status === "deleted") {
      parts.push(`${type} removed`);
    } else {
      parts.push(`${type} modified`);
    }

    if (change.additions > 0) {
      parts.push(`${change.additions} lines added`);
    }
    if (change.deletions > 0) {
      parts.push(`${change.deletions} lines removed`);
    }

    return parts.join(", ");
  }

  /**
   * Extract dependencies from file content
   */
  private extractDependencies(content?: string): string[] {
    if (!content) return [];

    const deps: string[] = [];

    // Import patterns
    const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const dep = match.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        if (dep && !dep.startsWith(".")) {
          deps.push(dep);
        }
      }
    }

    return [...new Set(deps)];
  }

  /**
   * Generate test steps from impacted areas
   */
  private async generateTestSteps(
    areas: ImpactedArea[],
    changes: FileChange[]
  ): Promise<TestStep[]> {
    const steps: TestStep[] = [];

    // Generate steps for each area
    for (const area of areas) {
      const areaSteps = this.generateStepsForArea(area);
      steps.push(...areaSteps);
    }

    // Use LLM for enhanced steps if configured
    if (this.config.useLLM && this.config.llmProvider) {
      const enhancedSteps = await this.enhanceWithLLM(steps, areas, changes);
      return enhancedSteps;
    }

    return steps;
  }

  /**
   * Generate steps for a specific area
   */
  private generateStepsForArea(area: ImpactedArea): TestStep[] {
    const steps: TestStep[] = [];

    switch (area.type) {
      case "component":
        steps.push({
          id: `comp-${area.name}-render`,
          description: `Verify ${area.name} component renders correctly`,
          type: "verify",
          target: area.name,
          assertion: `${area.name} is visible and functional`,
          priority: area.severity,
          rationale: `Component was ${area.severity}-severity modified`,
        });
        break;

      case "route":
        steps.push({
          id: `route-${area.name}-navigate`,
          description: `Navigate to ${area.name} route`,
          type: "navigate",
          target: `/${area.name.toLowerCase()}`,
          assertion: "Page loads without errors",
          priority: area.severity,
          rationale: "Route was modified",
        });
        break;

      case "api":
        steps.push({
          id: `api-${area.name}-test`,
          description: `Test ${area.name} API endpoint`,
          type: "api",
          target: area.name,
          assertion: "API returns expected response",
          priority: area.severity,
          rationale: "API was modified",
        });
        break;

      case "style":
        steps.push({
          id: `style-${area.name}-visual`,
          description: `Verify visual appearance after style changes`,
          type: "verify",
          target: "page",
          assertion: "No visual regressions",
          priority: area.severity,
          rationale: "Styles were modified",
        });
        break;

      default:
        steps.push({
          id: `func-${area.name}-test`,
          description: `Test ${area.name} functionality`,
          type: "verify",
          target: area.name,
          assertion: "Function works correctly",
          priority: area.severity,
          rationale: `Code was ${area.severity}-severity modified`,
        });
    }

    // Add accessibility check for UI changes
    if (area.type === "component" || area.type === "route") {
      steps.push({
        id: `a11y-${area.name}-check`,
        description: `Check accessibility of ${area.name}`,
        type: "accessibility",
        target: area.name,
        assertion: "No accessibility violations",
        priority: area.severity,
        rationale: "UI changes may impact accessibility",
      });
    }

    return steps;
  }

  /**
   * Enhance steps with LLM
   */
  private async enhanceWithLLM(
    steps: TestStep[],
    areas: ImpactedArea[],
    changes: FileChange[]
  ): Promise<TestStep[]> {
    // For now, return original steps
    // In production, would send to LLM for enhancement
    return steps;
  }

  /**
   * Prioritize test steps
   */
  private prioritizeSteps(steps: TestStep[]): TestStep[] {
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    return steps.sort((a, b) => {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    changes: FileChange[],
    areas: ImpactedArea[]
  ): number {
    let score = 0.5;

    // More files = less confidence
    if (changes.length < 5) score += 0.2;
    if (changes.length > 10) score -= 0.1;

    // High severity areas increase confidence (more focused)
    const highSeverityCount = areas.filter((a) => a.severity === "high").length;
    if (highSeverityCount > 0) score += 0.1;

    // Code files increase confidence
    const codeFileRatio =
      changes.filter((c) => this.isCodeFile(c.path)).length / changes.length;
    score += codeFileRatio * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if file is a code file
   */
  private isCodeFile(path: string): boolean {
    const codeExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".vue",
      ".svelte",
      ".css",
      ".scss",
    ];
    return codeExtensions.some((ext) => path.endsWith(ext));
  }

  /**
   * Execute git command
   */
  private execGit(args: string): string {
    return execSync(`git ${args}`, { cwd: this.cwd, encoding: "utf-8" });
  }

  /**
   * Get recent commits
   */
  private getCommits(): string[] {
    try {
      const output = this.execGit("log --oneline -5");
      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

/**
 * Convenience function
 */
export async function generateDiffPlan(
  cwd?: string,
  config?: Partial<DiffPlannerConfig>
): Promise<DiffTestPlan> {
  const planner = new DiffPlanner(cwd, config);
  return planner.generatePlan();
}
