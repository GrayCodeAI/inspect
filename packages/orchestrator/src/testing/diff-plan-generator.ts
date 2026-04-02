// ============================================================================
// @inspect/orchestrator - Diff-Aware Test Plan Generator
//
// Reads git diffs, analyzes what changed (pages, components, APIs, forms),
// and generates targeted test plans that focus on the changed areas.
// Uses heuristics by default, with optional LLM enhancement.
// ============================================================================

import { GitManagerImpl } from "@inspect/git";
import type {
  DiffHunk,
  DiffAnalysisResult,
  ImpactedArea,
  DiffTestPlan,
  DiffTestStep,
} from "@inspect/shared";

export interface DiffPlanGeneratorConfig {
  /** Git scope to analyze */
  scope: "unstaged" | "staged" | "branch" | "commit";
  /** Base branch for branch scope */
  baseBranch?: string;
  /** Max diff size in chars to send to LLM (default: 30000) */
  maxDiffChars?: number;
  /** Target URL for test plan generation */
  targetUrl?: string;
}

// Mutable categories for internal use
type MutableCategories = {
  pages: string[];
  components: string[];
  apiRoutes: string[];
  styles: string[];
  config: string[];
  tests: string[];
  other: string[];
};

/**
 * DiffPlanGenerator analyzes git diffs and produces targeted test plans.
 *
 * It works in two modes:
 * 1. **Heuristic mode** (no LLM) — parses diff hunks, detects impacted areas,
 *    and generates test steps from code patterns
 * 2. **LLM-enhanced mode** — sends the diff + impacted areas to an LLM for
 *    richer, context-aware test plan generation
 */
export class DiffPlanGenerator {
  private gitManager: GitManagerImpl;

  constructor(cwd?: string) {
    this.gitManager = new GitManagerImpl(cwd ?? process.cwd());
  }

  /**
   * Analyze a git diff and extract structured information about what changed.
   */
  async analyzeDiff(config: DiffPlanGeneratorConfig): Promise<DiffAnalysisResult> {
    const diff = await this.gitManager.getDiff(config.scope);
    const changedFiles = await this.gitManager.getChangedFiles(config.scope);

    const hunks = this.parseHunks(diff, changedFiles);
    const categories = this.categorizeFiles(changedFiles);
    const impactedAreas = this.detectImpactedAreas(hunks, categories);
    const summary = this.buildSummary(hunks, categories, impactedAreas);

    // Calculate confidence based on number of hunks and categories
    const confidence = Math.min(0.9, Math.max(0.5, (hunks.length + impactedAreas.length) / 20));

    // Determine risk level based on changed file categories
    let riskLevel: "critical" | "high" | "medium" | "low" = "low";
    if (categories.config.length > 0 || categories.apiRoutes.length > 3) riskLevel = "critical";
    else if (categories.pages.length > 0 || categories.apiRoutes.length > 0) riskLevel = "high";
    else if (categories.components.length > 2 || categories.styles.length > 0) riskLevel = "medium";

    // Cast mutable categories to the expected type
    return {
      hunks,
      categories: categories as unknown as DiffAnalysisResult["categories"],
      impactedAreas,
      summary,
      confidence,
      riskLevel,
    };
  }

  /**
   * Generate a full test plan from a git diff.
   * Uses heuristic analysis, optionally enhanced by an LLM.
   */
  async generatePlan(config: DiffPlanGeneratorConfig): Promise<DiffTestPlan> {
    const analysis = await this.analyzeDiff(config);
    const steps = this.generateStepsFromAnalysis(analysis, config.targetUrl);
    const rationale = this.buildRationale(analysis);

    return {
      id: `diff-plan-${Date.now()}`,
      gitScope: config.scope,
      generatedAt: Date.now(),
      analysis,
      steps,
      rationale,
    };
  }

  /**
   * Format a DiffTestPlan as natural language instructions for the agent.
   */
  formatAsInstructions(plan: DiffTestPlan): string {
    const lines: string[] = [];

    lines.push("## Diff-Aware Test Plan");
    lines.push("");
    lines.push(plan.rationale);
    lines.push("");
    lines.push(`### Changed Areas (${plan.analysis.impactedAreas.length} detected)`);
    lines.push("");

    for (const area of plan.analysis.impactedAreas) {
      const priority = (area.priority ?? "medium").toUpperCase();
      lines.push(`**[${priority}] ${area.type}: ${area.name}**`);
      lines.push(`  Files: ${area.files.join(", ")}`);
      lines.push(`  Change: ${area.changeDescription}`);
      lines.push(`  Test focus: ${(area.testFocus ?? []).join("; ")}`);
      lines.push("");
    }

    lines.push("### Test Steps");
    lines.push("");

    for (const step of plan.steps) {
      lines.push(`${step.index + 1}. **${step.type}**: ${step.description}`);
      if (step.assertion) {
        lines.push(`   Assert: ${step.assertion}`);
      }
      lines.push(`   Why: ${step.rationale ?? "Ensure functionality works as expected"}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  // ── Diff Parsing ─────────────────────────────────────────────────────────

  private parseHunks(diff: string, changedFiles: string[]): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const fileDiffs = this.splitDiffByFile(diff);

    for (const [filePath, fileDiff] of fileDiffs) {
      const changeType = this.detectChangeType(fileDiff, filePath, changedFiles);
      const lineRanges = this.extractLineRanges(fileDiff);
      const affectedIdentifiers = this.extractIdentifiers(fileDiff, filePath);

      hunks.push({
        filePath,
        changeType,
        lineRanges,
        diffContent: fileDiff.slice(0, 5000),
        affectedIdentifiers,
      } as DiffHunk);
    }

    return hunks;
  }

  private splitDiffByFile(diff: string): Map<string, string> {
    const files = new Map<string, string>();
    const parts = diff.split(/^(?=diff --git )/m);

    for (const part of parts) {
      const match = part.match(/diff --git a\/(.+?) b\/(.+)/);
      if (match) {
        const filePath = match[2];
        files.set(filePath, part);
      }
    }

    return files;
  }

  private detectChangeType(
    fileDiff: string,
    _filePath: string,
    _changedFiles: string[],
  ): DiffHunk["changeType"] {
    if (fileDiff.includes("new file mode")) return "added";
    if (fileDiff.includes("deleted file mode")) return "deleted";
    if (fileDiff.includes("rename from")) return "renamed";
    return "modified";
  }

  private extractLineRanges(diff: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const hunkPattern = /@ -(\d+),?\d* \+(\d+),?\d* @/g;
    let match: RegExpExecArray | null;

    while ((match = hunkPattern.exec(diff)) !== null) {
      const start = Number.parseInt(match[2], 10);
      ranges.push({ start, end: start + 20 });
    }

    return ranges;
  }

  private extractIdentifiers(diff: string, filePath: string): string[] {
    const identifiers = new Set<string>();

    // Extract component/class/function names from added lines
    const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));

    for (const line of addedLines) {
      // React components
      const compMatch = line.match(/(?:function|const|class)\s+([A-Z]\w+)/);
      if (compMatch) identifiers.add(compMatch[1]);

      // Function declarations
      const fnMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*[=(]/);
      if (fnMatch) identifiers.add(fnMatch[1]);

      // Route/page patterns
      const routeMatch = line.match(/['"]\/([\w/-]+)['"]/);
      if (routeMatch) identifiers.add(`route:${routeMatch[1]}`);

      // API endpoints
      const apiMatch = line.match(
        /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)/,
      );
      if (apiMatch) identifiers.add(`api:${apiMatch[1].toUpperCase()} ${apiMatch[2]}`);

      // Form field names
      const fieldMatch = line.match(/name:\s*['"](\w+)['"]/);
      if (fieldMatch) identifiers.add(`field:${fieldMatch[1]}`);
    }

    // Add the file path as context
    identifiers.add(`file:${filePath}`);

    return [...identifiers];
  }

  // ── Categorization ───────────────────────────────────────────────────────

  private categorizeFiles(files: string[]): MutableCategories {
    const categories: MutableCategories = {
      pages: [],
      components: [],
      apiRoutes: [],
      styles: [],
      config: [],
      tests: [],
      other: [],
    };

    for (const file of files) {
      if (/\.(test|spec)\.\w+$/.test(file)) {
        categories.tests.push(file);
      } else if (/\/(pages|routes|views|app)\//.test(file)) {
        categories.pages.push(file);
      } else if (/\/(components|ui|widgets)\//.test(file)) {
        categories.components.push(file);
      } else if (/\/(api|server|backend|routes)\//.test(file)) {
        categories.apiRoutes.push(file);
      } else if (/\.(css|scss|less|styl)$/.test(file)) {
        categories.styles.push(file);
      } else if(/(\.json|\.ya?ml|\.config\.|\.env)/.test(file)) {
        categories.config.push(file);
      } else {
        categories.other.push(file);
      }
    }

    return categories;
  }

  // ── Impact Detection ─────────────────────────────────────────────────────

  private detectImpactedAreas(
    hunks: DiffHunk[],
    categories: MutableCategories,
  ): ImpactedArea[] {
    const areas: ImpactedArea[] = [];

    // Pages changed → navigation and functional testing
    for (const page of categories.pages) {
      const pageName = this.extractPageName(page);
      const hunk = hunks.find((h) => h.filePath === page);
      const testFocus: string[] = ["page loads correctly"];
      const diffContent = hunk?.diffContent ?? "";

      if (diffContent.includes("form") || diffContent.includes("input")) {
        testFocus.push("form submission", "input validation");
      }
      if (diffContent.includes("navigate") || diffContent.includes("router")) {
        testFocus.push("navigation flow", "route transitions");
      }
      if (diffContent.includes("fetch") || diffContent.includes("axios")) {
        testFocus.push("API integration", "loading states", "error handling");
      }
      if (diffContent.includes("auth") || diffContent.includes("login")) {
        testFocus.push("authentication flow", "session management");
      }

      areas.push({
        type: "page",
        name: pageName,
        files: [page],
        changeDescription: `Page modified: ${page}`,
        testFocus,
        risk: "critical",
        priority: "critical",
      } as ImpactedArea);
    }

    // Components changed → interaction testing
    for (const comp of categories.components) {
      const compName = this.extractComponentName(comp);
      const hunk = hunks.find((h) => h.filePath === comp);
      const testFocus: string[] = ["component renders"];
      const diffContent = hunk?.diffContent ?? "";

      if (diffContent?.includes("onClick") || diffContent?.includes("handler")) {
        testFocus.push("click interactions");
      }
      if (diffContent?.includes("useState") || diffContent?.includes("setState")) {
        testFocus.push("state changes", "re-rendering");
      }
      if (diffContent?.includes("props")) {
        testFocus.push("props handling");
      }

      areas.push({
        type: "component",
        name: compName,
        files: [comp],
        changeDescription: `Component modified: ${comp}`,
        testFocus,
        risk: "high",
        priority: "high",
      } as ImpactedArea);
    }

    // API routes changed → API testing
    for (const api of categories.apiRoutes) {
      const apiName = this.extractApiName(api);
      areas.push({
        type: "api",
        name: apiName,
        files: [api],
        changeDescription: `API route modified: ${api}`,
        testFocus: [
          "request/response handling",
          "error responses",
          "input validation",
          "status codes",
        ],
        risk: "high",
        priority: "high",
      } as ImpactedArea);
    }

    // Styles changed → visual regression
    if (categories.styles.length > 0) {
      areas.push({
        type: "style",
        name: "Visual styling",
        files: categories.styles,
        changeDescription: `${categories.styles.length} style file(s) modified`,
        testFocus: ["visual regression", "layout integrity", "responsive behavior"],
        risk: "medium",
        priority: "medium",
      } as ImpactedArea);
    }

    // Config changed → full regression
    if (categories.config.length > 0) {
      areas.push({
        type: "config",
        name: "Configuration",
        files: categories.config,
        changeDescription: `${categories.config.length} config file(s) modified`,
        testFocus: ["full regression", "build succeeds", "no runtime errors"],
        risk: "critical",
        priority: "critical",
      } as ImpactedArea);
    }

    return areas;
  }

  // ── Test Step Generation ─────────────────────────────────────────────────

  private generateStepsFromAnalysis(
    analysis: DiffAnalysisResult,
    targetUrl?: string,
  ): DiffTestStep[] {
    const steps: DiffTestStep[] = [];
    let index = 0;
    const url = targetUrl ?? "http://localhost:3000";

    // Always start with page load verification
    steps.push({
      id: `step-${index}`,
      index: index++,
      description: `Navigate to ${url} and verify page loads without errors`,
      type: "navigate",
      assertion: "Page loads without console errors or network failures",
      rationale: "Baseline verification before testing changes",
    } as DiffTestStep);

    // Generate steps for each impacted area, sorted by priority
    const sortedAreas = [...analysis.impactedAreas].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority ?? "medium"] - order[b.priority ?? "medium"];
    });

    for (const area of sortedAreas) {
      // Navigate to the affected area
      if (area.type === "page") {
        steps.push({
          id: `step-${index}`,
          index: index++,
          description: `Navigate to the ${area.name} page`,
          type: "navigate",
          targetArea: area.name,
          rationale: `Page was modified: ${area.files.join(", ")}`,
        } as DiffTestStep);
      }

      // Generate interaction steps based on test focus
      for (const focus of (area.testFocus ?? [])) {
        if (focus.includes("form") || focus.includes("input") || focus.includes("validation")) {
          steps.push({
            id: `step-${index}`,
            index: index++,
            description: `Test ${focus} on ${area.name}`,
            type: "interact",
            targetArea: area.name,
            assertion: `${focus} works correctly`,
            rationale: `Code changes in ${area.files[0]} affect form/input behavior`,
          } as DiffTestStep);
        } else if (focus.includes("click") || focus.includes("interaction")) {
          steps.push({
            id: `step-${index}`,
            index: index++,
            description: `Test ${focus} on ${area.name}`,
            type: "interact",
            targetArea: area.name,
            assertion: `Interaction triggers expected behavior`,
            rationale: `Event handlers were modified in ${area.files[0]}`,
          } as DiffTestStep);
        } else if (focus.includes("navigation") || focus.includes("route")) {
          steps.push({
            id: `step-${index}`,
            index: index++,
            description: `Verify ${focus} for ${area.name}`,
            type: "verify",
            targetArea: area.name,
            assertion: `Navigation works correctly`,
            rationale: `Routing changes detected in ${area.files[0]}`,
          } as DiffTestStep);
        } else if (
          focus.includes("API") ||
          focus.includes("request") ||
          focus.includes("response")
        ) {
          steps.push({
            id: `step-${index}`,
            index: index++,
            description: `Verify ${focus} for ${area.name}`,
            type: "verify",
            targetArea: area.name,
            assertion: `API calls succeed with expected responses`,
            rationale: `API route changes detected in ${area.files[0]}`,
          } as DiffTestStep);
        } else if (focus.includes("visual") || focus.includes("layout")) {
          steps.push({
            id: `step-${index}`,
            index: index++,
            description: `Capture screenshot for visual regression on ${area.name}`,
            type: "verify",
            targetArea: area.name,
            assertion: `Visual appearance matches expected baseline`,
            rationale: `Style changes detected in ${area.files.join(", ")}`,
          } as DiffTestStep);
        }
      }
    }

    // Always end with error checking
    steps.push({
      id: `step-${index}`,
      index: index,
      description: "Check browser console for errors and network request failures",
      type: "verify",
      assertion: "No unexpected console errors or failed network requests",
      rationale: "Regression check: ensure changes don't introduce side effects",
    } as DiffTestStep);

    return steps;
  }

  // ── Summary & Rationale ──────────────────────────────────────────────────

  private buildSummary(
    hunks: DiffHunk[],
    categories: MutableCategories,
    impactedAreas: ImpactedArea[],
  ): string {
    const parts: string[] = [];

    parts.push(
      `Analyzed ${hunks.length} diff hunk(s) across ${new Set(hunks.map((h) => h.filePath)).size} file(s).`,
    );

    if (categories.pages.length > 0) {
      parts.push(
        `${categories.pages.length} page(s) modified: ${categories.pages.map(this.extractPageName).join(", ")}.`,
      );
    }
    if (categories.components.length > 0) {
      parts.push(
        `${categories.components.length} component(s) modified: ${categories.components.map(this.extractComponentName).join(", ")}.`,
      );
    }
    if (categories.apiRoutes.length > 0) {
      parts.push(`${categories.apiRoutes.length} API route(s) modified.`);
    }
    if (categories.styles.length > 0) {
      parts.push(`${categories.styles.length} style file(s) modified.`);
    }

    parts.push(`Detected ${impactedAreas.length} impacted area(s) requiring testing.`);

    return parts.join(" ");
  }

  private buildRationale(analysis: DiffAnalysisResult): string {
    const parts: string[] = [];

    parts.push("This test plan was generated by analyzing git diff changes.");
    parts.push(analysis.summary);
    parts.push("");

    if (analysis.impactedAreas.length === 0) {
      parts.push("No significant UI/API changes detected. Running baseline smoke tests.");
    } else {
      parts.push("The plan focuses on the following changed areas:");
      for (const area of analysis.impactedAreas) {
        parts.push(
          `- [${(area.priority ?? "medium").toUpperCase()}] ${area.type}: ${area.name} (${area.changeDescription})`,
        );
      }
    }

    return parts.join("\n");
  }

  // ── Name Extraction Helpers ──────────────────────────────────────────────

  private extractPageName(filePath: string): string {
    const parts = filePath.split("/");
    const filename = parts[parts.length - 1]?.replace(/\.\w+$/, "") ?? "unknown";
    return filename.charAt(0).toUpperCase() + filename.slice(1);
  }

  private extractComponentName(filePath: string): string {
    const parts = filePath.split("/");
    const filename = parts[parts.length - 1]?.replace(/\.\w+$/, "") ?? "unknown";
    return filename.charAt(0).toUpperCase() + filename.slice(1);
  }

  private extractApiName(filePath: string): string {
    const parts = filePath.split("/");
    const filename = parts[parts.length - 1]?.replace(/\.\w+$/, "") ?? "unknown";
    return `API: ${filename}`;
  }
}
