// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Diff-Aware Test Plan Types
// ──────────────────────────────────────────────────────────────────────────────

/** A single hunks of a git diff with metadata */
export interface DiffHunk {
  /** Source file path */
  filePath: string;
  /** Change type: added, modified, deleted, renamed */
  changeType: "added" | "modified" | "deleted" | "renamed";
  /** Old file path (for renames) */
  oldPath?: string;
  /** Line ranges that changed */
  lineRanges: Array<{ start: number; end: number }>;
  /** The raw diff content for this hunk */
  diffContent: string;
  /** Detected component/page/API names from the diff */
  affectedIdentifiers: string[];
}

/** Analysis of a full git diff */
export interface DiffAnalysisResult {
  /** All hunks extracted from the diff */
  hunks: DiffHunk[];
  /** Changed files grouped by category */
  categories: {
    pages: string[];
    components: string[];
    apiRoutes: string[];
    styles: string[];
    config: string[];
    tests: string[];
    other: string[];
  };
  /** Detected UI components/pages impacted by the changes */
  impactedAreas: ImpactedArea[];
  /** Summary suitable for LLM prompt injection */
  summary: string;
}

/** A specific area of the application impacted by code changes */
export interface ImpactedArea {
  /** Type of impacted area */
  type: "page" | "component" | "api" | "auth" | "form" | "navigation" | "data-flow";
  /** Human-readable name */
  name: string;
  /** Source file(s) involved */
  files: string[];
  /** Description of what changed and why it matters for testing */
  changeDescription: string;
  /** Suggested test focus areas */
  testFocus: string[];
  /** Priority for testing this area */
  priority: "critical" | "high" | "medium" | "low";
}

/** A diff-aware generated test plan */
export interface DiffTestPlan {
  /** Unique plan identifier */
  id: string;
  /** Git scope that generated this plan */
  gitScope: string;
  /** Timestamp when plan was generated */
  generatedAt: number;
  /** Diff analysis that informed this plan */
  analysis: DiffAnalysisResult;
  /** Generated test steps targeting the changed areas */
  steps: DiffTestStep[];
  /** Natural language summary of what will be tested and why */
  rationale: string;
}

/** A single step in a diff-aware test plan */
export interface DiffTestStep {
  /** Step index */
  index: number;
  /** What this step does */
  description: string;
  /** Type of step */
  type: "navigate" | "interact" | "verify" | "extract" | "wait";
  /** Which impacted area this step targets */
  targetArea?: string;
  /** Assertion to verify */
  assertion?: string;
  /** Why this step was generated (links back to the diff) */
  rationale: string;
}
