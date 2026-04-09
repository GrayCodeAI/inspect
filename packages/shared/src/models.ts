import { Schema } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// Branded IDs
// ─────────────────────────────────────────────────────────────────────────────

export const StepId = Schema.String.pipe(Schema.brand("StepId"));
export type StepId = typeof StepId.Type;

export const PlanId = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = typeof PlanId.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Task 1-20: Core Schema Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const TestPlanStepStatus = Schema.Literals([
  "pending",
  "active",
  "passed",
  "failed",
  "skipped",
  "error",
] as const);
export type TestPlanStepStatus = typeof TestPlanStepStatus.Type;

export class TestPlanStep extends Schema.Class<TestPlanStep>("TestPlanStep")({
  id: Schema.String,
  instruction: Schema.String,
  status: TestPlanStepStatus,
  summary: Schema.optional(Schema.String),
  startedAt: Schema.optional(Schema.Number),
  completedAt: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.Number),
  screenshot: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}) {
  get isActive(): boolean {
    return this.status === "active";
  }
  get isDone(): boolean {
    const done: TestPlanStepStatus[] = ["passed", "failed", "skipped"];
    return done.includes(this.status);
  }
  update(fields: Partial<TestPlanStep>): TestPlanStep {
    return new TestPlanStep({ ...this, ...fields });
  }
}

export class TestPlan extends Schema.Class<TestPlan>("TestPlan")({
  id: Schema.String,
  steps: Schema.Array(TestPlanStep),
  baseUrl: Schema.optional(Schema.String),
  isHeadless: Schema.Boolean,
  requiresCookies: Schema.Boolean,
  instruction: Schema.String,
  createdAt: Schema.Number,
}) {
  get completedCount(): number {
    return this.steps.filter((s) => s.isDone).length;
  }
  get activeStep(): TestPlanStep | undefined {
    return this.steps.find((s) => s.isActive);
  }
  get displayName(): string {
    return this.instruction.slice(0, 60);
  }
  update(fields: Partial<TestPlan>): TestPlan {
    return new TestPlan({ ...this, ...fields });
  }
  updateStep(index: number, step: TestPlanStep): TestPlan {
    const steps = [...this.steps];
    steps[index] = step;
    return new TestPlan({ ...this, steps });
  }
}

export class TestResult extends Schema.Class<TestResult>("TestResult")({
  status: Schema.Literals(["passed", "failed", "partial"] as const),
  summary: Schema.String,
  steps: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      status: Schema.Literals(["passed", "failed", "skipped"] as const),
      summary: Schema.String,
      duration: Schema.Number,
      screenshot: Schema.optional(Schema.String),
    }),
  ),
  duration: Schema.Number,
  artifacts: Schema.Array(Schema.String),
  startedAt: Schema.Number,
  completedAt: Schema.Number,
}) {
  get toPlainText(): string {
    const lines = [`Status: ${this.status}`, `Summary: ${this.summary}`];
    for (const step of this.steps) {
      lines.push(`${step.status.toUpperCase()} ${step.title}: ${step.summary}`);
    }
    return lines.join("\n");
  }
}

export class StepStarted extends Schema.TaggedClass<StepStarted>()("StepStarted", {
  stepId: Schema.String,
  timestamp: Schema.Number,
}) {}

export class StepCompleted extends Schema.TaggedClass<StepCompleted>()("StepCompleted", {
  stepId: Schema.String,
  summary: Schema.String,
  timestamp: Schema.Number,
}) {}

export class StepFailed extends Schema.TaggedClass<StepFailed>()("StepFailed", {
  stepId: Schema.String,
  message: Schema.String,
  timestamp: Schema.Number,
}) {}

export class ToolCall extends Schema.TaggedClass<ToolCall>()("ToolCall", {
  toolName: Schema.String,
  input: Schema.Unknown,
  timestamp: Schema.Number,
}) {
  get displayText(): string {
    if (typeof this.input === "object" && this.input !== null && "command" in this.input) {
      return String((this.input as Record<string, unknown>).command).slice(0, 80);
    }
    return this.toolName;
  }
}

export class ToolResult extends Schema.TaggedClass<ToolResult>()("ToolResult", {
  toolName: Schema.String,
  result: Schema.String,
  isError: Schema.Boolean,
  timestamp: Schema.Number,
}) {}

export type ExecutionEvent = StepStarted | StepCompleted | StepFailed | ToolCall | ToolResult;
export const ExecutionEvent = Schema.Union([
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
]);

// ─────────────────────────────────────────────────────────────────────────────
// UpdateContent variants for supervisor Updates service
// ─────────────────────────────────────────────────────────────────────────────

export class RunStarted extends Schema.TaggedClass<RunStarted>()("RunStarted", {
  planId: PlanId,
}) {}

export class AgentThinking extends Schema.TaggedClass<AgentThinking>()("AgentThinking", {
  text: Schema.String,
}) {}

export class RunCompleted extends Schema.TaggedClass<RunCompleted>()("RunCompleted", {
  status: Schema.Literals(["passed", "failed"] as const),
  summary: Schema.String,
  screenshotPaths: Schema.Array(Schema.String),
}) {}

export type UpdateContent =
  | RunStarted
  | StepStarted
  | StepCompleted
  | StepFailed
  | ToolCall
  | ToolResult
  | AgentThinking
  | RunCompleted;
export const UpdateContent = Schema.Union([
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  RunCompleted,
]);

// ─────────────────────────────────────────────────────────────────────────────
// ExecutedTestPlan with addEvent() method
// ─────────────────────────────────────────────────────────────────────────────

export class ExecutedTestPlan extends TestPlan.extend<ExecutedTestPlan>("ExecutedTestPlan")({
  events: Schema.Array(UpdateContent),
}) {
  addEvent(event: UpdateContent): ExecutedTestPlan {
    return new ExecutedTestPlan({ ...this, events: [...this.events, event] });
  }
  get testReport(): TestReport {
    const stepStatuses = new Map<string, { status: TestPlanStepStatus; summary: string }>();
    for (const event of this.events) {
      if (event._tag === "StepStarted") {
        stepStatuses.set(event.stepId, { status: "active", summary: "" });
      } else if (event._tag === "StepCompleted") {
        stepStatuses.set(event.stepId, { status: "passed", summary: event.summary });
      } else if (event._tag === "StepFailed") {
        stepStatuses.set(event.stepId, { status: "failed", summary: event.message });
      }
    }
    const reportSteps = this.steps.map((step) => {
      const stepStatus = stepStatuses.get(step.id);
      let reportStatus: TestReportStepStatus = "not-run";
      if (stepStatus) {
        if (stepStatus.status === "passed" || stepStatus.status === "failed") {
          reportStatus = stepStatus.status;
        }
      }
      return new TestReportStep({
        stepId: StepId.makeUnsafe(step.id),
        title: step.instruction,
        status: reportStatus,
        summary: stepStatus?.summary ?? "",
      });
    });
    const allPassed = reportSteps.every((s) => s.status !== "failed");
    const runCompleted = this.events.find((e) => e._tag === "RunCompleted");
    return new TestReport({
      plan: this,
      summary: runCompleted?._tag === "RunCompleted" ? runCompleted.summary : "Test run completed",
      steps: reportSteps,
      screenshotPaths: runCompleted?._tag === "RunCompleted" ? runCompleted.screenshotPaths : [],
      status: allPassed ? "passed" : "failed",
    });
  }
  get activeStepId(): StepId | undefined {
    let activeId: string | undefined;
    for (const event of this.events) {
      if (event._tag === "StepStarted") activeId = event.stepId;
      if (
        (event._tag === "StepCompleted" || event._tag === "StepFailed") &&
        activeId === event.stepId
      ) {
        return undefined;
      }
    }
    return activeId as StepId | undefined;
  }
  get completedCount(): number {
    return this.steps.filter((s) => {
      const status = this.events.find((e) => e._tag === "StepCompleted" && e.stepId === s.id);
      return status !== undefined;
    }).length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TestReport and TestReportStep
// ─────────────────────────────────────────────────────────────────────────────

export class TestReportStep extends Schema.Class<TestReportStep>("TestReportStep")({
  stepId: StepId,
  title: Schema.String,
  status: Schema.Literals(["passed", "failed", "not-run"] as const),
  summary: Schema.String,
}) {}

const TestReportStepStatus = Schema.Literals(["passed", "failed", "not-run"] as const);
type TestReportStepStatus = typeof TestReportStepStatus.Type;

export class TestReport extends Schema.Class<TestReport>("TestReport")({
  plan: ExecutedTestPlan,
  summary: Schema.String,
  steps: Schema.Array(TestReportStep),
  screenshotPaths: Schema.Array(Schema.String),
  status: Schema.Literals(["passed", "failed"] as const),
}) {}

export const AgentBrain = Schema.Struct({
  evaluation: Schema.String,
  memory: Schema.String,
  nextGoal: Schema.String,
});
export type AgentBrain = typeof AgentBrain.Type;

export class AgentOutput extends Schema.Class<AgentOutput>("AgentOutput")({
  brain: AgentBrain,
  actions: Schema.Array(Schema.Unknown),
  plan: Schema.Array(Schema.String),
}) {}

export class AgentState extends Schema.Class<AgentState>("AgentState")({
  nSteps: Schema.Number,
  consecutiveFailures: Schema.Number,
  lastResult: Schema.Array(Schema.Unknown),
  lastModelOutput: Schema.optional(Schema.Unknown),
  plan: Schema.Array(Schema.String),
  loopDetector: Schema.Unknown,
  messageManagerState: Schema.Unknown,
}) {}

export class ActionResult extends Schema.Class<ActionResult>("ActionResult")({
  isDone: Schema.Boolean,
  success: Schema.Boolean,
  error: Schema.optional(Schema.String),
  extractedContent: Schema.optional(Schema.String),
  longTermMemory: Schema.optional(Schema.String),
  attachments: Schema.Array(Schema.String),
}) {}

export class AgentHistory extends Schema.Class<AgentHistory>("AgentHistory")({
  modelOutput: Schema.Unknown,
  results: Schema.Array(ActionResult),
  browserState: Schema.Unknown,
  metadata: Schema.Unknown,
}) {}

export class AgentHistoryList extends Schema.Class<AgentHistoryList>("AgentHistoryList")({
  items: Schema.Array(AgentHistory),
}) {
  get urls(): string[] {
    return this.items.flatMap((h) => {
      const url = (h.browserState as { url?: string })?.url;
      return url ? [url] : [];
    });
  }
  get screenshots(): string[] {
    return this.items.flatMap((h) => {
      const ss = (h.browserState as { screenshot?: string })?.screenshot;
      return ss ? [ss] : [];
    });
  }
  get errors(): string[] {
    return this.items.flatMap((h) => h.results.flatMap((r) => (r.error ? [r.error] : [])));
  }
  get actions(): unknown[] {
    return this.items.flatMap((h) => (h.modelOutput as { actions?: unknown[] })?.actions ?? []);
  }
  get totalDuration(): number {
    return this.items.reduce(
      (sum, h) => sum + ((h.metadata as { duration?: number })?.duration ?? 0),
      0,
    );
  }
  get successRate(): number {
    if (this.items.length === 0) return 0;
    const success = this.items.filter((h) => h.results.every((r) => r.success)).length;
    return success / this.items.length;
  }
}

export const CookieParam = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  expires: Schema.optional(Schema.Number),
  httpOnly: Schema.optional(Schema.Boolean),
  secure: Schema.optional(Schema.Boolean),
  sameSite: Schema.optional(Schema.Literals(["Strict", "Lax", "None"] as const)),
});
export type CookieParam = typeof CookieParam.Type;

export class BrowserConfig extends Schema.Class<BrowserConfig>("BrowserConfig")({
  name: Schema.String,
  channel: Schema.optional(Schema.Literals(["stable", "dev", "canary", "beta"] as const)),
  headless: Schema.Boolean,
  viewport: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  userAgent: Schema.optional(Schema.String),
  stealth: Schema.optional(Schema.Boolean),
  locale: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
  ignoreHTTPSErrors: Schema.optional(Schema.Boolean),
  navigationTimeout: Schema.optional(Schema.Number),
  actionTimeout: Schema.optional(Schema.Number),
  defaultTimeout: Schema.optional(Schema.Number),
  backend: Schema.optional(Schema.Literals(["chromium", "lightpanda", "webkit"] as const)),
  colorScheme: Schema.optional(Schema.Literals(["light", "dark", "no-preference"] as const)),
  proxy: Schema.optional(
    Schema.Struct({
      server: Schema.String,
      bypass: Schema.optional(Schema.String),
      username: Schema.optional(Schema.String),
      password: Schema.optional(Schema.String),
    }),
  ),
  executablePath: Schema.optional(Schema.String),
  extensions: Schema.optional(Schema.Array(Schema.String)),
  deviceScaleFactor: Schema.optional(Schema.Number),
  hasTouch: Schema.optional(Schema.Boolean),
  isMobile: Schema.optional(Schema.Boolean),
  args: Schema.optional(Schema.Array(Schema.String)),
  geolocation: Schema.optional(
    Schema.Struct({
      latitude: Schema.Number,
      longitude: Schema.Number,
      accuracy: Schema.optional(Schema.Number),
    }),
  ),
  permissions: Schema.optional(Schema.Array(Schema.String)),
  disableCORS: Schema.optional(Schema.Boolean),
  disableCSP: Schema.optional(Schema.Boolean),
  deterministicRendering: Schema.optional(Schema.Boolean),
  disableSandbox: Schema.optional(Schema.Boolean),
  userDataDir: Schema.optional(Schema.String),
  cdpEndpoint: Schema.optional(Schema.String),
  downloadsPath: Schema.optional(Schema.String),
  maxDownloadSize: Schema.optional(Schema.Number),
  chromiumPoliciesPath: Schema.optional(Schema.String),
  extraHTTPHeaders: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  initScripts: Schema.optional(Schema.Array(Schema.String)),
  recordVideo: Schema.optional(Schema.Boolean),
  recordHar: Schema.optional(Schema.Boolean),
  reducedMotion: Schema.optional(Schema.Literals(["reduce", "no-preference"] as const)),
  cookies: Schema.optional(Schema.Array(CookieParam)),
  storageStatePath: Schema.optional(Schema.String),
  slowMo: Schema.optional(Schema.Number),
  includedDomAttributes: Schema.optional(Schema.Array(Schema.String)),
  clickableTextLengthLimit: Schema.optional(Schema.Number),
}) {}

export class DeviceConfig extends Schema.Class<DeviceConfig>("DeviceConfig")({
  name: Schema.String,
  viewport: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  userAgent: Schema.String,
  deviceScaleFactor: Schema.Number,
  isMobile: Schema.Boolean,
}) {}

export const MCPToolDefinition = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  inputSchema: Schema.Record(Schema.String, Schema.Unknown),
});
export type MCPToolDefinition = typeof MCPToolDefinition.Type;

export class WorkingTree extends Schema.TaggedClass<WorkingTree>()("WorkingTree", {}) {
  get displayName(): string {
    return "working tree";
  }
}

export class Branch extends Schema.TaggedClass<Branch>()("Branch", {
  branchName: Schema.String,
  base: Schema.String,
}) {
  get displayName(): string {
    return this.branchName;
  }
}

export class Commit extends Schema.TaggedClass<Commit>()("Commit", {
  hash: Schema.String,
  shortHash: Schema.String,
  subject: Schema.String,
}) {
  get displayName(): string {
    return this.shortHash;
  }
}

export class PullRequest extends Schema.TaggedClass<PullRequest>()("PullRequest", {
  number: Schema.Number,
  branchName: Schema.String,
  base: Schema.String,
}) {
  get displayName(): string {
    return `#${this.number}`;
  }
}

export const GitScope = Schema.Union([WorkingTree, Branch, Commit, PullRequest]);
export type GitScope = Schema.Schema.Type<typeof GitScope>;

// ─────────────────────────────────────────────────────────────────────────────
// Task 105: AgentProvider as Schema.Literals
// ─────────────────────────────────────────────────────────────────────────────

export const AgentProvider = Schema.Literals([
  "claude",
  "codex",
  "copilot",
  "gemini",
  "cursor",
  "opencode",
  "droid",
] as const);
export type AgentProvider = typeof AgentProvider.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Task 118: BranchFilter in shared models
// ─────────────────────────────────────────────────────────────────────────────

export const BranchFilter = Schema.Literals([
  "recent",
  "all",
  "open",
  "draft",
  "merged",
  "no-pr",
] as const);
export type BranchFilter = typeof BranchFilter.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Task 119: TestPlanDraft with update() method
// ─────────────────────────────────────────────────────────────────────────────

export class TestPlanDraft extends Schema.Class<TestPlanDraft>("TestPlanDraft")({
  instruction: Schema.String,
  changesFor: GitScope,
  baseUrl: Schema.optional(Schema.String),
  isHeadless: Schema.Boolean,
  requiresCookies: Schema.Boolean,
  fileStats: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      added: Schema.Number,
      removed: Schema.Number,
    }),
  ),
  diff: Schema.String,
}) {
  update(fields: Partial<TestPlanDraft>): TestPlanDraft {
    return new TestPlanDraft({ ...this, ...fields });
  }
  get displayName(): string {
    return this.instruction.slice(0, 60);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 22: ChangesFor displayName getter (Task 112)
// ─────────────────────────────────────────────────────────────────────────────

export function gitScopeDisplayName(scope: GitScope): string {
  const tagged = scope as {
    _tag: string;
    branchName?: string;
    shortHash?: string;
    number?: number;
  };
  switch (tagged._tag) {
    case "WorkingTree":
      return "working tree";
    case "Branch":
      return tagged.branchName ?? "branch";
    case "Commit":
      return tagged.shortHash ?? "commit";
    case "PullRequest":
      return `#${tagged.number ?? 0}`;
    default:
      return "unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 402-412: Diff analysis types
// ─────────────────────────────────────────────────────────────────────────────

export interface LineRange {
  start: number;
  end: number;
}

export class DiffHunk extends Schema.Class<DiffHunk>("DiffHunk")({
  filePath: Schema.String,
  addedLines: Schema.optional(Schema.Number),
  removedLines: Schema.optional(Schema.Number),
  content: Schema.optional(Schema.String),
  diffContent: Schema.optional(Schema.String),
  changeType: Schema.optional(
    Schema.Literals(["added", "deleted", "modified", "renamed"] as const),
  ),
  lineRanges: Schema.optional(
    Schema.Array(Schema.Struct({ start: Schema.Number, end: Schema.Number })),
  ),
  affectedIdentifiers: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class ImpactedArea extends Schema.Class<ImpactedArea>("ImpactedArea")({
  type: Schema.Literals(["component", "page", "api", "style", "config", "navigation"] as const),
  name: Schema.String,
  files: Schema.Array(Schema.String),
  risk: Schema.optional(Schema.Literals(["low", "medium", "high", "critical"] as const)),
  priority: Schema.optional(Schema.Literals(["low", "medium", "high", "critical"] as const)),
  priorityNum: Schema.optional(Schema.Number),
  changeDescription: Schema.String,
  testFocus: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class DiffTestStep extends Schema.Class<DiffTestStep>("DiffTestStep")({
  id: Schema.String,
  index: Schema.Number,
  description: Schema.String,
  type: Schema.Literals(["navigate", "interact", "verify", "extract", "wait"] as const),
  assertion: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
  targetArea: Schema.optional(Schema.String),
}) {}

export const DiffCategories = Schema.Struct({
  pages: Schema.Array(Schema.String),
  components: Schema.Array(Schema.String),
  apiRoutes: Schema.Array(Schema.String),
  styles: Schema.Array(Schema.String),
  config: Schema.Array(Schema.String),
  tests: Schema.optional(Schema.Array(Schema.String)),
  other: Schema.optional(Schema.Array(Schema.String)),
});
export type DiffCategories = typeof DiffCategories.Type;

export class DiffAnalysisResult extends Schema.Class<DiffAnalysisResult>("DiffAnalysisResult")({
  hunks: Schema.Array(DiffHunk),
  impactedAreas: Schema.Array(ImpactedArea),
  riskLevel: Schema.Literals(["low", "medium", "high", "critical"] as const),
  confidence: Schema.Number,
  categories: DiffCategories,
  summary: Schema.String,
}) {}

export class DiffTestPlan extends Schema.Class<DiffTestPlan>("DiffTestPlan")({
  id: Schema.String,
  gitScope: Schema.String,
  generatedAt: Schema.Number,
  analysis: DiffAnalysisResult,
  steps: Schema.Array(DiffTestStep),
  rationale: Schema.String,
}) {}

export class DashboardRunState extends Schema.Class<DashboardRunState>("DashboardRunState")({
  runId: Schema.String,
  testName: Schema.String,
  device: Schema.String,
  browser: Schema.String,
  agent: Schema.String,
  status: Schema.Literals(["queued", "running", "completed", "failed", "cancelled"] as const),
  phase: Schema.Literals(["planning", "executing", "verifying", "done"] as const),
  currentStep: Schema.Number,
  totalSteps: Schema.Number,
  steps: Schema.optional(
    Schema.Array(
      Schema.Struct({
        index: Schema.Number,
        description: Schema.String,
        status: Schema.String,
        duration: Schema.optional(Schema.Number),
        toolCall: Schema.optional(Schema.String),
      }),
    ),
  ),
  logs: Schema.optional(
    Schema.Array(
      Schema.Struct({
        timestamp: Schema.Number,
        level: Schema.String,
        message: Schema.String,
      }),
    ),
  ),
  tokenCount: Schema.Number,
  elapsed: Schema.Number,
  screenshot: Schema.optional(Schema.String),
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  agentActivity: Schema.optional(
    Schema.Struct({
      type: Schema.Literals([
        "navigating",
        "clicking",
        "typing",
        "scrolling",
        "waiting",
        "thinking",
        "verifying",
        "capturing",
      ] as const),
      target: Schema.optional(Schema.String),
      description: Schema.String,
      timestamp: Schema.Number,
    }),
  ),
}) {}

export class DashboardSnapshot extends Schema.Class<DashboardSnapshot>("DashboardSnapshot")({
  runs: Schema.Array(DashboardRunState),
  summary: Schema.Struct({
    totalRuns: Schema.Number,
    completed: Schema.Number,
    passed: Schema.Number,
    failed: Schema.Number,
    running: Schema.Number,
    queued: Schema.Number,
    elapsed: Schema.Number,
  }),
  flakiness: Schema.optional(Schema.Unknown),
}) {}
