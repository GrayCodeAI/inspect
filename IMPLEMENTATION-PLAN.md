# Inspect: Comprehensive Implementation Plan

## Executive Summary

Inspect already has a **substantial codebase** (~40,000+ lines across 36 packages) with working implementations of git diff analysis, adversarial testing, recovery management, multi-LLM routing, browser automation, accessibility auditing, visual regression, session recording, and more. The gap is **not in features** — it's in **architecture quality, Effect-TS adoption, and the agent loop that connects everything**.

The existing codebase uses plain TypeScript classes with `async/await`. Only `@inspect/cookies` uses Effect-TS patterns (`ServiceMap.Service`, `Schema`, `Layer`). Everything else needs migration or replacement.

---

## Part 1: What Exists vs What's Missing

### EXISTING — Already Implemented (Keep & Migrate)

| Package                       | What It Does                                                                                                                                                                                                                                                       | Completeness                   | Lines    | Gap                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `@inspect/shared`             | Type definitions (23 files: AgentConfig, TestStep, DiffTestPlan, A11yReport, etc.)                                                                                                                                                                                 | **Complete**                   | ~1,900   | Pure TS interfaces — need Effect Schema                                                                           |
| `@inspect/orchestrator`       | TestExecutor (4-phase lifecycle), RecoveryManager (10 failure types, 12 strategies), LoopDetector, ContextCompactor, CheckpointManager, SpeculativePlanner, AgentGraph (DAG multi-agent), Scheduler, DashboardOrchestrator                                         | **Complete** (simulation-mode) | ~6,500   | Plain classes, no Effect-TS. `generatePlan()` and `runStep()` are placeholders that need real browser integration |
| `@inspect/browser`            | Playwright integration, ARIA snapshot capture, DOM capture (hybrid ARIA+DOM), iframe traversal, shadow DOM resolution, DOM diffing, session recording, HAR capture, vision detection, network monitoring, CDP discovery, mobile (iOS), cloud providers, MCP server | **Complete**                   | ~5,000+  | Extensive but uses plain async/await. No Effect-TS                                                                |
| `@inspect/cookies`            | Cookie extraction from Chrome/Firefox/Safari profiles via CDP + SQLite + binary parsing                                                                                                                                                                            | **Complete**                   | ~600     | **Only package using Effect-TS** — this is the template                                                           |
| `@inspect/llm`                | LLM providers (Claude, OpenAI, Gemini, DeepSeek, Ollama), AgentRouter with fallback chains, FallbackManager, RateLimiter                                                                                                                                           | **Complete**                   | ~2,000   | Plain classes. Good provider abstraction but not Effect-TS                                                        |
| `@inspect/agent`              | ACP client (SSE streaming), AgentGraph (DAG orchestration), PromptBuilder (4 scope strategies, specialist modes), Adversarial prompts (20+ fuzz payloads), TOTP generator (RFC 6238), OTP email polling                                                            | **Complete**                   | ~2,100   | Plain classes. Facade re-exporting other packages                                                                 |
| `@inspect/agent-tools`        | ToolRegistry (10 built-in tools), ToolValidator, NLAssert, JudgeLLM, TokenTracker, SensitiveDataMasker, CustomTools                                                                                                                                                | **Complete**                   | ~1,500   | Plain classes                                                                                                     |
| `@inspect/agent-memory`       | Short-term memory, long-term memory, context compaction, MessageCompactor, PatternStore                                                                                                                                                                            | **Complete**                   | ~800     | Plain classes                                                                                                     |
| `@inspect/agent-governance`   | AuditTrail, AutonomyManager, PermissionManager                                                                                                                                                                                                                     | **Complete**                   | ~500     | Plain classes                                                                                                     |
| `@inspect/agent-watchdogs`    | Background event handlers                                                                                                                                                                                                                                          | **Complete**                   | ~400     | Plain classes                                                                                                     |
| `@inspect/git`                | Git operations (diff, status, branch), context extraction, code fingerprinting                                                                                                                                                                                     | **Complete**                   | ~400     | Plain classes                                                                                                     |
| `@inspect/session`            | rrweb recording, video export, replay viewer HTML generation                                                                                                                                                                                                       | **Complete**                   | ~600     | Plain classes                                                                                                     |
| `@inspect/visual`             | Screenshot diffing, masking, approval workflows, Storybook integration, viewports                                                                                                                                                                                  | **Complete**                   | ~800     | Plain classes                                                                                                     |
| `@inspect/reporter`           | Markdown/HTML/JSON/GitHub Actions reports, PR comments, visual analysis                                                                                                                                                                                            | **Complete**                   | ~1,200   | Plain classes                                                                                                     |
| `@inspect/observability`      | Structured logging, metrics, tracing, cost tracking, analytics, desktop notifications                                                                                                                                                                              | **Complete**                   | ~1,200   | Plain classes                                                                                                     |
| `@inspect/a11y`               | axe-core wrapper, accessibility rules, sitemap scanning                                                                                                                                                                                                            | **Partial**                    | ~500     | Wraps axe-core but no custom rule engine                                                                          |
| `@inspect/lighthouse-quality` | Lighthouse audit execution, performance budgets, historical tracking                                                                                                                                                                                               | **Partial**                    | ~400     | Wraps Lighthouse but no custom audit pipeline                                                                     |
| `@inspect/quality`            | Quality scoring                                                                                                                                                                                                                                                    | **Scaffold**                   | ~50      | Empty                                                                                                             |
| `@inspect/enterprise`         | Hybrid routing, RBAC, SSO, tenant management                                                                                                                                                                                                                       | **Partial**                    | ~600     | Basic implementation                                                                                              |
| `@inspect/credentials`        | OTP providers, vault management                                                                                                                                                                                                                                    | **Complete**                   | ~400     | Plain classes                                                                                                     |
| `@inspect/devices`            | Device presets, emulation configs                                                                                                                                                                                                                                  | **Complete**                   | ~200     | Data-only                                                                                                         |
| `@inspect/data`               | Crawler, extractors, parsers, storage, tracking                                                                                                                                                                                                                    | **Complete**                   | ~800     | Plain classes                                                                                                     |
| `@inspect/network`            | Proxy, security, stealth, tunnel                                                                                                                                                                                                                                   | **Complete**                   | ~600     | Plain classes                                                                                                     |
| `@inspect/mocking`            | Mock handlers                                                                                                                                                                                                                                                      | **Complete**                   | ~300     | Plain classes                                                                                                     |
| `@inspect/chaos`              | Chaos testing                                                                                                                                                                                                                                                      | **Complete**                   | ~300     | Plain classes                                                                                                     |
| `@inspect/security-scanner`   | Security scanning                                                                                                                                                                                                                                                  | **Complete**                   | ~400     | Plain classes                                                                                                     |
| `@inspect/resilience`         | Resilience patterns                                                                                                                                                                                                                                                | **Complete**                   | ~300     | Plain classes                                                                                                     |
| `@inspect/services`           | Service bus, gateway, registry                                                                                                                                                                                                                                     | **Complete**                   | ~600     | Plain classes                                                                                                     |
| `@inspect/workflow`           | Workflow blocks, engine, copilot                                                                                                                                                                                                                                   | **Complete**                   | ~800     | Plain classes                                                                                                     |
| `@inspect/mcp`                | MCP server                                                                                                                                                                                                                                                         | **Complete**                   | ~300     | Plain classes                                                                                                     |
| `@inspect/api`                | HTTP API with routes, streaming, webhooks                                                                                                                                                                                                                          | **Complete**                   | ~800     | Plain classes                                                                                                     |
| `@inspect/sdk`                | TypeScript + Python SDKs                                                                                                                                                                                                                                           | **Partial**                    | ~400     | Basic SDK                                                                                                         |
| `@inspect/video`              | Video compositions, scenes                                                                                                                                                                                                                                         | **Complete**                   | ~300     | Plain classes                                                                                                     |
| `@inspect/cli-context`        | CLI command context                                                                                                                                                                                                                                                | **Complete**                   | ~100     | Plain classes                                                                                                     |
| `@inspect/core`               | Core utilities                                                                                                                                                                                                                                                     | **Scaffold**                   | ~50      | Empty                                                                                                             |
| `@inspect/expect-skill`       | Agent skill (SKILL.md)                                                                                                                                                                                                                                             | **Complete**                   | ~88      | Markdown only                                                                                                     |
| `apps/cli`                    | 30+ commands, 30+ agents, Ink TUI, progress bars, themes, telemetry                                                                                                                                                                                                | **Complete**                   | ~15,000+ | Massive but plain TS                                                                                              |

### MISSING — What Needs to Be Built

| Component                                    | Why It's Missing                                                                                                                                                                                                                                                             | Priority |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Effect-TS Service Architecture**           | Only `@inspect/cookies` uses Effect-TS. All 35 other packages use plain classes with `async/await`. No `ServiceMap.Service`, no `Schema`, no `Layer` composition anywhere except cookies.                                                                                    | **P0**   |
| **Real Agent Loop (Observe → Think → Act)**  | `TestExecutor.execute()` has a 4-phase loop but it's simulation-mode. The `generatePlan()` returns a hardcoded 6-step plan. `runStep()` logs "simulation mode" warnings. No real LLM-driven step-by-step agent loop exists.                                                  | **P0**   |
| **Diff → LLM → Test Plan Pipeline**          | `DiffPlanGenerator` exists and parses diffs well (535 lines), but it uses **heuristic regex matching** — not LLM-enhanced analysis. It detects components/pages/APIs via file path patterns, not semantic understanding. No LLM integration for richer test plan generation. | **P0**   |
| **Vision-First Page Understanding**          | `@inspect/browser` has `vision/` (screenshot, detector, annotated-screenshot) but no fusion of screenshot + DOM for LLM decisions. No bounding box overlays on screenshots. No coordinate-based grounding.                                                                   | **P1**   |
| **Multi-Tree DOM Collection**                | `@inspect/browser/dom` has capture, hybrid, frames, shadow-resolver, dom-diff — but only uses ARIA snapshots + basic DOM. No parallel DOM + Snapshot + Accessibility tree collection like browser-use.                                                                       | **P1**   |
| **Dynamic Action Union for LLM**             | `ToolRegistry` has 10 built-in tools with JSON Schema params. But it's static — no dynamic union building, no domain filtering, no `terminatesSequence` flag, no special parameter injection.                                                                                | **P1**   |
| **Structured LLM Thinking (AgentBrain)**     | Current prompts are simple strings. No structured thinking model (`evaluation_previous_goal`, `memory`, `next_goal`). No message compaction based on token thresholds. No freeze mask for prompt caching.                                                                    | **P1**   |
| **Observation/Memory System with Retention** | `@inspect/agent-memory` has short-term/long-term memory but no typed observations with retention policies (`dedupe`, `limit`), no freeze mask for prompt caching, no trajectory recording.                                                                                   | **P1**   |
| **Composable Evaluator System**              | No evaluator framework. Test results are `pass/fail` strings. No composable evaluators (string_match, url_match, program_html, page_image_query) like OpAgent.                                                                                                               | **P2**   |
| **Log-Normal Scoring Engine**                | `@inspect/quality` is empty scaffold. No scoring engine, no category weighting, no log-normal distribution scoring like Lighthouse.                                                                                                                                          | **P2**   |
| **Two-Phase Stability Detection**            | No network stability monitoring (filter analytics/ads/WebSockets, wait for 500ms idle). No visual stability detection (pixel diff with sharp, 3 consecutive stable frames).                                                                                                  | **P2**   |
| **Tab Activity Tracking**                    | No multi-tab management with activity polling. No auto-switching to most recently active tab.                                                                                                                                                                                | **P2**   |
| **Fallback Execution Strategies**            | `RecoveryManager` has 12 strategies but they're simulation-mode no-ops. No real Playwright API → JS elementFromPoint → direct JS value fallback chains.                                                                                                                      | **P2**   |
| **CI Mode**                                  | No headless execution with exit codes, JUnit/XML output, artifact upload, flaky test retry.                                                                                                                                                                                  | **P2**   |
| **TUI State Flow**                           | CLI renders orchestrator state but the IPC mechanism, live view, and plan review/approval flow are undefined.                                                                                                                                                                | **P2**   |

---

## Part 2: Gap Analysis — Inspect vs OSS Reference

### Agent Loop

| Feature                        | browser-use (85k★)             | Magnitude (4k★)           | Inspect                      | Gap                                  |
| ------------------------------ | ------------------------------ | ------------------------- | ---------------------------- | ------------------------------------ |
| Step loop (observe→think→act)  | ✅ 4-phase with spans          | ✅ `_act()` with memory   | ❌ Simulation-mode only      | **Build real loop**                  |
| AgentBrain structured thinking | ✅ evaluation/memory/next_goal | ❌                        | ❌                           | **Add structured thinking**          |
| Message compaction             | ✅ LLM-based summarization     | ❌                        | ✅ ContextCompactor (basic)  | **Enhance with LLM compaction**      |
| Freeze mask for prompt caching | ❌                             | ✅ Prompt caching support | ❌                           | **Add freeze mask**                  |
| Observation retention policies | ❌                             | ✅ dedupe/limit per type  | ❌                           | **Add retention policies**           |
| Action history feedback        | ✅ Full history in prompt      | ✅ Memory log             | ❌                           | **Add action history**               |
| Loop detection                 | ✅ Hash + fingerprint + nudges | ❌                        | ✅ LoopDetector (basic)      | **Enhance with page fingerprinting** |
| Flash mode (token savings)     | ✅ Stripped thinking fields    | ❌                        | ❌                           | **Add flash mode**                   |
| Fallback LLM switching         | ✅ Primary → fallback          | ✅ Multi-model routing    | ✅ AgentRouter with fallback | **Already exists!**                  |

### Browser Control

| Feature                       | browser-use                | Magnitude                      | Inspect                     | Gap                           |
| ----------------------------- | -------------------------- | ------------------------------ | --------------------------- | ----------------------------- |
| Event bus for actions         | ✅ bubus EventBus          | ❌                             | ❌                          | **Add PubSub events**         |
| Two-phase stability detection | ❌                         | ✅ Network + visual            | ❌                          | **Build stability detector**  |
| Tab activity tracking         | ❌                         | ✅ `__tabActivityTime` polling | ❌                          | **Build tab manager**         |
| Browser provider singleton    | ❌                         | ✅ Hash + reuse                | ❌                          | **Add browser lifecycle**     |
| Cookie injection              | ✅ storageState            | ❌                             | ✅ Cookie extraction exists | **Wire cookies into browser** |
| Multi-browser support         | ✅ Chromium/Firefox/WebKit | ❌                             | ✅ Cross-browser exists     | **Already exists!**           |
| DPR normalization             | ❌                         | ✅ Resize by devicePixelRatio  | ❌                          | **Add DPR normalization**     |
| Coordinate-based grounding    | ❌                         | ✅ Screenshot coordinates      | ❌                          | **Add coordinate clicking**   |

### DOM Understanding

| Feature                       | browser-use                 | Skyvern (21k★)                   | Inspect                    | Gap                             |
| ----------------------------- | --------------------------- | -------------------------------- | -------------------------- | ------------------------------- |
| Multi-tree DOM collection     | ✅ DOM + Snapshot + AX      | ❌                               | ❌ (ARIA only)             | **Build multi-tree collection** |
| Unique ID injection           | ❌                          | ✅ `unique_id` on elements       | ❌                         | **Add element tagging**         |
| HTML-serialized DOM           | ✅ Compact text format      | ✅ `json_to_html()`              | ❌ (raw ARIA)              | **Build DOM serializer**        |
| Interactive element detection | ✅ ClickableElementDetector | ✅ `isInteractable()` 200+ lines | ❌                         | **Build element detector**      |
| Bounding box overlays         | ❌                          | ✅ Draw boxes on screenshots     | ✅ annotated-screenshot.ts | **Already exists!**             |
| Reserved attributes filtering | ❌                          | ✅ 25 meaningful attrs only      | ❌                         | **Add attribute filtering**     |
| Vision-first understanding    | ❌                          | ✅ Screenshot + DOM fusion       | ❌                         | **Build visual grounding**      |

### Accessibility + Performance

| Feature                      | axe-core (13k★)             | Lighthouse (28k★)             | Inspect | Gap                          |
| ---------------------------- | --------------------------- | ----------------------------- | ------- | ---------------------------- |
| Rule/Check three-tier model  | ✅ any/all/none composition | ❌                            | ❌      | **Build rule engine**        |
| VirtualNode over Locator     | ✅ Cached DOM wrapper       | ❌                            | ❌      | **Build VirtualNode**        |
| Impact aggregation           | ✅ Monoid with max          | ❌                            | ❌      | **Add impact system**        |
| Message templates            | ✅ doT.js with data binding | ❌                            | ❌      | **Add fix guidance**         |
| Standards data object        | ✅ ARIA/HTML/CSS data       | ❌                            | ❌      | **Add standards data**       |
| Gatherer lifecycle (5-phase) | ❌                          | ✅ start/stop instrumentation | ❌      | **Build gatherer lifecycle** |
| Computed artifact caching    | ❌                          | ✅ Memoized by input          | ❌      | **Add caching layer**        |
| CLS session grouping         | ❌                          | ✅ 1000ms gap / 5000ms limit  | ❌      | **Port CLS algorithm**       |
| INP via 98th percentile      | ❌                          | ✅ Nearest-rank method        | ❌      | **Port INP calculation**     |
| LoAF detection               | ❌                          | ✅ Filter LongAnimationFrame  | ❌      | **Add LoAF tracking**        |
| Log-normal scoring           | ❌                          | ✅ p10/median parameterized   | ❌      | **Build scoring engine**     |

### Session Recording

| Feature                       | rrweb (20k★)                 | Inspect             | Gap                         |
| ----------------------------- | ---------------------------- | ------------------- | --------------------------- |
| MutationBuffer                | ✅ Buffer + dedup + ordering | ❌                  | **Build mutation buffer**   |
| Full snapshot with IDs        | ✅ Recursive serialization   | ❌                  | **Build snapshot system**   |
| Mirror (bidirectional ID map) | ✅ id↔node mapping           | ❌                  | **Build mirror**            |
| Freeze/lock mechanism         | ✅ Pause during interactions | ❌                  | **Add freeze/lock**         |
| Checkout system               | ✅ Periodic full snapshots   | ❌                  | **Add checkpointing**       |
| zlib compression              | ✅ fflate + base64           | ❌                  | **Add compression**         |
| Replay player                 | ✅ XState + virtual DOM      | ✅ replay-viewer.ts | **Already exists (basic)!** |

### Evaluation

| Feature                 | OpAgent (166★)                                             | Inspect                | Gap                          |
| ----------------------- | ---------------------------------------------------------- | ---------------------- | ---------------------------- |
| Composable evaluators   | ✅ EvaluatorComb (multiplicative)                          | ❌                     | **Build evaluator system**   |
| Evaluator types         | ✅ string_match, url_match, program_html, page_image_query | ❌                     | **Add evaluator types**      |
| Todo-list tracking      | ✅ Structured task decomposition                           | ❌                     | **Add todo tracker**         |
| Trajectory recording    | ✅ StepInfo with screenshots/actions/errors                | ❌                     | **Add trajectory recording** |
| Domain-specific helpers | ✅ URL-pattern navigation strategies                       | ❌                     | **Add site strategies**      |
| Fallback execution      | ✅ Playwright → JS → direct value                          | ❌                     | **Add fallback chains**      |
| Infinite loop detection | ✅ 30+ steps, 3 identical actions                          | ✅ LoopDetector exists | **Already exists!**          |

---

## Part 3: Detailed Implementation Plan

### Phase 1: Effect-TS Foundation + Real Agent Loop (Weeks 1-4)

#### 1.1 Migrate `@inspect/cookies` Pattern to All Packages

**Goal:** Every package uses Effect-TS patterns. `@inspect/cookies` is the template.

**What to do:**

- Convert all `class` definitions to `ServiceMap.Service` with `make:` property
- Replace all `interface` type definitions with `Schema.Class` or `Schema.Struct`
- Replace all manual `try/catch` with `Effect.try` / `Effect.tryPromise`
- Replace all `catchAll` with `Effect.catchTag("SpecificError", ...)`
- Replace all `Promise` return types with `Effect.Effect<T, E, R>`
- Replace all `null` with `Option` or `undefined`
- Replace all `Effect.mapError` with `Effect.catchTag`
- Replace all `console.log` with `Effect.logInfo` / `Effect.logDebug`

**Packages to migrate (priority order):**

1. `@inspect/orchestrator` — Core execution engine
2. `@inspect/browser` — Browser automation
3. `@inspect/llm` — LLM providers
4. `@inspect/agent-tools` — Tool registry
5. `@inspect/agent-memory` — Memory system
6. `@inspect/agent-governance` — Governance
7. `@inspect/agent-watchdogs` — Watchdogs
8. `@inspect/agent` — Agent facade
9. `@inspect/git` — Git integration
10. `@inspect/session` — Session recording
11. `@inspect/visual` — Visual regression
12. `@inspect/reporter` — Reporting
13. `@inspect/observability` — Logging/metrics
14. `@inspect/shared` — Type definitions → Schema

**Migration pattern (example from cookies):**

```typescript
// BEFORE (plain class)
class BrowserSession {
  constructor(private page: Page) {}
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }
}

// AFTER (Effect-TS)
class BrowserSession extends ServiceMap.Service<BrowserSession>()("@inspect/BrowserSession", {
  make: Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    const navigate = Effect.fn("BrowserSession.navigate")(function* (url: string) {
      yield* Effect.annotateCurrentSpan({ url });
      yield* Effect.tryPromise({
        try: () => page.goto(url),
        catch: (cause) => new NavigationError({ url, cause }),
      });
    });
    return { navigate } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(PlaywrightPage.layer));
}
```

#### 1.2 Build Real Agent Loop

**Current state:** `TestExecutor.execute()` has a 4-phase loop but `generatePlan()` returns hardcoded 6 steps and `runStep()` logs "simulation mode" warnings.

**What to build:**

```
@inspect/agent/src/
├── agent-loop.ts          # Main step loop: observe → think → act → finalize
├── agent-state.ts         # AgentState: steps, failures, plan, loop detector
├── agent-output.ts        # LLM response schema: thinking + actions
├── message-manager.ts     # Prompt construction with context window management
├── prompt-templates.ts    # System prompts, nudge messages, compaction
└── history.ts             # AgentHistory, AgentHistoryList
```

**Key patterns to implement:**

- **Four-phase step loop** (from browser-use `agent/service.py:1021-1344`):
  1. `_prepare_context()` — OBSERVE: Get browser state summary (DOM + screenshot), update action models, create state messages, compact if needed, inject nudges
  2. `_get_next_action()` — THINK: Get messages from manager, call LLM with retry, validate output schema
  3. `_execute_actions()` — ACT: Execute each action via tool registry, collect results
  4. `_post_process()` — FINALIZE: Track downloads, update plan state, record for loop detection, reset failure counters

- **AgentBrain structured thinking** (from browser-use `agent/views.py:380-385`):
  Every LLM call must produce: `evaluation_previous_goal`, `memory`, `next_goal`. This forces the agent to reason, not guess.

- **Flash mode** (from browser-use `agent/service.py:457`): Strip thinking/evaluation/next_goal fields, leaving only `memory` and `action`. Reduces token usage significantly.

- **Message compaction** (enhance existing `ContextCompactor`): When context grows past threshold, use LLM to summarize old history. Keep last N steps intact.

- **Action history feedback** (from Skyvern `forge/agent.py:316-722`): Every step receives the full action history so the LLM can detect failures and try alternatives.

**Effect patterns:**

- `ServiceMap.Service` for `AgentLoop`, `MessageManager`, `PromptBuilder`
- `Schema.Class` for `AgentState`, `AgentOutput`, `AgentBrain`, `AgentHistory`
- `Effect.fn` with descriptive spans for every phase
- `PubSub.unbounded<AgentEvent>()` for step lifecycle events

#### 1.3 Wire Real Browser Integration

**Current state:** `TestExecutor` accepts `ExecutorDependencies` with `planGenerator` and `stepExecutor` callbacks. Real implementations are injected from outside.

**What to do:**

- Create `createExecutorAdapters()` function that wires `@inspect/browser` into `TestExecutor`
- Connect `@inspect/cookies` cookie extraction to browser context creation
- Connect `@inspect/session` recording to test execution lifecycle
- Connect `@inspect/llm` router to agent loop for plan generation and step execution
- Remove simulation-mode fallbacks

**Key files to modify:**

- `packages/orchestrator/src/orchestrator/executor.ts` — Add real `planGenerator` and `stepExecutor`
- `packages/orchestrator/src/orchestrator/recovery.ts` — Wire real recovery executors from browser
- `apps/cli/src/commands/test.ts` — Wire everything together

---

### Phase 2: Diff-Aware LLM Test Plans (Weeks 5-6)

#### 2.1 Enhance DiffPlanGenerator with LLM

**Current state:** `DiffPlanGenerator` (535 lines) uses heuristic regex matching to parse diffs. It detects components/pages/APIs via file path patterns (`/components/`, `/pages/`, `/api/`). It generates test steps by matching keywords in diff content (`form`, `input`, `navigate`, `fetch`).

**What to add:**

```
@inspect/orchestrator/src/testing/
├── diff-plan-llm.ts       # LLM-enhanced diff analysis
├── diff-ast-parser.ts     # AST-based diff parsing (not regex)
└── plan-optimizer.ts      # Deduplicate and prioritize test steps
```

**Key improvements:**

- **AST-based diff parsing** (not regex): Use TypeScript compiler API to parse changed files and extract actual component/function/route definitions. Current regex (`/(?:function|const|class)\s+([A-Z]\w+)/`) misses arrow functions, HOCs, and complex patterns.

- **LLM-enhanced analysis**: Send the diff + AST analysis to LLM for richer understanding. The LLM should identify:
  - What user-facing behaviors changed
  - What edge cases the changes introduce
  - What existing functionality might regress

- **Adversarial angle generation**: For each impacted area, generate adversarial test angles (empty inputs, boundary values, race conditions) using the existing `AdversarialExecutor` (509 lines, already excellent).

- **Style matching**: When generating Playwright tests, analyze existing test files in the repo and match their style (selectors, assertions, structure).

**Effect patterns:**

- `ServiceMap.Service` for `DiffAnalyzer`, `PlanGenerator`
- `Schema.Class` for `DiffHunk`, `ImpactedArea`, `DiffTestPlan`, `DiffTestStep`
- `Effect.forEach` with `{ concurrency: 'unbounded' }` for parallel file analysis

---

### Phase 3: Vision + DOM Understanding (Weeks 7-8)

#### 3.1 Multi-Tree DOM Collection

**Current state:** `@inspect/browser/dom` captures ARIA snapshots and basic DOM. No parallel tree collection.

**What to build:**

```
@inspect/browser/src/dom/
├── multi-tree.ts          # Collect DOM + Snapshot + AX trees in parallel
├── element-tree.ts        # EnhancedDOMTreeNode: merged data from all trees
├── serializer.ts          # Convert tree to LLM-friendly text with indexes
├── clickable-detector.ts  # Identify interactive elements
└── element-hash.ts        # SHA-256 hash for element tracking
```

**Key patterns (from browser-use `dom/service.py:376-641`):**

- **Three parallel trees via CDP**: `DOM.getDocument`, `DOMSnapshot.captureSnapshot`, `Accessibility.getFullAXTree` — fire all three in parallel with timeout/retry
- **EnhancedDOMTreeNode**: Each node merges data from all three trees — DOM data (tag, attributes), AX data (role, name, description), Snapshot data (bounds, paint order, computed styles)
- **Visibility detection**: Check CSS display/visibility/opacity AND viewport intersection across all iframe contexts
- **Serialization**: Filter out non-displayable nodes (style, script, SVG decorative), remove elements hidden behind others, remove elements outside viewport, assign numeric `[index]` to clickable elements

#### 3.2 Vision-First Page Understanding

**Current state:** `@inspect/browser/vision` has screenshot capture, detector, and annotated screenshots. No fusion with DOM for LLM decisions.

**What to build:**

```
@inspect/browser/src/vision/
├── screenshot-capture.ts   # DPR-normalized screenshots
├── bounding-box-overlay.ts # Draw element indexes on screenshots
├── coordinate-transform.ts # Map LLM coordinates to Playwright clicks
└── visual-grounding.ts     # Combine screenshot + DOM for LLM context
```

**Key patterns:**

- **DPR normalization** (from Magnitude `web/harness.ts:107-150`): Resize screenshots by `devicePixelRatio` before sending to LLM. Convert coordinates back after LLM returns click positions.
- **Bounding box overlays** (from Skyvern `webeye/scraper/scraper.py:140-414`): Draw numbered boxes around interactable elements on screenshots.
- **Coordinate-based grounding** (from Magnitude): Use screenshot coordinates for clicking instead of CSS selectors.

---

### Phase 4: Accessibility + Performance Auditing (Weeks 9-10)

#### 4.1 Accessibility Rule Engine

**Current state:** `@inspect/a11y` wraps axe-core but has no custom rule engine.

**What to build:**

```
@inspect/a11y/src/
├── rule-engine.ts          # Three-tier Rule → Check → Result model
├── rules/                  # Custom rule definitions as JSON data
├── checks/                 # Custom check evaluate functions
├── virtual-node.ts         # VirtualNode wrapper over Playwright Locator
├── standards.ts            # ARIA roles, attributes, HTML elements data
├── impact.ts               # Impact aggregation (minor → critical)
├── failure-summary.ts      # Human-readable remediation guidance
└── scanner.ts              # Tree-walking DOM scanner
```

**Key patterns (from axe-core):**

- **Three-tier model**: Rules contain Checks. Checks return `true` (pass), `false` (fail), or `undefined` (incomplete). Rules compose checks with `any` (OR), `all` (AND), `none` (NAND) logic.
- **VirtualNode over Locator**: Build a cached wrapper around Playwright's Locator API with lazy property evaluation.
- **Impact aggregation**: Impact levels form a monoid with `max` as combine operation. Use Effect's `Order` module.
- **Message templates with data binding**: Each check has `pass`, `fail`, `incomplete` message templates with `${data.property}` interpolation.

#### 4.2 Performance Audit Pipeline

**Current state:** `@inspect/lighthouse-quality` wraps Lighthouse but has no custom audit pipeline.

**What to build:**

```
@inspect/lighthouse-quality/src/
├── gatherer.ts             # 5-phase gatherer lifecycle
├── computed-artifacts.ts   # Memoized computed artifact system
├── web-vitals.ts           # FCP, LCP, CLS, INP, TTFB collection
├── loaf-tracker.ts         # Long Animation Frame detection
├── trace-processor.ts      # Trace parsing and task tree building
├── network-analysis.ts     # Resource loading analysis
└── scoring.ts              # Log-normal scoring engine
```

**Key patterns (from Lighthouse):**

- **Gatherer lifecycle**: Five phases mapped to Effect's `acquireRelease`
- **Computed artifact caching**: `makeComputedArtifact()` decorator with memoization
- **CLS session grouping**: 1000ms gap / 5000ms limit, return max session score
- **INP via 98th percentile**: Nearest-rank method on EventTiming trace events
- **LoAF detection**: Filter LongAnimationFrame events after FCP
- **Log-normal scoring**: Parameterized by p10 and median control points

---

### Phase 5: Memory + State Management (Week 11)

#### 5.1 Observation/Memory System

**Current state:** `@inspect/agent-memory` has short-term/long-term memory but no typed observations with retention policies.

**What to build:**

```
@inspect/agent-memory/src/
├── observation.ts          # Typed observations with retention policies
├── masking.ts              # Freeze mask for prompt caching
├── trajectory.ts           # Step trajectory recording
└── todo-tracker.ts         # Structured task decomposition with status
```

**Key patterns (from Magnitude):**

- **Observation types**: `connector:web` (screenshot, tab info), `action:taken:click`, `action:result:click`, `thought`
- **Retention policies**: `dedupe` (collapse adjacent identical observations), `limit` (max N observations of a type)
- **Freeze mask**: Previously-rendered observations frozen for prompt caching stability
- **Todo-list tracking** (from OpAgent): Structured task decomposition with `id`, `description`, `status` (pending/in_progress/completed/failed)
- **Trajectory recording** (from OpAgent): Every step captures screenshot, action, URL, errors, model outputs

---

### Phase 6: Quality Scoring + Evaluation (Week 12)

#### 6.1 Composable Evaluator System

**Current state:** `@inspect/quality` is empty scaffold. Test results are `pass/fail` strings.

**What to build:**

```
@inspect/quality/src/
├── evaluator.ts            # Evaluator interface
├── evaluators/
│   ├── string-match.ts     # Text content verification
│   ├── url-match.ts        # URL verification
│   ├── dom-query.ts        # JavaScript DOM extraction
│   ├── visual-match.ts     # Screenshot comparison
│   └── accessibility.ts    # WCAG compliance check
├── combined-evaluator.ts   # Multiplicative composition (all must pass)
├── scoring-engine.ts       # Log-normal scoring with categories
└── report-card.ts          # Overall quality score with breakdown
```

**Key patterns (from OpAgent + Lighthouse):**

- **Composable evaluators**: Independent evaluators composed multiplicatively — all must pass
- **Evaluator types**: `string_match`, `url_match`, `program_html`, `page_image_query`
- **Log-normal scoring**: Parameterized scoring with p10 and median control points
- **Category weighting**: Categories contain weighted audit references

---

### Phase 7: Safety + Reliability (Week 13)

#### 7.1 Enhance Recovery + Loop Detection

**Current state:** `RecoveryManager` (325 lines) has 10 failure types and 12 strategies but recovery executors are simulation-mode no-ops. `LoopDetector` exists but basic.

**What to enhance:**

```
@inspect/agent-governance/src/
├── loop-detector.ts        # Enhance with page fingerprinting
├── retry-policy.ts         # Configurable retry with backoff
├── safety-guards.ts        # Max steps, timeout, resource limits
├── error-classifier.ts     # Enhance error classification
├── nudge-system.ts         # Escalating guidance messages to LLM
└── fallback-chains.ts      # Playwright → JS → direct value fallbacks
```

**Key patterns:**

- **Action loop detection** (enhance existing): Hash normalized actions, track repetition. Add page fingerprint (URL + element count + text hash) for stagnation detection. Escalating nudges at 5, 8, 12 repetitions.
- **Multi-level retry** (from OpAgent): Model API retries (key rotation, exponential backoff), page load retries (10 retries with 10s delays), browser info fetch retries.
- **Fallback execution strategies** (from OpAgent `local_agent_eval.py:1317-1402`): Try Playwright API → JS elementFromPoint → direct JS value setting.
- **Structured error communication** (from browser-use): `BrowserError` carries `short_term_memory` (shown once) and `long_term_memory` (persisted).

---

### Phase 8: Stability + Browser Lifecycle (Week 14)

#### 8.1 Two-Phase Stability Detection

**What to build:**

```
@inspect/browser/src/
├── stability-detector.ts   # Network + visual stability
├── tab-manager.ts          # Multi-tab with activity polling
└── browser-provider.ts     # Singleton with hash + reuse
```

**Key patterns (from Magnitude):**

- **Network stability**: Monitor relevant requests (document, CSS, JS, images, fonts, XHR), filter out analytics/ads/WebSockets. Wait for 500ms of no relevant activity.
- **Visual stability**: Screenshots at 100ms intervals, pixel diff with `sharp`. Require 3 consecutive stable frames below 0.01 difference threshold.
- **Tab activity tracking**: Inject `__tabActivityTime` into each page via `page.evaluate()`. Poll every 200ms. Auto-switch to most recently active tab.
- **Browser provider singleton**: Hash launch options, reuse existing browser instances. Close browser when last context closes.

---

### Phase 9: CI Mode + TUI State Flow (Week 15)

#### 9.1 CI Mode

**What to build:**

```
@inspect/orchestrator/src/
├── ci-mode.ts              # Headless execution with exit codes
└── artifact-upload.ts      # JUnit/XML output, screenshots, replay
```

**Key features:**

- Headless browser configuration
- Exit code semantics (0=pass, 1=fail, 2=partial)
- JUnit/XML report output for CI integration
- Retry flaky tests N times before failing
- Artifact upload (screenshots, replay, logs)

#### 9.2 TUI State Flow

**What to define:**

- How orchestrator publishes state to CLI (PubSub → IPC → Ink TUI)
- Live view mechanism (step progress, browser screenshot streaming)
- Plan review/approval flow in TUI
- Real-time error display with fix guidance

---

## Part 4: Implementation Priority Matrix

| Priority | Component                            | Current State                | Effort        | Impact       | OSS Source                       |
| -------- | ------------------------------------ | ---------------------------- | ------------- | ------------ | -------------------------------- |
| P0       | Effect-TS migration (all packages)   | Only cookies uses Effect-TS  | **Very High** | **Critical** | cookies package (template)       |
| P0       | Real agent loop (observe→think→act)  | Simulation-mode only         | **High**      | **Critical** | browser-use + Magnitude          |
| P0       | Wire real browser integration        | Placeholder implementations  | **Medium**    | **Critical** | Existing browser package         |
| P0       | Diff → LLM → Test Plan pipeline      | Heuristic regex only         | **High**      | **Critical** | Existing DiffPlanGenerator + LLM |
| P1       | Multi-tree DOM collection            | ARIA snapshots only          | **High**      | **High**     | browser-use                      |
| P1       | Vision-first page understanding      | Basic screenshots            | **Medium**    | **High**     | Skyvern + Magnitude              |
| P1       | Structured LLM thinking (AgentBrain) | Simple string prompts        | **Medium**    | **High**     | browser-use                      |
| P1       | Observation/memory with retention    | Basic short/long-term memory | **Medium**    | **High**     | Magnitude                        |
| P1       | Dynamic action union for LLM         | Static tool registry         | **Medium**    | **High**     | browser-use + Magnitude          |
| P2       | Accessibility rule engine            | axe-core wrapper only        | **High**      | **Medium**   | axe-core                         |
| P2       | Performance audit pipeline           | Lighthouse wrapper only      | **High**      | **Medium**   | Lighthouse                       |
| P2       | Composable evaluator system          | None (pass/fail strings)     | **Medium**    | **Medium**   | OpAgent                          |
| P2       | Log-normal scoring engine            | Empty scaffold               | **Medium**    | **Medium**   | Lighthouse                       |
| P2       | Two-phase stability detection        | None                         | **Medium**    | **Medium**   | Magnitude                        |
| P2       | Tab activity tracking                | None                         | **Low**       | **Medium**   | Magnitude                        |
| P2       | Fallback execution strategies        | Simulation-mode no-ops       | **Medium**    | **Medium**   | OpAgent                          |
| P3       | CI mode                              | None                         | **Medium**    | **Low**      | —                                |
| P3       | TUI state flow                       | Undefined                    | **Medium**    | **Low**      | —                                |
| P3       | Session recording enhancements       | Basic rrweb wrapper          | **Low**       | **Low**      | rrweb                            |

---

## Part 5: What NOT to Rebuild

| Component                      | Why Not                                | What to Do Instead                     |
| ------------------------------ | -------------------------------------- | -------------------------------------- |
| rrweb session recording        | Already works via `@inspect/session`   | Use as dependency, don't rebuild       |
| Cookie extraction              | Already complete in `@inspect/cookies` | Wire into browser session              |
| LLM providers                  | Already complete (5 providers)         | Migrate to Effect-TS, don't rebuild    |
| AgentGraph (DAG orchestration) | Already complete (402 lines)           | Migrate to Effect-TS                   |
| AdversarialExecutor            | Already excellent (509 lines)          | Wire into agent loop                   |
| RecoveryManager                | Already good (325 lines)               | Wire real executors, migrate to Effect |
| LoopDetector                   | Already exists                         | Enhance with page fingerprinting       |
| ToolRegistry                   | Already good (373 lines)               | Add dynamic union building             |
| DiffPlanGenerator              | Already good (535 lines)               | Add LLM enhancement                    |
| ACP client                     | Already complete (355 lines)           | Migrate to Effect-TS                   |
| TOTP generator                 | Already complete (192 lines)           | Keep as-is                             |
| Visual diffing                 | Already complete                       | Migrate to Effect-TS                   |
| Reporter                       | Already complete (14 files)            | Migrate to Effect-TS                   |
| Git integration                | Already complete                       | Migrate to Effect-TS                   |
| Observability                  | Already complete                       | Migrate to Effect-TS                   |

---

## Part 6: Success Metrics

| Metric                | Current            | Target                                 | How to Measure                            |
| --------------------- | ------------------ | -------------------------------------- | ----------------------------------------- |
| Effect-TS adoption    | 1/36 packages      | 36/36 packages                         | Count packages using `ServiceMap.Service` |
| Real agent loop       | Simulation-mode    | Full LLM-driven loop                   | Test runs produce real browser actions    |
| Diff-aware test plans | Heuristic regex    | LLM-enhanced AST analysis              | Plan quality score (human review)         |
| Multi-tree DOM        | ARIA only          | DOM + Snapshot + AX                    | Element detection accuracy                |
| Structured thinking   | String prompts     | AgentBrain with evaluation/memory/next | LLM output schema compliance              |
| Accessibility         | axe-core wrapper   | Custom rule engine + axe-core          | WCAG violations caught                    |
| Performance           | Lighthouse wrapper | Custom audit pipeline                  | Web Vitals accuracy                       |
| Stability detection   | None               | Network + visual                       | Flaky test reduction rate                 |
| CI mode               | None               | Headless + exit codes + JUnit          | CI integration tests pass                 |
| Token efficiency      | No optimization    | <$0.50 per test run                    | Token usage tracking                      |

---

## Part 7: Risks and Mitigations

| Risk                                              | Impact     | Mitigation                                                                                  |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Effect-TS migration breaks existing functionality | **High**   | Migrate package-by-package, run `pnpm check` after each, keep simulation-mode as fallback   |
| LLM non-determinism causes flaky tests            | **High**   | Use structured output schemas, retry with backoff, deterministic prompts                    |
| Token costs spiral out of control                 | **Medium** | Prompt caching (freeze mask), context compaction, flash mode, cheaper models for extraction |
| Browser state leaks between tests                 | **Medium** | Fresh context per test, cookie isolation, cleanup finalizers                                |
| DOM changes break element references              | **Medium** | Multi-tree DOM collection, element hashing, fallback locators                               |
| Long test plans exceed context window             | **Medium** | Message compaction, step history summarization, checkpoint system                           |
| Migration timeline slips                          | **Medium** | Prioritize P0 components first, defer P2/P3 to post-MVP                                     |

---

## Part 8: Immediate Next Actions

1. **Define core Effect Schemas** — `TestPlan`, `TestStep`, `TestResult`, `ExecutionEvent`, `AgentState`, `AgentOutput`, `AgentBrain`. Everything else depends on these.
2. **Migrate `@inspect/orchestrator` to Effect-TS** — Start with `TestExecutor`, `RecoveryManager`, `LoopDetector`. These are the core execution engine.
3. **Wire real browser integration** — Connect `@inspect/browser` into `TestExecutor` via `createExecutorAdapters()`. Remove simulation-mode.
4. **Connect cookie extraction** — Wire `@inspect/cookies` into browser context creation so tests run authenticated.
5. **Build real agent loop** — Replace the simulation-mode `generatePlan()` with LLM-driven plan generation using the existing `AgentRouter`.
6. **Enhance DiffPlanGenerator** — Add LLM enhancement to the existing heuristic analysis. Don't rebuild from scratch.
7. **Build multi-tree DOM collection** — Add parallel DOM + Snapshot + AX tree collection to `@inspect/browser/dom`.
8. **Add structured thinking** — Implement AgentBrain pattern in the agent loop prompts.
9. **Build stability detection** — Add network + visual stability to `@inspect/browser`.
10. **Wire everything together** — Connect all packages through Effect-TS Layer composition.

---

## Part 9: OSS Reference Quick Lookup

| Pattern                  | OSS Repo    | Key File(s)                                         | Lines     | Used In Inspect?                     |
| ------------------------ | ----------- | --------------------------------------------------- | --------- | ------------------------------------ |
| Agent step loop          | browser-use | `browser_use/agent/service.py`                      | 1021-1344 | ❌ Need to build                     |
| AgentBrain thinking      | browser-use | `browser_use/agent/views.py`                        | 380-385   | ❌ Need to build                     |
| Action registry          | browser-use | `browser_use/tools/registry/service.py`             | 290-593   | ✅ ToolRegistry exists (enhance)     |
| Multi-tree DOM           | browser-use | `browser_use/dom/service.py`                        | 376-641   | ❌ Need to build                     |
| EnhancedDOMTreeNode      | browser-use | `browser_use/dom/views.py`                          | 372-911   | ❌ Need to build                     |
| DOM serializer           | browser-use | `browser_use/dom/serializer/serializer.py`          | full      | ❌ Need to build                     |
| Event bus                | browser-use | `browser_use/browser/events.py`                     | full      | ❌ Need to build                     |
| Loop detection           | browser-use | `browser_use/agent/views.py`                        | 156-248   | ✅ LoopDetector exists (enhance)     |
| BrowserError with memory | browser-use | `browser_use/browser/views.py`                      | 152-197   | ❌ Need to build                     |
| LLM protocol adapter     | browser-use | `browser_use/llm/base.py`                           | 17-59     | ✅ LLMProvider exists (migrate)      |
| Message compaction       | browser-use | `browser_use/agent/views.py`                        | 34-56     | ✅ ContextCompactor exists (enhance) |
| Agent loop + memory      | Magnitude   | `packages/magnitude-core/src/agent/index.ts`        | 305-417   | ❌ Need to build                     |
| Observation system       | Magnitude   | `packages/magnitude-core/src/memory/agentMemory.ts` | full      | ✅ agent-memory exists (enhance)     |
| Freeze mask              | Magnitude   | `packages/magnitude-core/src/memory/masking.ts`     | full      | ❌ Need to build                     |
| DOM partitioning         | Magnitude   | `packages/magnitude-extract/src/partitioner.ts`     | 94-159    | ❌ Need to build                     |
| Page stability           | Magnitude   | `packages/magnitude-core/src/web/stability.ts`      | 120-341   | ❌ Need to build                     |
| Tab activity tracking    | Magnitude   | `packages/magnitude-core/src/web/tabs.ts`           | 115-203   | ❌ Need to build                     |
| Vision-first scraping    | Skyvern     | `skyvern/webeye/scraper/scraper.py`                 | 140-414   | ❌ Need to build                     |
| DOM interactability      | Skyvern     | `skyvern/webeye/scraper/domUtils.js`                | 847-1058  | ❌ Need to build                     |
| HTML serialization       | Skyvern     | `skyvern/webeye/scraper/scraped_page.py`            | 36-106    | ❌ Need to build                     |
| Task decomposition       | Skyvern     | `skyvern/forge/agent.py`                            | 316-722   | ❌ Need to build                     |
| Incremental DOM scraping | Skyvern     | `skyvern/webeye/scraper/scraper.py`                 | 540-696   | ❌ Need to build                     |
| MutationBuffer           | rrweb       | `packages/rrweb/src/record/mutation.ts`             | 140-860   | ❌ Need to build                     |
| Full snapshot            | rrweb       | `packages/rrweb-snapshot/src/snapshot.ts`           | 922-1237  | ✅ session exists (enhance)          |
| Mirror (ID mapping)      | rrweb       | `packages/rrweb-snapshot/src/utils.ts`              | 180-248   | ❌ Need to build                     |
| Audit base class         | Lighthouse  | `core/audits/audit.js`                              | full      | ❌ Need to build                     |
| Gatherer lifecycle       | Lighthouse  | `core/gather/base-gatherer.js`                      | full      | ❌ Need to build                     |
| CLS session grouping     | Lighthouse  | `core/computed/metrics/cumulative-layout-shift.js`  | 26-149    | ❌ Need to build                     |
| INP calculation          | Lighthouse  | `core/computed/metrics/responsiveness.js`           | full      | ❌ Need to build                     |
| LoAF detection           | Lighthouse  | `core/audits/metrics/max-potential-fid.js`          | 68-112    | ❌ Need to build                     |
| Log-normal scoring       | Lighthouse  | `shared/statistics.js`                              | 49-84     | ❌ Need to build                     |
| Rule/Check model         | axe-core    | `lib/core/base/rule.js`                             | 17-662    | ❌ Need to build                     |
| Check evaluation         | axe-core    | `lib/core/base/check.js`                            | 37-214    | ❌ Need to build                     |
| VirtualNode              | axe-core    | `lib/core/base/virtual-node/virtual-node.js`        | 1-194     | ❌ Need to build                     |
| Flat tree construction   | axe-core    | `lib/core/utils/get-flattened-tree.js`              | 34-179    | ❌ Need to build                     |
| Impact aggregation       | axe-core    | `lib/core/utils/aggregate-checks.js`                | 21-88     | ❌ Need to build                     |
| Composable evaluators    | OpAgent     | `opagent/evaluation_harness/evaluators.py`          | 609-650   | ❌ Need to build                     |
| Todo-list tracking       | OpAgent     | `opagent/local_agent_eval.py`                       | 249-271   | ❌ Need to build                     |
| Action space (25 types)  | OpAgent     | `opagent/browser_env/actions.py`                    | 320-376   | ✅ ToolRegistry exists (enhance)     |
| Infinite loop detection  | OpAgent     | `opagent/local_agent_eval.py`                       | 186-193   | ✅ LoopDetector exists (enhance)     |
| Fallback strategies      | OpAgent     | `opagent/local_agent_eval.py`                       | 1317-1402 | ❌ Need to build                     |
