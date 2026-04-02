# Inspect — Unified Master Plan (Complete Consolidated)

**World-Class Autonomous Browser Testing Infrastructure**

This document consolidates **all content** from 4 sources into a single comprehensive reference:
1. **Strategic Overview** — 12 parts (from original UNIFIED-PLAN.md)
2. **Detailed Task Breakdown** — 1,700+ tasks (from archive/PLAN.md) 
3. **Comprehensive OSS Analysis** — 27 repositories (from archive/OSS-REF-ANALYSIS.md)
4. **Detailed Phase Implementation** — Step-by-step execution guide (from archive/IMPLEMENTATION-PLAN.md)

**Document Status:** Fully consolidated 2026-04-02

---


**World-Class Autonomous Browser Testing Infrastructure**

This is the consolidated master plan combining:
1. Strategic overview and architecture (12 parts)
2. Comprehensive task breakdown (1,700+ tasks from archive/PLAN.md)
3. Detailed OSS analysis (27 repositories)
4. Phase-by-phase implementation guide

**Document Status:** Consolidated 2026-04-02 from 4 source files into single reference

---

---

## Executive Summary

Inspect is a CLI tool that lets coding agents (Claude Code, Codex, Cursor) automatically test code changes in a real browser. The vision: **zero human interaction from `git diff` to test report.**

**Current state:** ~118,000 LOC across 36 packages. Extensive feature coverage (git diff analysis, adversarial testing, multi-LLM routing, browser automation, accessibility, visual regression, session recording). **Gap is not features — it's architecture quality, Effect-TS adoption, and the agent loop that connects everything.** Only `@inspect/cookies` uses Effect-TS. Everything else is plain TypeScript with `async/await` and simulation-mode stubs.

**This plan consolidates three source documents:** the 1,700-task roadmap (PLAN.md), OSS analysis of 27 repositories (OSS-REF-ANALYSIS.md), and the 9-phase implementation strategy (IMPLEMENTATION-PLAN.md).

---

## Part 1: Current State Assessment

### What Exists (Keep & Migrate)

| Package                       | Status          | LOC    | Effect-TS       | What It Does                                                                                                                                                                                                                                                       | Gap                                                                                |
| ----------------------------- | --------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `@inspect/shared`             | Complete        | 5,557  | PARTIAL         | Type definitions (23 files: AgentConfig, TestStep, DiffTestPlan, A11yReport, EventBus, CircuitBreaker, Assertions)                                                                                                                                                 | Pure TS interfaces — need Effect Schema                                            |
| `@inspect/orchestrator`       | Simulation-mode | 8,467  | NONE            | TestExecutor (4-phase lifecycle), RecoveryManager (10 failure types, 12 strategies), LoopDetector, ContextCompactor, CheckpointManager, SpeculativePlanner, AgentGraph (DAG multi-agent), Scheduler, DashboardOrchestrator                                         | Plain classes, no Effect-TS. `generatePlan()` and `runStep()` are placeholders     |
| `@inspect/browser`            | Complete        | 9,442  | NONE            | Playwright integration, ARIA snapshot capture, DOM capture (hybrid ARIA+DOM), iframe traversal, shadow DOM resolution, DOM diffing, session recording, HAR capture, vision detection, network monitoring, CDP discovery, mobile (iOS), cloud providers, MCP server | Extensive but uses plain async/await                                               |
| `@inspect/cookies`            | Complete        | 622    | FULL (template) | Cookie extraction from Chrome/Firefox/Safari profiles via CDP + SQLite + binary parsing                                                                                                                                                                            | **Only package using Effect-TS** — this is the template. Wire into browser session |
| `@inspect/llm`                | Complete        | 3,233  | NONE            | LLM providers (Claude, OpenAI, Gemini, DeepSeek, Ollama), AgentRouter with fallback chains, FallbackManager, RateLimiter                                                                                                                                           | Plain classes. Good provider abstraction                                           |
| `@inspect/agent`              | Complete        | 3,250  | NONE            | ACP client (SSE streaming), AgentGraph (DAG orchestration), PromptBuilder (4 scope strategies, specialist modes), Adversarial prompts (20+ fuzz payloads), TOTP generator (RFC 6238), OTP email polling                                                            | Facade re-exporting other packages                                                 |
| `@inspect/agent-tools`        | Complete        | 2,535  | NONE            | ToolRegistry (10 built-in tools), ToolValidator, NLAssert, JudgeLLM, TokenTracker, SensitiveDataMasker, CustomTools                                                                                                                                                | Plain classes                                                                      |
| `@inspect/agent-memory`       | Complete        | 1,937  | NONE            | Short-term memory, long-term memory, context compaction, MessageCompactor, PatternStore                                                                                                                                                                            | Plain classes                                                                      |
| `@inspect/agent-governance`   | Complete        | 631    | NONE            | AuditTrail, AutonomyManager, PermissionManager                                                                                                                                                                                                                     | Plain classes                                                                      |
| `@inspect/agent-watchdogs`    | Complete        | 1,465  | NONE            | Background event handlers                                                                                                                                                                                                                                          | Plain classes                                                                      |
| `@inspect/git`                | Complete        | 1,107  | NONE            | Git operations (diff, status, branch), context extraction, code fingerprinting                                                                                                                                                                                     | Plain classes                                                                      |
| `@inspect/session`            | Partial         | 191    | PARTIAL         | rrweb recording, video export, replay viewer HTML generation                                                                                                                                                                                                       | Plain classes                                                                      |
| `@inspect/visual`             | Complete        | 1,602  | NONE            | Screenshot diffing, masking, approval workflows, Storybook integration, viewports                                                                                                                                                                                  | Plain classes                                                                      |
| `@inspect/reporter`           | Complete        | 2,707  | NONE            | Markdown/HTML/JSON/GitHub Actions reports, PR comments, visual analysis                                                                                                                                                                                            | Plain classes                                                                      |
| `@inspect/observability`      | Complete        | 2,289  | NONE            | Structured logging, metrics, tracing, cost tracking, analytics, desktop notifications                                                                                                                                                                              | Plain classes                                                                      |
| `@inspect/a11y`               | Partial         | 780    | NONE            | axe-core wrapper, accessibility rules, sitemap scanning                                                                                                                                                                                                            | Wraps axe-core but no custom rule engine                                           |
| `@inspect/lighthouse-quality` | Partial         | 915    | NONE            | Lighthouse audit execution, performance budgets, historical tracking                                                                                                                                                                                               | Wraps Lighthouse but no custom audit pipeline                                      |
| `@inspect/quality`            | Scaffold        | 113    | NONE            | Quality scoring                                                                                                                                                                                                                                                    | Empty                                                                              |
| `@inspect/enterprise`         | Partial         | 761    | NONE            | Hybrid routing, RBAC, SSO, tenant management                                                                                                                                                                                                                       | Basic implementation                                                               |
| `@inspect/credentials`        | Complete        | 2,786  | NONE            | OTP providers, vault management                                                                                                                                                                                                                                    | Plain classes                                                                      |
| `@inspect/devices`            | Complete        | 550    | NONE            | Device presets, emulation configs                                                                                                                                                                                                                                  | Data-only                                                                          |
| `@inspect/data`               | Complete        | 5,106  | NONE            | Crawler, extractors, parsers, storage, tracking                                                                                                                                                                                                                    | Plain classes                                                                      |
| `@inspect/network`            | Complete        | 2,141  | NONE            | Proxy, security, stealth, tunnel                                                                                                                                                                                                                                   | Plain classes                                                                      |
| `@inspect/mocking`            | Complete        | 1,597  | NONE            | Mock handlers                                                                                                                                                                                                                                                      | Plain classes                                                                      |
| `@inspect/chaos`              | Complete        | 787    | NONE            | Chaos testing                                                                                                                                                                                                                                                      | Plain classes                                                                      |
| `@inspect/security-scanner`   | Complete        | 1,147  | NONE            | Security scanning                                                                                                                                                                                                                                                  | Plain classes                                                                      |
| `@inspect/resilience`         | Complete        | 896    | NONE            | Resilience patterns                                                                                                                                                                                                                                                | Plain classes                                                                      |
| `@inspect/services`           | Complete        | 3,730  | NONE            | Service bus, gateway, registry                                                                                                                                                                                                                                     | Plain classes                                                                      |
| `@inspect/workflow`           | Complete        | 6,144  | NONE            | Workflow blocks, engine, copilot                                                                                                                                                                                                                                   | Plain classes                                                                      |
| `@inspect/mcp`                | Scaffold        | 48     | NONE            | MCP server                                                                                                                                                                                                                                                         | Empty                                                                              |
| `@inspect/api`                | Complete        | 4,521  | NONE            | HTTP API with routes, streaming, webhooks                                                                                                                                                                                                                          | Plain classes                                                                      |
| `@inspect/sdk`                | Partial         | 2,748  | NONE            | TypeScript + Python SDKs                                                                                                                                                                                                                                           | Basic SDK                                                                          |
| `@inspect/video`              | Partial         | 119    | NONE            | Video compositions, scenes                                                                                                                                                                                                                                         | Plain classes                                                                      |
| `@inspect/cli-context`        | Complete        | 598    | NONE            | CLI command context                                                                                                                                                                                                                                                | Plain classes                                                                      |
| `@inspect/core`               | Scaffold        | 150    | NONE            | Core utilities                                                                                                                                                                                                                                                     | Barrel file — remove                                                               |
| `@inspect/expect-skill`       | Scaffold        | 0      | NONE            | Agent skill (SKILL.md)                                                                                                                                                                                                                                             | Markdown only                                                                      |
| `apps/cli`                    | Complete        | 37,377 | NONE            | 30+ commands, 30+ agents, Ink TUI, progress bars, themes, telemetry                                                                                                                                                                                                | Massive but plain TS                                                               |

**Total:** ~118,000 LOC across 36 packages + CLI

### What's Missing Entirely

1. Real agent loop (observe → think → act) — currently simulation-mode
2. Effect-TS adoption across 33 of 36 packages
3. Effect Schema for all domain models
4. Multi-tree DOM collection (DOM + Accessibility + Snapshot)
5. Vision-first page understanding
6. Dynamic action union for LLM
7. Structured LLM thinking (AgentBrain)
8. Observation/memory system with retention policies
9. Composable evaluator system
10. Log-normal scoring engine
11. Two-phase stability detection (network + visual)
12. Tab activity tracking
13. Fallback execution strategies
14. CI mode (headless + exit codes + JUnit)
15. TUI state flow definition
16. LLM judge for automated evaluation
17. Parallel execution engine
18. Self-improvement loop
19. Configuration snapshot reproducibility
20. Watchdog parallel monitoring system

---

## Part 2: OSS Analysis — Key Patterns to Adopt

Analysis of 27 open-source repositories reveals mature solutions for agent loops, browser automation, testing infrastructure, and multi-agent orchestration.

### Tier 1: Direct Competitors (AI Browser Agents)

| Repository                 | Stars | Key Innovations                                                                                                                                          |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **browser-use** (Python)   | 78K   | 3-phase step loop, 15+ LLM providers, loop detection with nudges, watchdog system, action caching, dynamic action registry, AgentBrain structured output |
| **Skyvern** (Python)       | 20K   | Vision+DOM fusion with annotated screenshots, speculative planning (30-40% faster), 80+ prompt templates, REST API, self-healing, captcha/2FA handling   |
| **Stagehand** (TypeScript) | 15K   | act/extract/observe SDK, hybrid DOM+A11y snapshot, act caching, self-healing via fresh snapshot, 2-step actions, CDP engine                              |
| **Shortest** (TypeScript)  | 3K    | Natural language tests, test run caching, coordinate-based CUA, zero-config, GitHub Actions integration                                                  |

### Tier 2-5: Infrastructure & Frameworks

| Repository        | Category      | Key Innovations                                                |
| ----------------- | ------------- | -------------------------------------------------------------- |
| Playwright MCP    | Browser       | Accessibility-tree-only mode, MCP protocol                     |
| Steel Browser     | Browser       | Managed sessions, proxy rotation, anti-detection               |
| rrweb             | Recording     | Session replay with DOM mutations, timeline scrubbing          |
| OpenAI Agents SDK | Framework     | Agent-as-tool, handoffs, guardrails, human-in-loop             |
| AutoGen           | Framework     | Multi-agent orchestration, AgentChat, MCP workbench            |
| Langflow          | Workflow      | Visual workflow builder, interactive playground                |
| Lighthouse        | Quality       | 5-phase gatherer lifecycle, log-normal scoring, Web Vitals     |
| Axe-Core          | Accessibility | Rule→Check→Result model, any/all/none composition, VirtualNode |
| OpAgent           | Evaluation    | Composable evaluators, todo-list tracking, fallback chains     |

### 7 Key Patterns to Adopt

```
1. Agent Loop Architecture          Observe → Think → Act → Finalize
                                     AgentBrain: {evaluation, memory, next_goal}

2. Hybrid Context Building          DOM Tree + Accessibility Tree + Screenshot + Network State

3. Speculative Planning             Pre-compute next step while current executes (30-40% faster)

4. Self-Healing                     Failure → Fresh Snapshot → New LLM Call → Retry

5. Action Caching                   hash(instruction + DOM_state) → cached_action

6. Watchdog System                  Parallel Monitors: captcha, popup, crash, download

7. Multi-Agent Orchestration        Agent A → Handoff → Agent B with guardrails
```

### Critical Gaps in Inspect (Priority Order)

| Priority | Gap                        | Current               | Needed                               | OSS Reference              |
| -------- | -------------------------- | --------------------- | ------------------------------------ | -------------------------- |
| **P0**   | Real agent loop            | Simulation-mode       | Observe→Think→Act loop               | browser-use, Skyvern       |
| **P0**   | Vision-first understanding | DOM only              | Screenshot + bounding boxes + DOM    | Skyvern, Stagehand         |
| **P0**   | Effect-TS migration        | 1/36 packages         | 36/36 packages                       | cookies package (template) |
| **P1**   | Speculative planning       | Sequential only       | Parallel next-step pre-computation   | Skyvern                    |
| **P1**   | Action caching             | None                  | Cache by instruction+DOM hash        | browser-use, Stagehand     |
| **P1**   | Self-healing               | Basic retry           | Fresh context + re-plan on failure   | Stagehand                  |
| **P1**   | Watchdog system            | Basic error handling  | Parallel monitors for captcha/popups | browser-use                |
| **P2**   | Natural language API       | Structured plans only | `inspect("Login")` API               | Shortest                   |
| **P2**   | Multi-agent orchestration  | Single agent          | Agent handoffs                       | OpenAI Agents SDK          |

---

## Part 3: Gap Analysis — Inspect vs OSS

### Agent Loop

| Feature                        | browser-use                    | Magnitude                 | Inspect                      | Gap                                  |
| ------------------------------ | ------------------------------ | ------------------------- | ---------------------------- | ------------------------------------ |
| Step loop (observe→think→act)  | ✅ 4-phase with spans          | ✅ `_act()` with memory   | ❌ Simulation-mode           | **Build real loop**                  |
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

| Feature                       | browser-use                 | Skyvern                          | Inspect                    | Gap                             |
| ----------------------------- | --------------------------- | -------------------------------- | -------------------------- | ------------------------------- |
| Multi-tree DOM collection     | ✅ DOM + Snapshot + AX      | ❌                               | ❌ (ARIA only)             | **Build multi-tree collection** |
| Unique ID injection           | ❌                          | ✅ `unique_id` on elements       | ❌                         | **Add element tagging**         |
| HTML-serialized DOM           | ✅ Compact text format      | ✅ `json_to_html()`              | ❌ (raw ARIA)              | **Build DOM serializer**        |
| Interactive element detection | ✅ ClickableElementDetector | ✅ `isInteractable()` 200+ lines | ❌                         | **Build element detector**      |
| Bounding box overlays         | ❌                          | ✅ Draw boxes on screenshots     | ✅ annotated-screenshot.ts | **Already exists!**             |
| Reserved attributes filtering | ❌                          | ✅ 25 meaningful attrs only      | ❌                         | **Add attribute filtering**     |
| Vision-first understanding    | ❌                          | ✅ Screenshot + DOM fusion       | ❌                         | **Build visual grounding**      |

### Accessibility + Performance

| Feature                      | axe-core                    | Lighthouse                    | Inspect | Gap                          |
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

| Feature                       | rrweb                        | Inspect             | Gap                         |
| ----------------------------- | ---------------------------- | ------------------- | --------------------------- |
| MutationBuffer                | ✅ Buffer + dedup + ordering | ❌                  | **Build mutation buffer**   |
| Full snapshot with IDs        | ✅ Recursive serialization   | ❌                  | **Build snapshot system**   |
| Mirror (bidirectional ID map) | ✅ id↔node mapping           | ❌                  | **Build mirror**            |
| Freeze/lock mechanism         | ✅ Pause during interactions | ❌                  | **Add freeze/lock**         |
| Checkout system               | ✅ Periodic full snapshots   | ❌                  | **Add checkpointing**       |
| zlib compression              | ✅ fflate + base64           | ❌                  | **Add compression**         |
| Replay player                 | ✅ XState + virtual DOM      | ✅ replay-viewer.ts | **Already exists (basic)!** |

### Evaluation

| Feature                 | OpAgent                                                    | Inspect                | Gap                          |
| ----------------------- | ---------------------------------------------------------- | ---------------------- | ---------------------------- |
| Composable evaluators   | ✅ EvaluatorComb (multiplicative)                          | ❌                     | **Build evaluator system**   |
| Evaluator types         | ✅ string_match, url_match, program_html, page_image_query | ❌                     | **Add evaluator types**      |
| Todo-list tracking      | ✅ Structured task decomposition                           | ❌                     | **Add todo tracker**         |
| Trajectory recording    | ✅ StepInfo with screenshots/actions/errors                | ❌                     | **Add trajectory recording** |
| Domain-specific helpers | ✅ URL-pattern navigation strategies                       | ❌                     | **Add site strategies**      |
| Fallback execution      | ✅ Playwright → JS → direct value                          | ❌                     | **Add fallback chains**      |
| Infinite loop detection | ✅ 30+ steps, 3 identical actions                          | ✅ LoopDetector exists | **Already exists!**          |

---

## Part 3b: Per-Repository Innovations Detail

### Tier 1: Direct Competitors

**browser-use** (Python, 78K★): 3-phase step loop (prepare_context → get_next_action → execute_actions), 15+ LLM provider support with unified interface, loop detection with action hashing and escalating nudges, watchdog system (parallel monitors for captcha, popups, crashes, downloads), action caching by hash(instruction + DOM state), dynamic action registry with Pydantic models, structured output with AgentBrain (evaluation, memory, next_goal), cloud mode with stealth browsers and proxy rotation, multi-element interaction (click, type, scroll, drag, upload, switch_tab).

**Skyvern** (Python, 20K★, $2.7M): Vision+DOM fusion with annotated screenshots overlaid on HTML, speculative planning (pre-compute next step while current executes, 30-40% faster), 80+ Jinja2 prompt templates for different scenarios, REST API with async job queue, workflow system with nodes and edges, self-healing (re-plan on failure with fresh context), captcha solving integration, 2FA/TOTP handling.

**Stagehand** (TypeScript, $67M, 15K★): act/extract/observe SDK pattern, hybrid DOM+A11y snapshot merging for richer context, act caching by hash(instruction + URL), self-healing via fresh snapshot + new LLM call on failure, 2-step actions for complex interactions (dropdowns), inference vs Playwright modes, CDP engine for optimized low-level browser control, Zod schema validation for structured extraction.

**Shortest** (TypeScript): Natural language tests (`shortest("Login")`), test run caching (cache entire successful runs for replay), coordinate-based CUA (Computer Use API), Claude-powered with vision, zero-config testing, GitHub Actions integration.

### Tier 2: Browser Infrastructure

**Playwright MCP** (Microsoft Official): Accessibility tree only mode (no screenshots = cheap), MCP protocol for tool server communication, structured tool definitions for LLMs, deterministic tool application.

**Steel Browser** (5K★): Managed browser sessions, proxy rotation, anti-detection mechanisms, session persistence across runs, no LLM (pure infrastructure).

**rrweb** (TypeScript, 18K★): Session recording with DOM mutations, replayer with timeline scrubbing, rrweb-snapshot for serialization, incremental snapshots for efficiency, event-based architecture, player UI with controls.

**QA Wolf** (TypeScript): Record browser actions → generate Playwright code, auto-wait for elements, test attribute priority (data-qa), CI workflow generation, video recording per test, parallel test execution.

### Tier 3: Agent Frameworks

**OpenAI Agents SDK** (Python): Agent-as-tool pattern, handoffs between agents, guardrails for safety checks, human-in-the-loop mechanisms, sessions for conversation history, tracing for observability, realtime agents with voice, MCP server support.

**AutoGen** (Microsoft, Python): Multi-agent orchestration, AgentChat for conversation patterns, MCP workbench integration, agent-as-a-tool pattern, streaming responses, console UI for debugging.

**Langflow** (Python, 50K★): Visual workflow builder, source code access for components, interactive playground, multi-agent orchestration, deploy as API/MCP, LangSmith/LangFuse observability.

**E2B** (Python/TypeScript, 15K★): Sandboxed code execution, cloud sandbox infrastructure, code interpreter SDK, secure isolated environments, Terraform deployment.

### Tier 4-5: Specialized Tools

**Anthropic Quickstarts**: Computer Use Demo (desktop control via Claude), Browser Tools API Demo (Playwright-based automation), Autonomous Coding Agent (two-agent pattern: initializer + coding agent), Customer Support Agent (knowledge base integration).

**LaVague** (Python, 10K★): WorldModel → ActionEngine → Driver architecture, RAG-based element targeting with XPath retrieval, two-tier LLM (Vision + Text models), Selenium/Playwright driver abstraction.

**Zerostep**: Lightweight Playwright plugin, remote server for processing, CDP commands returned from server, minimal client footprint.

**GPT Engineer** (Python, 60K★): Natural language code generation, improvement mode for existing code, benchmark system for agents, template-based generation.

**Uffizzi**: Ephemeral environments per PR, Docker Compose support, Kubernetes integration, preview deployments.

---

## Part 4: Architecture & Design

### Effect-TS Service Architecture

Every package uses `ServiceMap.Service` with `make:` property and explicit `static layer`. `@inspect/cookies` is the template.

```typescript
// BEFORE (plain class — what most packages look like now)
class BrowserSession {
  constructor(private page: Page) {}
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }
}

// AFTER (Effect-TS — the target pattern)
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

### Migration Rules

- `class` → `ServiceMap.Service` with `make:` property
- `interface` → `Schema.Class` or `Schema.Struct`
- `try/catch` → `Effect.try` / `Effect.tryPromise`
- `catchAll` → `Effect.catchTag("SpecificError", ...)`
- `Promise<T>` return → `Effect.Effect<T, E, R>`
- `null` → `Option` or `undefined`
- `Effect.mapError` → `Effect.catchTag`
- `console.log` → `Effect.logInfo` / `Effect.logDebug`
- Never use `Effect.Service` or `Context.Tag` — use `ServiceMap.Service`
- Never use `Effect.all` with `.map()` — use `Effect.forEach`
- Never explicitly type Effect return types — let TypeScript infer

### Migration Rules

- `class` → `ServiceMap.Service` with `make:` property
- `interface` → `Schema.Class` or `Schema.Struct`
- `try/catch` → `Effect.try` / `Effect.tryPromise`
- `catchAll` → `Effect.catchTag("SpecificError", ...)`
- `Promise<T>` return → `Effect.Effect<T, E, R>`
- `null` → `Option` or `undefined`
- `Effect.mapError` → `Effect.catchTag`
- `console.log` → `Effect.logInfo` / `Effect.logDebug`
- Never use `Effect.Service` or `Context.Tag` — use `ServiceMap.Service`
- Never use `Effect.all` with `.map()` — use `Effect.forEach`
- Never explicitly type Effect return types — let TypeScript infer

### Real Agent Loop Architecture

```
@inspect/agent/src/
├── agent-loop.ts          # Main step loop: observe → think → act → finalize
├── agent-state.ts         # AgentState: steps, failures, plan, loop detector
├── agent-output.ts        # LLM response schema: thinking + actions
├── message-manager.ts     # Prompt construction with context window management
├── prompt-templates.ts    # System prompts, nudge messages, compaction
└── history.ts             # AgentHistory, AgentHistoryList
```

**Four-phase step loop:**

1. `_prepareContext()` — OBSERVE: Get browser state summary (DOM + screenshot), update action models, compact if needed, inject nudges
2. `_getNextAction()` — THINK: Get messages from manager, call LLM with retry, validate output schema
3. `_executeActions()` — ACT: Execute each action via tool registry, collect results
4. `_postProcess()` — FINALIZE: Track downloads, update plan state, record for loop detection, reset failure counters

### AgentBrain Structured Thinking

Every LLM call must produce: `evaluation_previous_goal`, `memory`, `next_goal`. This forces the agent to reason, not guess.

### Browser Understanding Pipeline

```
@inspect/browser/src/dom/
├── multi-tree.ts          # Collect DOM + Snapshot + AX trees in parallel
├── element-tree.ts        # EnhancedDOMTreeNode: merged data from all trees
├── serializer.ts          # Convert tree to LLM-friendly text with indexes
├── clickable-detector.ts  # Identify interactive elements
└── element-hash.ts        # SHA-256 hash for element tracking

@inspect/browser/src/vision/
├── screenshot-capture.ts   # DPR-normalized screenshots
├── bounding-box-overlay.ts # Draw element indexes on screenshots
├── coordinate-transform.ts # Map LLM coordinates to Playwright clicks
└── visual-grounding.ts     # Combine screenshot + DOM for LLM context
```

### Phase-Level File Structures & Effect Patterns

**Phase 1 — Agent Loop:**

```
@inspect/agent/src/
├── agent-loop.ts          # ServiceMap.Service for AgentLoop
├── agent-state.ts         # Schema.Class for AgentState
├── agent-output.ts        # Schema.Class for AgentOutput, AgentBrain
├── message-manager.ts     # ServiceMap.Service for MessageManager
├── prompt-templates.ts    # Pure functions for prompt construction
└── history.ts             # Schema.Class for AgentHistory, AgentHistoryList
```

Effect patterns: `ServiceMap.Service` for AgentLoop/MessageManager, `Schema.Class` for state/output, `Effect.fn` with spans for every phase, `PubSub.unbounded<AgentEvent>()` for step lifecycle events, `Effect.forEach` with `{ concurrency: "unbounded" }` for parallel operations.

**Phase 2 — Diff-Aware Planning:**

```
@inspect/orchestrator/src/testing/
├── diff-ast-parser.ts     # ServiceMap.Service for DiffAstParser
├── diff-plan-llm.ts       # ServiceMap.Service for DiffPlanLlm
└── plan-optimizer.ts      # ServiceMap.Service for PlanOptimizer
```

Effect patterns: `ServiceMap.Service` for DiffAnalyzer/PlanGenerator, `Schema.Class` for DiffHunk/ImpactedArea/DiffTestPlan, `Effect.forEach` with unbounded concurrency for parallel file analysis.

**Phase 3 — Multi-Tree DOM:**

```
@inspect/browser/src/dom/
├── multi-tree.ts          # ServiceMap.Service for MultiTreeCollector
├── element-tree.ts        # Schema.Class for EnhancedDOMTreeNode
├── serializer.ts          # Pure function: tree → LLM text
├── clickable-detector.ts  # ServiceMap.Service for ClickableDetector
└── element-hash.ts        # Pure function: element → SHA-256
```

Effect patterns: `Effect.all` for parallel CDP requests (DOM.getDocument, DOMSnapshot.captureSnapshot, Accessibility.getFullAXTree), `Effect.timeout` per request, `Effect.retry` with object syntax.

**Phase 4 — Accessibility + Performance:**

```
@inspect/a11y/src/
├── rule-engine.ts          # Rule → Check → Result classes
├── virtual-node.ts         # ServiceMap.Service for VirtualNode
├── standards.ts            # Pure data: ARIA/HTML/CSS
├── impact.ts               # Schema.Enum for impact levels
├── failure-summary.ts      # Pure function: result → message
└── scanner.ts              # ServiceMap.Service for A11yScanner

@inspect/lighthouse-quality/src/
├── gatherer.ts             # 5-phase lifecycle via acquireRelease
├── computed-artifacts.ts   # Memoized artifact factory
├── web-vitals.ts           # ServiceMap.Service for WebVitals
├── loaf-tracker.ts         # ServiceMap.Service for LoafTracker
└── scoring.ts              # Pure function: log-normal scoring
```

**Phase 5 — Memory + State:**

```
@inspect/agent-memory/src/
├── observation.ts          # Schema.TaggedUnion for observation types
├── masking.ts              # ServiceMap.Service for FreezeMask
├── trajectory.ts           # Schema.Class for StepInfo
└── todo-tracker.ts         # ServiceMap.Service for TodoTracker
```

**Phase 7 — Safety:**

```
@inspect/agent-governance/src/
├── loop-detector.ts        # ServiceMap.Service (enhance existing)
├── retry-policy.ts         # Schema.Class for RetryPolicy
├── safety-guards.ts        # ServiceMap.Service for SafetyGuards
├── error-classifier.ts     # ServiceMap.Service for ErrorClassifier
├── nudge-system.ts         # ServiceMap.Service for NudgeSystem
└── fallback-chains.ts      # ServiceMap.Service for FallbackChains
```

**Phase 8 — Stability:**

```
@inspect/browser/src/
├── stability-detector.ts   # ServiceMap.Service (network + visual)
├── tab-manager.ts          # ServiceMap.Service (multi-tab polling)
└── browser-provider.ts     # ServiceMap.Service (singleton with hash)
```

**Phase 9 — CI Mode:**

```
@inspect/orchestrator/src/
├── ci-mode.ts              # ServiceMap.Service for CiMode
└── artifact-upload.ts      # ServiceMap.Service for ArtifactUpload
```

### Key Dependencies & Ordering

- **Phase 1 must complete before Phase 2** — Effect-TS foundation enables all other work
- **Phase 2 must complete before Phase 3** — browser understanding enables intelligent planning
- **Phase 3 must complete before Phase 4** — evaluation requires planning
- **Phase 4 must complete before Phase 5** — safety enables scale
- **Phase 5 must complete before Phase 6** — scale enables self-improvement
- **Phases 7-9 can overlap with Phase 6** — documentation, testing, deployment are parallel tracks

### Phase-Level File Structures & Effect Patterns

**Phase 1 — Agent Loop:**

```
@inspect/agent/src/
├── agent-loop.ts          # ServiceMap.Service for AgentLoop
├── agent-state.ts         # Schema.Class for AgentState
├── agent-output.ts        # Schema.Class for AgentOutput, AgentBrain
├── message-manager.ts     # ServiceMap.Service for MessageManager
├── prompt-templates.ts    # Pure functions for prompt construction
└── history.ts             # Schema.Class for AgentHistory, AgentHistoryList
```

Effect patterns: `ServiceMap.Service` for AgentLoop/MessageManager, `Schema.Class` for state/output, `Effect.fn` with spans for every phase, `PubSub.unbounded<AgentEvent>()` for step lifecycle events, `Effect.forEach` with `{ concurrency: "unbounded" }` for parallel operations.

**Phase 2 — Diff-Aware Planning:**

```
@inspect/orchestrator/src/testing/
├── diff-ast-parser.ts     # ServiceMap.Service for DiffAstParser
├── diff-plan-llm.ts       # ServiceMap.Service for DiffPlanLlm
└── plan-optimizer.ts      # ServiceMap.Service for PlanOptimizer
```

Effect patterns: `ServiceMap.Service` for DiffAnalyzer/PlanGenerator, `Schema.Class` for DiffHunk/ImpactedArea/DiffTestPlan, `Effect.forEach` with unbounded concurrency for parallel file analysis.

**Phase 3 — Multi-Tree DOM:**

```
@inspect/browser/src/dom/
├── multi-tree.ts          # ServiceMap.Service for MultiTreeCollector
├── element-tree.ts        # Schema.Class for EnhancedDOMTreeNode
├── serializer.ts          # Pure function: tree → LLM text
├── clickable-detector.ts  # ServiceMap.Service for ClickableDetector
└── element-hash.ts        # Pure function: element → SHA-256
```

Effect patterns: `Effect.all` for parallel CDP requests (DOM.getDocument, DOMSnapshot.captureSnapshot, Accessibility.getFullAXTree), `Effect.timeout` per request, `Effect.retry` with object syntax.

**Phase 4 — Accessibility + Performance:**

```
@inspect/a11y/src/
├── rule-engine.ts          # Rule → Check → Result classes
├── virtual-node.ts         # ServiceMap.Service for VirtualNode
├── standards.ts            # Pure data: ARIA/HTML/CSS
├── impact.ts               # Schema.Enum for impact levels
├── failure-summary.ts      # Pure function: result → message
└── scanner.ts              # ServiceMap.Service for A11yScanner

@inspect/lighthouse-quality/src/
├── gatherer.ts             # 5-phase lifecycle via acquireRelease
├── computed-artifacts.ts   # Memoized artifact factory
├── web-vitals.ts           # ServiceMap.Service for WebVitals
├── loaf-tracker.ts         # ServiceMap.Service for LoafTracker
└── scoring.ts              # Pure function: log-normal scoring
```

**Phase 5 — Memory + State:**

```
@inspect/agent-memory/src/
├── observation.ts          # Schema.TaggedUnion for observation types
├── masking.ts              # ServiceMap.Service for FreezeMask
├── trajectory.ts           # Schema.Class for StepInfo
└── todo-tracker.ts         # ServiceMap.Service for TodoTracker
```

**Phase 7 — Safety:**

```
@inspect/agent-governance/src/
├── loop-detector.ts        # ServiceMap.Service (enhance existing)
├── retry-policy.ts         # Schema.Class for RetryPolicy
├── safety-guards.ts        # ServiceMap.Service for SafetyGuards
├── error-classifier.ts     # ServiceMap.Service for ErrorClassifier
├── nudge-system.ts         # ServiceMap.Service for NudgeSystem
└── fallback-chains.ts      # ServiceMap.Service for FallbackChains
```

**Phase 8 — Stability:**

```
@inspect/browser/src/
├── stability-detector.ts   # ServiceMap.Service (network + visual)
├── tab-manager.ts          # ServiceMap.Service (multi-tab polling)
└── browser-provider.ts     # ServiceMap.Service (singleton with hash)
```

**Phase 9 — CI Mode:**

```
@inspect/orchestrator/src/
├── ci-mode.ts              # ServiceMap.Service for CiMode
└── artifact-upload.ts      # ServiceMap.Service for ArtifactUpload
```

### Key Dependencies & Ordering

- **Phase 1 must complete before Phase 2** — Effect-TS foundation enables all other work
- **Phase 2 must complete before Phase 3** — browser understanding enables intelligent planning
- **Phase 3 must complete before Phase 4** — evaluation requires planning
- **Phase 4 must complete before Phase 5** — safety enables scale
- **Phase 5 must complete before Phase 6** — scale enables self-improvement
- **Phases 7-9 can overlap with Phase 6** — documentation, testing, deployment are parallel tracks

---

## Part 5: Implementation Phases

### Phase 1: Effect-TS Foundation + Real Agent Loop (Weeks 1-4)

**Goal:** Every package uses Effect-TS. Real agent loop replaces simulation-mode.

**Tasks:**

1. Migrate all 35 packages to `ServiceMap.Service` pattern (cookies is template)
2. Convert all interfaces to Effect Schema classes
3. Build real agent loop: `agent-loop.ts`, `agent-state.ts`, `agent-output.ts`
4. Implement AgentBrain structured thinking
5. Wire real browser integration — connect `@inspect/browser` into `TestExecutor`
6. Connect cookie extraction to browser context creation
7. Remove all simulation-mode fallbacks

**Deliverable:** All packages use Effect-TS, real agent loop produces real browser actions

### Phase 2: Diff-Aware LLM Test Plans (Weeks 5-6)

**Goal:** AST-based diff parsing + LLM-enhanced analysis for intelligent test plans.

**Tasks:**

1. Build `diff-ast-parser.ts` — TypeScript Compiler API for changed files
2. Build `diff-plan-llm.ts` — LLM-enhanced diff analysis
3. Build `plan-optimizer.ts` — Deduplicate and prioritize test steps
4. Enhance existing `DiffPlanGenerator` (535 lines) with LLM output
5. Wire adversarial test angle generation

**Deliverable:** LLM-enhanced test plans from git diffs with AST analysis

### Phase 3: Vision + DOM Understanding (Weeks 7-8)

**Goal:** Multi-tree DOM collection + vision-first page understanding.

**Tasks:**

1. Build multi-tree DOM collection (DOM + Snapshot + AX in parallel via CDP)
2. Build EnhancedDOMTreeNode merging all three trees
3. Build DOM serializer for LLM-friendly text output
4. Build clickable element detector
5. Implement DPR-normalized screenshots
6. Build bounding box overlays on screenshots
7. Build coordinate-based grounding for clicking
8. Build visual grounding (screenshot + DOM fusion)

**Deliverable:** Comprehensive browser understanding with vision + DOM fusion

### Phase 4: Accessibility + Performance Auditing (Weeks 9-10)

**Goal:** Custom rule engine for accessibility, custom audit pipeline for performance.

**Tasks:**

1. Build three-tier Rule → Check → Result model (axe-core pattern)
2. Build VirtualNode wrapper over Playwright Locator
3. Build impact aggregation system (minor → critical)
4. Build custom rule definitions and checks
5. Build 5-phase gatherer lifecycle (Lighthouse pattern)
6. Build computed artifact caching with memoization
7. Implement Web Vitals: FCP, LCP, CLS, INP, TTFB
8. Build log-normal scoring engine with p10/median control points

**Deliverable:** Comprehensive quality audits with custom rule engine and scoring

### Phase 5: Memory + State Management (Week 11)

**Goal:** Typed observations with retention policies, freeze mask for prompt caching.

**Tasks:**

1. Build typed observation system with retention policies (dedupe, limit, expire, summarize)
2. Build freeze mask for prompt caching stability
3. Build trajectory recording (screenshots, actions, URLs, errors per step)
4. Build todo-list tracker for structured task decomposition
5. Enhance context compaction with LLM-based summarization
6. Build action cache by hash(instruction + DOM state)

**Deliverable:** Intelligent memory system with retention, caching, and trajectory recording

### Phase 6: Quality Scoring + Evaluation (Week 12)

**Goal:** Composable evaluators, LLM judge, log-normal scoring.

**Tasks:**

1. Build evaluator interface and composable evaluator system
2. Implement evaluator types: string_match, url_match, dom_query, visual_match, accessibility
3. Build LLM judge with structured JSON output
4. Implement statistical rigor: bootstrapping, confidence intervals, A/B testing
5. Build scoring engine with log-normal distribution and category weighting
6. Build quality report card with breakdown and trends

**Deliverable:** Automated evaluation with statistical rigor and quality scoring

### Phase 7: Safety + Reliability (Week 13)

**Goal:** Real recovery executors, enhanced loop detection, fallback chains.

**Tasks:**

1. Implement 12 real recovery strategies (reScan, refresh, goBack, retry, skip, etc.)
2. Enhance LoopDetector with page fingerprinting (URL + element count + text hash)
3. Implement escalating nudges at 5, 8, 12 repetitions
4. Build fallback execution chains: Playwright → JS → direct value
5. Implement safety guards: max steps, timeouts, token/cost budgets
6. Build nudge system with escalation policy and cooldown

**Deliverable:** Robust safety system with real recovery and loop prevention

### Phase 8: Stability + Browser Lifecycle (Week 14)

**Goal:** Two-phase stability detection, multi-tab management, browser provider singleton.

**Tasks:**

1. Build network stability monitoring (filter analytics/ads/WebSockets, 500ms idle)
2. Build visual stability detection (screenshots at 100ms, pixel diff with sharp)
3. Build tab manager with `__tabActivityTime` injection and polling
4. Build browser provider singleton with hash-based reuse
5. Implement browser reconnection on disconnect

**Deliverable:** Stable browser operations with multi-tab support

### Phase 9: CI Mode + TUI State Flow (Week 15)

**Goal:** Headless execution with exit codes, JUnit output, TUI state flow.

**Tasks:**

1. Build CI mode: headless config, exit codes (0/1/2), JUnit/XML output
2. Implement artifact upload (screenshots, recordings, logs)
3. Implement flaky test retry and detection
4. Define TUI state machine: idle → planning → reviewing → executing → complete → error
5. Implement orchestrator state publishing via PubSub → IPC → Ink TUI
6. Build live view with step progress and browser screenshot streaming
7. Build plan review/approval flow in TUI

**Deliverable:** CI-ready execution with world-class TUI experience

### Phase 10: Session Recording & Replay (Weeks 16-17)

**Goal:** Full session recording with mutation buffer, snapshots, compression, replay.

**Tasks:**

1. Enhance rrweb integration: MutationBuffer, full snapshot, Mirror (ID mapping)
2. Implement freeze/lock mechanism and checkout system
3. Implement zlib compression with fflate + base64
4. Build replay player with XState: speed control, seek, step-by-step
5. Build replay overlays: action, error, DOM state, network, console
6. Complete Remotion video integration: compositions, scenes, export to MP4/GIF

**Deliverable:** Full session replay with timeline scrubbing and video export

### Phase 11: Self-Improvement Loop (Weeks 18-19)

**Goal:** Agent evaluates itself, finds flaws, writes patches, proves success statistically.

**Tasks:**

1. Build automated eval on every PR with regression/improvement detection
2. Build statistical A/B analysis with delta explanation
3. Build fix suggestion and automatic patch generation
4. Build closed-loop self-improvement: eval → suggest → patch → verify
5. Build pattern-based improvement suggestions (failure/success patterns)
6. Stream every token, prompt, timing metric, cost into queryable dataset

**Deliverable:** Self-improving agent with statistical proof of progress

### Phase 12: Speculative Execution + Parallel Pipeline (Weeks 20-21)

**Goal:** Pre-compute next actions while current executes for 30-40% speedup.

**Tasks:**

1. Build speculative planner with parallel LLM calls during execution
2. Implement next-step prediction with page state and DOM prediction
3. Build speculative result caching with invalidation and hit rate tracking
4. Build parallel execution pipeline: concurrent DOM collection, screenshots, LLM calls
5. Implement result streaming, aggregation, and deduplication
6. Build pipeline auto-tuning with backpressure and load balancing

**Deliverable:** 30-40% faster execution through speculative parallelism

### Phase 13: Watchdog System (Week 22)

**Goal:** Parallel monitors for captcha, popups, crashes, downloads.

**Tasks:**

1. Build watchdog base class with lifecycle (start, stop, pause)
2. Build captcha watchdog: image, reCAPTCHA, hCaptcha, Turnstile detection
3. Build popup watchdog: modal, alert, confirm, cookie consent, overlay detection
4. Build crash watchdog: page crash, browser crash, OOM, infinite loop detection
5. Build download watchdog: start, progress, completion tracking
6. Implement CAPTCHA solving integration (2Captcha, Anti-Captcha)

**Deliverable:** Parallel monitoring system for browser anomalies

### Phase 14: Natural Language API (Week 23)

**Goal:** Simple `inspect("Login")` API for natural language testing.

**Tasks:**

1. Build `inspect.natural()` API with intent parsing
2. Implement goal extraction and action inference from NL
3. Implement automatic step generation from natural language
4. Build NL assertion parsing and expectation extraction
5. Build NL to Playwright code generation with validation
6. Implement NL test templates, reuse, composition, parameterization

**Deliverable:** Natural language testing API with code generation

### Phase 15: Multi-Agent Orchestration (Week 24)

**Goal:** Agent handoffs, delegation, and multi-agent workflows.

**Tasks:**

1. Build agent definition DSL with roles, capabilities, constraints
2. Build agent communication protocol with message passing
3. Build agent handoff protocol with shared context
4. Implement agent patterns: supervisor, worker, specialist, router, evaluator
5. Build agent guardrails: input/output validation, safety checks
6. Build human-in-the-loop agent pattern

**Deliverable:** Multi-agent workflows with handoffs and guardrails

### Phase 16: MCP Server & External Integrations (Weeks 25-26)

**Goal:** Full MCP server for external tool integration, coding agent integration.

**Tasks:**

1. Build full `@inspect/mcp` server with 30+ tools (run, plan, diff, a11y, perf, etc.)
2. Implement Claude Code, Codex, Cursor ACP integration with SSE streaming
3. Build cloud browser provider integration (BrowserStack, SauceLabs, LambdaTest)
4. Build CI/CD integrations (GitHub Actions, GitLab CI, CircleCI, Jenkins)
5. Build notification integrations (Slack, Discord, email, webhooks)

**Deliverable:** Full integration ecosystem with MCP server

### Phase 17: Enterprise & Security (Weeks 27-28)

**Goal:** Enterprise-grade features, comprehensive security.

**Tasks:**

1. Build RBAC, SSO, tenant management
2. Build credential vault with TOTP generation, email/SMS polling
3. Build secrets manager integration (Azure KeyVault, AWS Secrets Manager, GCP, HashiCorp)
4. Build security scanning (OWASP ZAP, Nuclei, proxy-based)
5. Build stealth browser mode with anti-detection measures
6. Build hybrid LLM routing with cost optimization

**Deliverable:** Enterprise-ready with comprehensive security

### Phase 18: Testing Infrastructure (Weeks 29-30)

**Goal:** Comprehensive test coverage for all packages.

**Tasks:**

1. Unit tests for all 36 packages
2. Integration tests for cross-package interactions
3. E2E tests for complete workflows (diff → plan → execute → report)
4. Performance tests for parallel execution
5. Security tests for credential handling

**Deliverable:** Comprehensive test suite with >80% coverage

### Phase 19: Documentation & Developer Experience (Weeks 31-32)

**Goal:** World-class documentation and DX.

**Tasks:**

1. Architecture documentation, package docs, API docs
2. CLI docs, TUI docs, configuration docs
3. Build `inspect init`, `inspect doctor`, `inspect generate`
4. Build shell completions, help system, onboarding flow
5. Build tutorial mode

**Deliverable:** Comprehensive docs and world-class DX

### Phase 20: Deployment & Operations (Weeks 33-34)

**Goal:** Easy deployment, reliable operations.

**Tasks:**

1. Build Docker image, Docker Compose, Kubernetes deployment, Helm chart
2. Build cloud deployments (AWS, GCP, Azure, Vercel, Railway, Fly.io)
3. Build deployment strategies: canary, blue-green, rolling, zero-downtime
4. Build configuration management, secret management, feature flags
5. Build operational runbooks, incident response procedures

**Deliverable:** Production-ready deployment infrastructure

### Phase 21: Monitoring & Alerting (Weeks 35-36)

**Goal:** Comprehensive observability with proactive alerting.

**Tasks:**

1. Implement structured logging, distributed tracing, metrics collection
2. Build log/trace/metric aggregation, search, visualization
3. Build alerting for failures, performance, cost, quality, security
4. Build anomaly detection, trend detection, regression detection
5. Build alert routing, deduplication, escalation, suppression

**Deliverable:** Full observability stack with proactive alerting

---

## Part 6: Priority Matrix

| Priority | Component                         | Current State                | Effort    | Impact   | OSS Source                       |
| -------- | --------------------------------- | ---------------------------- | --------- | -------- | -------------------------------- |
| **P0**   | Effect-TS migration               | Only cookies uses Effect-TS  | Very High | Critical | cookies package                  |
| **P0**   | Real agent loop                   | Simulation-mode only         | High      | Critical | browser-use + Magnitude          |
| **P0**   | Wire real browser                 | Placeholder implementations  | Medium    | Critical | Existing browser package         |
| **P0**   | Diff → LLM → Test Plan            | Heuristic regex only         | High      | Critical | Existing DiffPlanGenerator + LLM |
| **P1**   | Multi-tree DOM collection         | ARIA snapshots only          | High      | High     | browser-use                      |
| **P1**   | Vision-first understanding        | Basic screenshots            | Medium    | High     | Skyvern + Magnitude              |
| **P1**   | Structured LLM thinking           | Simple string prompts        | Medium    | High     | browser-use                      |
| **P1**   | Observation/memory with retention | Basic short/long-term memory | Medium    | High     | Magnitude                        |
| **P1**   | Dynamic action union              | Static tool registry         | Medium    | High     | browser-use + Magnitude          |
| **P1**   | Speculative execution             | Sequential only              | Medium    | High     | Skyvern                          |
| **P1**   | Self-healing                      | Basic retry                  | Medium    | High     | Stagehand                        |
| **P2**   | Accessibility rule engine         | axe-core wrapper only        | High      | Medium   | axe-core                         |
| **P2**   | Performance audit pipeline        | Lighthouse wrapper only      | High      | Medium   | Lighthouse                       |
| **P2**   | Composable evaluator system       | None                         | Medium    | Medium   | OpAgent                          |
| **P2**   | Log-normal scoring engine         | Empty scaffold               | Medium    | Medium   | Lighthouse                       |
| **P2**   | Two-phase stability detection     | None                         | Medium    | Medium   | Magnitude                        |
| **P2**   | Watchdog system                   | Basic error handling         | Medium    | Medium   | browser-use                      |
| **P2**   | CI mode                           | None                         | Medium    | Medium   | —                                |
| **P3**   | Natural language API              | Structured plans only        | Medium    | Low      | Shortest                         |
| **P3**   | Multi-agent orchestration         | Single agent                 | Medium    | Low      | OpenAI Agents SDK                |

---

## Part 7: Immediate Next Actions

Start here. These 10 actions unblock everything else:

1. **Define core Effect Schemas** — `TestPlan`, `TestStep`, `TestResult`, `ExecutionEvent`, `AgentState`, `AgentOutput`, `AgentBrain` in `@inspect/shared`. Everything else depends on these.
2. **Migrate `@inspect/orchestrator` to Effect-TS** — Start with `TestExecutor`, `RecoveryManager`, `LoopDetector`. These are the core execution engine.
3. **Wire real browser integration** — Connect `@inspect/browser` into `TestExecutor` via `createExecutorAdapters()`. Remove simulation-mode.
4. **Connect cookie extraction** — Wire `@inspect/cookies` into browser context creation so tests run authenticated.
5. **Build real agent loop** — Replace the simulation-mode `generatePlan()` with LLM-driven plan generation using the existing `AgentRouter`.
6. **Enhance DiffPlanGenerator** — Add LLM enhancement to the existing heuristic analysis. Don't rebuild from scratch.
7. **Build multi-tree DOM collection** — Add parallel DOM + Snapshot + AX tree collection to `@inspect/browser/dom`.
8. **Add structured thinking** — Implement AgentBrain pattern in the agent loop prompts.
9. **Build stability detection** — Add network + visual stability to `@inspect/browser`.
10. **Wire everything together** — Connect all packages through Effect-TS Layer composition.

**Key files to modify first:**

- `packages/orchestrator/src/orchestrator/executor.ts` — Add real `planGenerator` and `stepExecutor`
- `packages/orchestrator/src/orchestrator/recovery.ts` — Wire real recovery executors
- `apps/cli/src/commands/test.ts` — Wire everything together

---

## Part 8: What NOT to Rebuild

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
| Visual diffing                 | Already complete                       | Migrate to Effect-TS                   |
| Reporter                       | Already complete (14 files)            | Migrate to Effect-TS                   |

---

## Part 9: Success Metrics

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
| Execution speed       | Sequential         | 30-40% faster via speculation          | Wall-clock time per test                  |
| Self-healing rate     | Basic retry        | >80% recovery without human            | Recovery success rate                     |

---

## Part 10: Risk Mitigations

| Risk                                              | Impact | Mitigation                                                                                  |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Effect-TS migration breaks existing functionality | High   | Migrate package-by-package, run `pnpm check` after each, keep simulation-mode as fallback   |
| LLM non-determinism causes flaky tests            | High   | Use structured output schemas, retry with backoff, deterministic prompts                    |
| Token costs spiral out of control                 | Medium | Prompt caching (freeze mask), context compaction, flash mode, cheaper models for extraction |
| Browser state leaks between tests                 | Medium | Fresh context per test, cookie isolation, cleanup finalizers                                |
| DOM changes break element references              | Medium | Multi-tree DOM collection, element hashing, fallback locators                               |
| Long test plans exceed context window             | Medium | Message compaction, step history summarization, checkpoint system                           |
| Migration timeline slips                          | Medium | Prioritize P0 components first, defer P2/P3 to post-MVP                                     |
| Speculative execution adds complexity             | Medium | Build incrementally, measure speedup, disable if overhead exceeds benefit                   |

---

## Part 11: Execution Timeline

```
Week  1-4  │ Phase 1:  Effect-TS Foundation + Real Agent Loop
Week  5-6  │ Phase 2:  Diff-Aware LLM Test Plans
Week  7-8  │ Phase 3:  Vision + DOM Understanding
Week  9-10 │ Phase 4:  Accessibility + Performance Auditing
Week    11 │ Phase 5:  Memory + State Management
Week    12 │ Phase 6:  Quality Scoring + Evaluation
Week    13 │ Phase 7:  Safety + Reliability
Week    14 │ Phase 8:  Stability + Browser Lifecycle
Week    15 │ Phase 9:  CI Mode + TUI State Flow
Week 16-17 │ Phase 10: Session Recording & Replay
Week 18-19 │ Phase 11: Self-Improvement Loop
Week 20-21 │ Phase 12: Speculative Execution + Parallel Pipeline
Week    22 │ Phase 13: Watchdog System
Week    23 │ Phase 14: Natural Language API
Week    24 │ Phase 15: Multi-Agent Orchestration
Week 25-26 │ Phase 16: MCP Server & External Integrations
Week 27-28 │ Phase 17: Enterprise & Security
Week 29-30 │ Phase 18: Testing Infrastructure
Week 31-32 │ Phase 19: Documentation & Developer Experience
Week 33-34 │ Phase 20: Deployment & Operations
Week 35-36 │ Phase 21: Monitoring & Alerting
```

**Total:** 36 weeks to production-ready world-class testing infrastructure

---

## Part 12: OSS Reference Quick Lookup

| Pattern               | OSS Repo    | Key File(s)                                               | Used In Inspect?                     |
| --------------------- | ----------- | --------------------------------------------------------- | ------------------------------------ |
| Agent step loop       | browser-use | `browser_use/agent/service.py:1021-1344`                  | ❌ Need to build                     |
| AgentBrain thinking   | browser-use | `browser_use/agent/views.py:380-385`                      | ❌ Need to build                     |
| Action registry       | browser-use | `browser_use/tools/registry/service.py:290-593`           | ✅ ToolRegistry exists (enhance)     |
| Multi-tree DOM        | browser-use | `browser_use/dom/service.py:376-641`                      | ❌ Need to build                     |
| EnhancedDOMTreeNode   | browser-use | `browser_use/dom/views.py:372-911`                        | ❌ Need to build                     |
| Loop detection        | browser-use | `browser_use/agent/views.py:156-248`                      | ✅ LoopDetector exists (enhance)     |
| Message compaction    | browser-use | `browser_use/agent/views.py:34-56`                        | ✅ ContextCompactor exists (enhance) |
| Agent loop + memory   | Magnitude   | `packages/magnitude-core/src/agent/index.ts:305-417`      | ❌ Need to build                     |
| Observation system    | Magnitude   | `packages/magnitude-core/src/memory/agentMemory.ts`       | ✅ agent-memory exists (enhance)     |
| Freeze mask           | Magnitude   | `packages/magnitude-core/src/memory/masking.ts`           | ❌ Need to build                     |
| Page stability        | Magnitude   | `packages/magnitude-core/src/web/stability.ts:120-341`    | ❌ Need to build                     |
| Tab activity tracking | Magnitude   | `packages/magnitude-core/src/web/tabs.ts:115-203`         | ❌ Need to build                     |
| Vision-first scraping | Skyvern     | `skyvern/webeye/scraper/scraper.py:140-414`               | ❌ Need to build                     |
| DOM interactability   | Skyvern     | `skyvern/webeye/scraper/domUtils.js:847-1058`             | ❌ Need to build                     |
| HTML serialization    | Skyvern     | `skyvern/webeye/scraper/scraped_page.py:36-106`           | ❌ Need to build                     |
| Task decomposition    | Skyvern     | `skyvern/forge/agent.py:316-722`                          | ❌ Need to build                     |
| MutationBuffer        | rrweb       | `packages/rrweb/src/record/mutation.ts:140-860`           | ❌ Need to build                     |
| Full snapshot         | rrweb       | `packages/rrweb-snapshot/src/snapshot.ts:922-1237`        | ✅ session exists (enhance)          |
| Gatherer lifecycle    | Lighthouse  | `core/gather/base-gatherer.js`                            | ❌ Need to build                     |
| CLS session grouping  | Lighthouse  | `core/computed/metrics/cumulative-layout-shift.js:26-149` | ❌ Need to build                     |
| INP calculation       | Lighthouse  | `core/computed/metrics/responsiveness.js`                 | ❌ Need to build                     |
| Log-normal scoring    | Lighthouse  | `shared/statistics.js:49-84`                              | ❌ Need to build                     |
| Rule/Check model      | axe-core    | `lib/core/base/rule.js:17-662`                            | ❌ Need to build                     |
| VirtualNode           | axe-core    | `lib/core/base/virtual-node/virtual-node.js:1-194`        | ❌ Need to build                     |
| Composable evaluators | OpAgent     | `opagent/evaluation_harness/evaluators.py:609-650`        | ❌ Need to build                     |
| Todo-list tracking    | OpAgent     | `opagent/local_agent_eval.py:249-271`                     | ❌ Need to build                     |
| Fallback strategies   | OpAgent     | `opagent/local_agent_eval.py:1317-1402`                   | ❌ Need to build                     |

---

## Part 13: Detailed Task Breakdown (1,700+ Tasks from Archive)

This section consolidates the comprehensive 1,700-task breakdown originally in archive/PLAN.md, providing detailed task-level guidance for each implementation phase.

## Part 1: Effect-TS Foundation (Tasks 1-120)

### 1.1 Core Schema Definitions (Tasks 1-20)

**Goal:** All domain models defined as Effect Schema classes, not plain interfaces.

- [x] Task 1: Define `TestPlan` as `Schema.Class` with `id`, `steps`, `baseUrl`, `isHeadless`, `requiresCookies`
- [x] Task 2: Define `TestPlanStep` as `Schema.Class` with `id`, `instruction`, `status`, `summary`, `startedAt`
- [x] Task 3: Define `TestResult` as `Schema.Class` with `status`, `summary`, `steps`, `duration`, `artifacts`
- [x] Task 4: Define `ExecutionEvent` as `Schema.TaggedUnion` with variants: `StepStarted`, `StepCompleted`, `StepFailed`, `ToolCall`, `ToolResult`, `Error`
- [x] Task 5: Define `AgentState` as `Schema.Class` with `nSteps`, `consecutiveFailures`, `lastResult`, `plan`, `loopDetector`
- [x] Task 6: Define `AgentOutput` as `Schema.Class` with `brain`, `actions`, `plan`
- [x] Task 7: Define `AgentBrain` as `Schema.Struct` with `evaluation`, `memory`, `nextGoal`
- [x] Task 8: Define `ActionResult` as `Schema.Class` with `isDone`, `success`, `error`, `extractedContent`, `longTermMemory`, `attachments`
- [x] Task 9: Define `AgentHistory` as `Schema.Class` with `modelOutput`, `results`, `browserState`, `metadata`
- [x] Task 10: Define `AgentHistoryList` as `Schema.Class` extending `Array(AgentHistory)` with query methods
- [x] Task 11: Define `BrowserConfig` as `Schema.Class` with `name`, `channel`, `headless`, `viewport`, `userAgent`
- [x] Task 12: Define `DeviceConfig` as `Schema.Class` with `name`, `viewport`, `userAgent`, `deviceScaleFactor`, `isMobile`
- [x] Task 13: Define `CookieParam` as `Schema.Struct` matching Playwright's cookie format
- [x] Task 14: Define `MCPToolDefinition` as `Schema.Struct` with `name`, `description`, `inputSchema`
- [x] Task 15: Define `GitScope` as `Schema.TaggedUnion` with variants: `WorkingTree`, `Branch`, `Commit`, `PullRequest`
- [x] Task 16: Define `DiffTestPlan` as `Schema.Class` with `impactedAreas`, `testSteps`, `confidence`
- [x] Task 17: Define `A11yReport` as interface (plain TS, used by a11y package)
- [ ] Task 18: Define `DashboardEvent` as `Schema.TaggedUnion` with all dashboard event variants
- [x] Task 19: Define `DashboardRunState` as `Schema.Class` with `runs`, `status`, `startTime`, `endTime`
- [x] Task 20: Define `DashboardSnapshot` as `Schema.Class` with `runs`, `metrics`, `summary`

### 1.2 Error Hierarchy (Tasks 21-35)

**Goal:** All errors use `Schema.ErrorClass` with explicit `_tag`, derived `message` field.

- [x] Task 21: Define `InspectError` as base `Schema.ErrorClass` with `code`, `context`
- [x] Task 22: Define `BrowserError` extending `InspectError` with `browser`, `page`, `url`
- [x] Task 23: Define `AgentError` extending `InspectError` with `agent`, `step`, `action`
- [x] Task 24: Define `ConfigError` extending `InspectError` with `key`, `value`, `reason`
- [x] Task 25: Define `NavigationError` extending `BrowserError` with `url`, `cause`
- [x] Task 26: Define `ElementNotFoundError` extending `BrowserError` with `selector`, `pageUrl`
- [x] Task 27: Define `CookieReadError` extending `InspectError` with `browser`, `cause`
- [x] Task 28: Define `CookieDatabaseNotFoundError` extending `InspectError` with `browser`
- [x] Task 29: Define `LLMProviderError` extending `AgentError` with `provider`, `model`, `cause`
- [x] Task 30: Define `RateLimitError` extending `LLMProviderError` with `retryAfter`
- [x] Task 31: Define `TokenBudgetExceededError` extending `AgentError` with `used`, `limit`
- [x] Task 32: Define `LoopDetectedError` extending `AgentError` with `actionHash`, `repetitions`
- [x] Task 33: Define `TimeoutError` extending `InspectError` with `operation`, `timeoutMs`
- [x] Task 34: Define `SchemaValidationError` extending `InspectError` with `parseError`
- [x] Task 35: Remove all legacy plain Error classes (`WorkflowError`, `CredentialError`, `NetworkError`)

### 1.3 Service Architecture — @inspect/orchestrator (Tasks 36-55)

**Goal:** Migrate orchestrator to `ServiceMap.Service` with proper Layer composition.

- [x] Task 36: Convert `TestExecutor` to `ServiceMap.Service` with `make:` property
- [x] Task 37: Define `TestExecutor.execute` as `Effect.fn` with span annotation
- [ ] Task 38: Define `TestExecutor.generatePlan` as `Effect.fn` (remove simulation-mode)
- [ ] Task 39: Define `TestExecutor.runStep` as `Effect.fn` (remove simulation-mode)
- [ ] Task 40: Define `TestExecutor.recover` as `Effect.fn` with proper error handling
- [x] Task 41: Create `TestExecutor.layer` with `Layer.provide()` chaining
- [x] Task 42: Convert `RecoveryManager` to `ServiceMap.Service`
- [x] Task 43: Define 10 failure types as `Schema.TaggedStruct`
- [x] Task 44: Define 12 recovery strategies as `Schema.TaggedStruct`
- [ ] Task 45: Implement real recovery executors (no simulation-mode)
- [x] Task 46: Convert `LoopDetector` to `ServiceMap.Service`
- [ ] Task 47: Add page fingerprinting to loop detection
- [ ] Task 48: Convert `SpeculativePlanner` to `ServiceMap.Service`
- [x] Task 49: Convert `CheckpointManager` to `ServiceMap.Service`
- [x] Task 50: Convert `DiffRunner` to `ServiceMap.Service`
- [ ] Task 51: Convert `DiffPlanGenerator` to `ServiceMap.Service`
- [x] Task 52: Convert `AdversarialExecutor` to `ServiceMap.Service`
- [ ] Task 53: Convert `RetryExecutor` to `ServiceMap.Service`
- [ ] Task 54: Convert `TestPrioritizer` to `ServiceMap.Service`
- [ ] Task 55: Convert `FlakinessDetector` to `ServiceMap.Service`

### 1.4 Service Architecture — @inspect/browser (Tasks 56-75)

**Goal:** Migrate browser automation to Effect-TS with proper resource management.

- [x] Task 56: Convert `BrowserManager` to `ServiceMap.Service`
- [x] Task 57: Define `BrowserManager.launch` with `Effect.acquireRelease` for cleanup
- [x] Task 58: Define `BrowserManager.close` as scoped resource
- [ ] Task 59: Convert `PageManager` to `ServiceMap.Service`
- [ ] Task 60: Convert `CrossBrowserManager` to `ServiceMap.Service`
- [x] Task 61: Convert `AriaSnapshotBuilder` to `ServiceMap.Service`
- [x] Task 62: Convert `DOMCapture` to `ServiceMap.Service`
- [ ] Task 63: Convert `HybridTree` to `ServiceMap.Service`
- [x] Task 64: Convert `ScreenshotCapture` to `ServiceMap.Service`
- [x] Task 65: Convert `VisionDetector` to `ServiceMap.Service`
- [x] Task 66: Convert `SessionRecorder` to `ServiceMap.Service`
- [ ] Task 67: Convert `HARRecorder` to `ServiceMap.Service`
- [x] Task 68: Convert `NetworkInterceptor` to `ServiceMap.Service`
- [x] Task 69: Convert `NetworkMonitor` to `ServiceMap.Service`
- [ ] Task 70: Convert `CookieExtractor` to `ServiceMap.Service`
- [ ] Task 71: Convert `ProfileManager` to `ServiceMap.Service`
- [ ] Task 72: Convert `MCPServer` to `ServiceMap.Service`
- [ ] Task 73: Convert `BrowserWatchdog` to `ServiceMap.Service`
- [ ] Task 74: Convert `FrameTraverser` to `ServiceMap.Service`
- [ ] Task 75: Convert `ShadowDomResolver` to `ServiceMap.Service`

### 1.5 Service Architecture — Remaining Packages (Tasks 76-100)

**Goal:** All packages use Effect-TS patterns.

- [x] Task 76: Migrate `@inspect/llm` — Convert `LLMProvider` abstract class to `ServiceMap.Service`
- [ ] Task 77: Migrate `@inspect/llm` — Convert `ClaudeProvider` to layer
- [ ] Task 78: Migrate `@inspect/llm` — Convert `OpenAIProvider` to layer
- [ ] Task 79: Migrate `@inspect/llm` — Convert `GeminiProvider` to layer
- [ ] Task 80: Migrate `@inspect/llm` — Convert `DeepSeekProvider` to layer
- [ ] Task 81: Migrate `@inspect/llm` — Convert `OllamaProvider` to layer
- [x] Task 82: Migrate `@inspect/llm` — Convert `AgentRouter` to `ServiceMap.Service`
- [x] Task 83: Migrate `@inspect/llm` — Convert `RateLimiter` to `ServiceMap.Service`
- [x] Task 84: Migrate `@inspect/llm` — Convert `FallbackManager` to `ServiceMap.Service`
- [x] Task 85: Migrate `@inspect/agent-memory` — Convert `MessageManager` to `ServiceMap.Service`
- [ ] Task 86: Migrate `@inspect/agent-memory` — Convert `LongTermMemory` to `ServiceMap.Service`
- [ ] Task 87: Migrate `@inspect/agent-memory` — Convert `ContextCompactor` to `ServiceMap.Service`
- [ ] Task 88: Migrate `@inspect/agent-memory` — Convert `MessageCompactor` to `ServiceMap.Service`
- [x] Task 89: Migrate `@inspect/agent-memory` — Convert `PatternStore` to `ServiceMap.Service`
- [x] Task 90: Migrate `@inspect/agent-tools` — Convert `ToolRegistry` to `ServiceMap.Service`
- [ ] Task 91: Migrate `@inspect/agent-tools` — Convert `ToolValidator` to `ServiceMap.Service`
- [x] Task 92: Migrate `@inspect/agent-tools` — Convert `NLAssert` to `ServiceMap.Service`
- [x] Task 93: Migrate `@inspect/agent-tools` — Convert `TokenTracker` to `ServiceMap.Service`
- [x] Task 94: Migrate `@inspect/agent-tools` — Convert `SensitiveDataMasker` to `ServiceMap.Service`
- [x] Task 95: Migrate `@inspect/agent-tools` — Convert `JudgeLLM` to `ServiceMap.Service`
- [x] Task 96: Migrate `@inspect/git` — Convert `GitManager` to `ServiceMap.Service`
- [ ] Task 97: Migrate `@inspect/git` — Convert `FingerprintGenerator` to `ServiceMap.Service`
- [ ] Task 98: Migrate `@inspect/reporter` — Convert all reporters to `ServiceMap.Service`
- [x] Task 99: Migrate `@inspect/observability` — Convert logger, tracer, metrics to `ServiceMap.Service`
- [x] Task 100: Migrate `@inspect/observability` — Convert `CostTracker`, `AnalyticsCollector` to `ServiceMap.Service`

### 1.6 CLI Migration (Tasks 101-120)

**Goal:** Clean CLI tech debt, remove invented types, extract business logic from React.

- [x] Task 101: Remove `TestContext` invented interface — use `TestContext` Schema from shared
- [x] Task 102: Remove `BrowserEnvironmentHints` — values belong on `TestPlanDraft`
- [x] Task 103: Remove `EnvironmentOverrides` — duplicate of `BrowserEnvironmentHints`
- [x] Task 104: Remove `TestRunConfig` — no intermediate bag needed
- [x] Task 105: Remove `AgentProvider` CLI type — define in shared as `Schema.Literals`
- [x] Task 106: Remove `HealthcheckResult` — delete entire healthcheck stub
- [x] Task 107: Remove `FetchTestContextsResult` — unused exported interface
- [x] Task 108: Remove `CommanderGlobalOptions` — parse directly into domain types
- [ ] Task 109: Extract `TestingScreen` execution lifecycle into effect-atom
- [x] Task 110: Add `status` field to `TestPlanStep` — eliminate derivation in component
- [x] Task 111: Add `displayText` getter on `ToolCall` schema — eliminate fragile property checks
- [x] Task 112: Add `displayName` getter on `ChangesFor` — eliminate duplication
- [ ] Task 113: Delete `usePlanningEffect` hook — supervisor should own session lifecycle
- [ ] Task 114: Extract `@`-picker logic into shared hook
- [ ] Task 115: Convert context option loading to React Query hooks
- [ ] Task 116: Convert PR comment posting to React Query mutation
- [x] Task 117: Add `toPlainText` getter on `TestReport` — move formatting out of component
- [x] Task 118: Define `BranchFilter` in shared models — move out of component
- [x] Task 119: Add `update()` method on `TestPlanDraft` — immutable field updates
- [ ] Task 120: Resolve `process.cwd()` scattering — store once at startup

---

## Part 2: Real Agent Loop (Tasks 121-220)

### 2.1 Agent Loop Core (Tasks 121-150)

**Goal:** Build real observe → think → act → finalize loop, replacing simulation-mode.

- [ ] Task 121: Create `packages/agent/src/agent-loop.ts` — main step loop
- [ ] Task 122: Implement `AgentLoop.run()` with while-loop: `while (state.nSteps <= maxSteps)`
- [ ] Task 123: Implement Phase 1 `_prepareContext()` — OBSERVE: get browser state, build messages
- [ ] Task 124: Implement Phase 2 `_getNextAction()` — THINK: call LLM, validate output schema
- [ ] Task 125: Implement Phase 3 `_executeActions()` — ACT: execute via tool registry
- [ ] Task 126: Implement Phase 4 `_postProcess()` — FINALIZE: update plan, record loop detection
- [ ] Task 127: Implement `_finalize()` — always runs, records history even on failure
- [ ] Task 128: Add step timeout via `Effect.timeout` per step
- [ ] Task 129: Add consecutive failure counter — break loop at `maxFailures`
- [ ] Task 130: Add catch-all error handler in `step()` — delegates to `_handleStepError()`
- [ ] Task 131: Implement `_handleStepError()` — format errors, increment failure counters
- [ ] Task 132: Implement page-change guard in `_executeActions()` — abort on URL/focus change
- [ ] Task 133: Implement `terminatesSequence` flag for actions that navigate
- [ ] Task 134: Implement runtime URL comparison after each action
- [ ] Task 135: Implement runtime focus target comparison after each action
- [ ] Task 136: Create `packages/agent/src/agent-state.ts` — mutable runtime state
- [ ] Task 137: Define `AgentState` with `nSteps`, `consecutiveFailures`, `lastResult`, `plan`
- [ ] Task 138: Define `AgentState` with `loopDetector`, `messageManagerState`
- [ ] Task 139: Implement state clearing after context preparation (prevent stale data)
- [ ] Task 140: Create `packages/agent/src/agent-output.ts` — LLM response schema
- [ ] Task 141: Define `AgentOutput` with `brain` fields + `actions` array
- [ ] Task 142: Implement dynamic action model extension (Pydantic `create_model` equivalent)
- [ ] Task 143: Filter actions by page URL domain patterns
- [ ] Task 144: Create `packages/agent/src/message-manager.ts` — prompt construction
- [ ] Task 145: Implement context window management with threshold detection
- [ ] Task 146: Implement message compaction when context grows past threshold
- [ ] Task 147: Implement LLM-based summarization of old history
- [ ] Task 148: Keep last N steps intact during compaction
- [ ] Task 149: Create `packages/agent/src/prompt-templates.ts` — system prompts
- [ ] Task 150: Define system prompt template with agent role, capabilities, constraints

### 2.2 Structured Thinking (Tasks 151-165)

**Goal:** AgentBrain pattern — force LLM to reason, not guess.

- [x] Task 151: Define `AgentBrain` schema with `evaluation`, `memory`, `nextGoal`
- [ ] Task 152: Add `evaluation` field — evaluate previous goal success/failure
- [ ] Task 153: Add `memory` field — persist important observations across steps
- [ ] Task 154: Add `nextGoal` field — declare what to do next
- [ ] Task 155: Inject AgentBrain fields into every LLM call prompt
- [ ] Task 156: Validate AgentBrain output schema on every LLM response
- [ ] Task 157: Implement flash mode — strip thinking fields for token savings
- [ ] Task 158: Flash mode: remove `evaluation`, `nextGoal`, keep only `memory` + `action`
- [ ] Task 159: Add flash mode toggle in agent settings
- [ ] Task 160: Implement action history feedback — every step receives full history
- [ ] Task 161: Format action history for LLM consumption (compact text format)
- [ ] Task 162: Include action results in history (success, error, extracted content)
- [ ] Task 163: Implement nudge injection system for loop detection
- [ ] Task 164: Define escalating nudge messages (5, 8, 12 repetitions)
- [ ] Task 165: Implement planning nudge injection when no plan exists

### 2.3 LLM Integration (Tasks 166-190)

**Goal:** Robust LLM calling with retry, fallback, and structured output.

- [ ] Task 166: Implement `_getLLMWithRetry()` — primary LLM with fallback chain
- [ ] Task 167: Implement exponential backoff retry for LLM calls
- [ ] Task 168: Implement `_trySwitchToFallbackLLM()` on rate-limit/provider errors
- [ ] Task 169: Register fallback LLM for token cost tracking
- [ ] Task 170: Implement structured output validation on LLM responses
- [ ] Task 171: Retry empty actions once, then insert safe "done" noop
- [ ] Task 172: Implement LLM provider protocol (like `BaseChatModel` from browser-use)
- [ ] Task 173: Use Protocol over ABC for LLM compatibility
- [ ] Task 174: Implement overloaded `invoke` — with/without output format
- [ ] Task 175: Add provider string property for provider-specific logic
- [ ] Task 176: Implement streaming LLM responses with SSE
- [ ] Task 177: Add token usage tracking per LLM call
- [ ] Task 178: Add cost tracking per LLM call (provider-specific pricing)
- [ ] Task 179: Implement prompt caching with freeze mask
- [ ] Task 180: Define freeze mask for previously-rendered observations
- [ ] Task 181: Implement prompt cache stability across steps
- [ ] Task 182: Add LLM call logging with structured annotations
- [ ] Task 183: Add LLM response validation with schema decode
- [ ] Task 184: Implement LLM timeout with `Effect.timeout`
- [ ] Task 185: Add LLM rate limiting with token bucket
- [ ] Task 186: Implement model routing based on task complexity
- [ ] Task 187: Add cheaper model for simple tasks, expensive for verification
- [ ] Task 188: Implement speculative planning — pre-compute next LLM call
- [ ] Task 189: Run next step's scrape + LLM concurrently with current action execution
- [ ] Task 190: Implement `SpeculativePlan` dataclass with scraped page, prompt, response

### 2.4 History & Trajectory (Tasks 191-220)

**Goal:** Rich history recording with query methods and replay capability.

- [ ] Task 191: Create `packages/agent/src/history.ts` — agent history recording
- [ ] Task 192: Define `AgentHistory` with `modelOutput`, `results`, `browserState`, `metadata`
- [ ] Task 193: Define `AgentHistoryList` extending array with 30+ query methods
- [ ] Task 194: Implement `urls()` — extract all URLs visited
- [ ] Task 195: Implement `screenshots()` — extract all screenshot paths
- [ ] Task 196: Implement `errors()` — extract all errors encountered
- [ ] Task 197: Implement `actions()` — extract all actions taken
- [ ] Task 198: Implement `stepDurations()` — extract timing per step
- [ ] Task 199: Implement `totalDuration()` — total execution time
- [ ] Task 200: Implement `tokenUsage()` — total tokens consumed
- [ ] Task 201: Implement `cost()` — total cost in USD
- [ ] Task 202: Implement `successRate()` — percentage of successful steps
- [ ] Task 203: Implement `toJson()` — serialize for storage
- [ ] Task 204: Implement `fromJson()` — deserialize for replay
- [ ] Task 205: Implement `rerunHistory()` — replay saved history
- [ ] Task 206: Implement 5-level element matching for replay: exact hash, stable hash, xpath, ax_name, attribute
- [ ] Task 207: Implement exponential backoff retries during replay
- [ ] Task 208: Implement AI summary generation after replay
- [ ] Task 209: Add trajectory recording — every step captures screenshot, action, URL, errors
- [ ] Task 210: Add model outputs to trajectory
- [ ] Task 211: Persist history to disk after each step
- [ ] Task 212: Implement history compression for long runs
- [ ] Task 213: Add history pruning — keep only last N steps in memory
- [ ] Task 214: Implement history export to JSONL format
- [ ] Task 215: Add history visualization endpoint
- [ ] Task 216: Implement step-by-step replay viewer
- [ ] Task 217: Add screenshot overlay on replay
- [ ] Task 218: Add action annotation on replay
- [ ] Task 219: Add error highlighting on replay
- [ ] Task 220: Implement history comparison (A/B runs)

---

## Part 3: Browser Understanding (Tasks 221-340)

### 3.1 Multi-Tree DOM Collection (Tasks 221-260)

**Goal:** Collect DOM + Accessibility + Snapshot trees in parallel for comprehensive understanding.

- [ ] Task 221: Create `packages/browser/src/dom/multi-tree.ts` — parallel tree collection
- [ ] Task 222: Implement `_getAllTrees()` — fire 3 CDP requests in parallel
- [ ] Task 223: Implement `DOMSnapshot.captureSnapshot` — layout, paint order, DOM rects
- [ ] Task 224: Implement `DOM.getDocument` — full DOM tree
- [ ] Task 225: Implement `Accessibility.getFullAXTree` — accessibility tree across frames
- [ ] Task 226: Add 10s timeout per CDP request
- [ ] Task 227: Add single retry with 2s timeout on failed requests
- [ ] Task 228: Implement viewport ratio detection
- [ ] Task 229: Implement JS click listener detection via `getEventListeners`
- [ ] Task 230: Create `packages/browser/src/dom/element-tree.ts` — enhanced node type
- [ ] Task 231: Define `EnhancedDOMTreeNode` merging DOM + AX + Snapshot data
- [ ] Task 232: Implement DOM data: tag, attributes, styles
- [ ] Task 233: Implement AX data: role, name, description
- [ ] Task 234: Implement Snapshot data: bounds, paint order, computed styles
- [ ] Task 235: Implement `_constructEnhancedNode()` — recursive tree builder
- [ ] Task 236: Track absolute positions across iframe coordinate systems
- [ ] Task 237: Handle shadow DOM in enhanced tree
- [ ] Task 238: Handle content documents in enhanced tree
- [ ] Task 239: Handle cross-origin iframes in enhanced tree
- [ ] Task 240: Compute visibility using CSS styles + viewport intersection
- [ ] Task 241: Implement `isElementVisibleAccordingToAllParents()`
- [ ] Task 242: Check CSS display property for visibility
- [ ] Task 243: Check CSS visibility property for visibility
- [ ] Task 244: Check CSS opacity property for visibility
- [ ] Task 245: Check viewport bounds with configurable threshold (1000px beyond)
- [ ] Task 246: Implement iframe depth limit (default 5)
- [ ] Task 247: Implement iframe quantity limit (default 100)
- [ ] Task 248: Implement cross-origin iframe support with lazy fetching
- [ ] Task 249: Match iframes by src URL if frameId missing
- [ ] Task 250: Skip invisible/small iframes
- [ ] Task 251: Create `packages/browser/src/dom/serializer.ts` — LLM-friendly text
- [ ] Task 252: Filter out non-displayable nodes (style, script, SVG decorative)
- [ ] Task 253: Remove elements hidden behind others
- [ ] Task 254: Remove elements outside viewport
- [ ] Task 255: Assign numeric `[index]` to clickable elements
- [ ] Task 256: Generate selector map mapping element indices to nodes
- [ ] Task 257: Format output as indented text outline: `[index] role: name`
- [ ] Task 258: Create `packages/browser/src/dom/clickable-detector.ts`
- [ ] Task 259: Implement `isInteractable()` — comprehensive interactability check
- [ ] Task 260: Check ARIA widget roles, pointer events, special inputs, framework bindings

### 3.2 Vision-First Understanding (Tasks 261-290)

**Goal:** Combine screenshot + DOM for LLM context, coordinate-based grounding.

- [ ] Task 261: Create `packages/browser/src/vision/screenshot-capture.ts` — DPR-normalized screenshots
- [ ] Task 262: Resize screenshots by `devicePixelRatio` before sending to LLM
- [ ] Task 263: Convert coordinates back after LLM returns click positions
- [ ] Task 264: Create `packages/browser/src/vision/bounding-box-overlay.ts`
- [ ] Task 265: Draw numbered boxes around interactable elements on screenshots
- [ ] Task 266: Support different box colors for different element types
- [ ] Task 267: Support box transparency for readability
- [ ] Task 268: Create `packages/browser/src/vision/coordinate-transform.ts`
- [ ] Task 269: Map LLM coordinates to Playwright clicks
- [ ] Task 270: Handle DPR scaling in coordinate transformation
- [ ] Task 271: Handle iframe coordinate offsets
- [ ] Task 272: Handle scroll position in coordinate transformation
- [ ] Task 273: Create `packages/browser/src/vision/visual-grounding.ts`
- [ ] Task 274: Combine screenshot + DOM for LLM context
- [ ] Task 275: Implement dual-modality prompt (image + text)
- [ ] Task 276: Implement CUA (Computer Use API) support for OpenAI
- [ ] Task 277: Implement CUA support for Anthropic
- [ ] Task 278: Implement screenshot-only mode for CUA engines
- [ ] Task 279: Implement coordinate-based clicking for CUA
- [ ] Task 280: Implement element-index clicking for text-based engines
- [ ] Task 281: Add vision detector for captcha, popups, overlays
- [ ] Task 282: Implement captcha detection from screenshots
- [ ] Task 283: Implement popup detection from screenshots
- [ ] Task 284: Implement overlay detection from screenshots
- [ ] Task 285: Add vision-based element detection fallback
- [ ] Task 286: Implement visual diff between consecutive screenshots
- [ ] Task 287: Use visual diff for page change detection
- [ ] Task 288: Add screenshot compression for token efficiency
- [ ] Task 289: Implement screenshot quality settings (configurable)
- [ ] Task 290: Add screenshot caching for unchanged pages

### 3.3 Stability Detection (Tasks 291-320)

**Goal:** Two-phase stability detection — network + visual — before agent acts.

- [ ] Task 291: Create `packages/browser/src/stability-detector.ts`
- [ ] Task 292: Implement network stability monitoring
- [ ] Task 293: Monitor relevant requests: document, CSS, JS, images, fonts, XHR
- [ ] Task 294: Filter out analytics requests
- [ ] Task 295: Filter out ad requests
- [ ] Task 296: Filter out WebSocket connections
- [ ] Task 297: Wait for 500ms of no relevant activity
- [ ] Task 298: Implement visual stability detection
- [ ] Task 299: Take screenshots at 100ms intervals
- [ ] Task 300: Pixel diff with `sharp` library
- [ ] Task 301: Require 3 consecutive stable frames below 0.01 difference
- [ ] Task 302: Implement combined stability check (network AND visual)
- [ ] Task 303: Add stability timeout (max wait time)
- [ ] Task 304: Emit stability events via PubSub
- [ ] Task 305: Create `packages/browser/src/tab-manager.ts`
- [ ] Task 306: Implement multi-tab management
- [ ] Task 307: Inject `__tabActivityTime` into each page via `page.evaluate()`
- [ ] Task 308: Poll activity every 200ms
- [ ] Task 309: Auto-switch to most recently active tab
- [ ] Task 310: Track tab creation events
- [ ] Task 311: Track tab close events
- [ ] Task 312: Track agent focus changes
- [ ] Task 313: Create `packages/browser/src/browser-provider.ts`
- [ ] Task 314: Implement singleton browser with hash + reuse
- [ ] Task 315: Hash launch options for browser instance matching
- [ ] Task 316: Reuse existing browser instances when options match
- [ ] Task 317: Close browser when last context closes
- [ ] Task 318: Implement browser reconnection on disconnect
- [ ] Task 319: Distinguish transient disconnects from terminal browser closure
- [ ] Task 320: Wait for `_reconnect_event` before retrying after disconnect

### 3.4 Dynamic Action System (Tasks 321-340)

**Goal:** Dynamic action union building, domain filtering, special parameter injection.

- [ ] Task 321: Enhance `ToolRegistry` with dynamic action model creation
- [ ] Task 322: Implement action registration via decorator pattern
- [ ] Task 323: Implement signature normalization for actions
- [ ] Task 324: Separate "special params" from "action params"
- [ ] Task 325: Auto-generate Pydantic param model from signature
- [ ] Task 326: Implement dynamic Union of individual action models
- [ ] Task 327: Each action becomes single-field model (e.g., `ClickActionModel`)
- [ ] Task 328: Wrap Union in RootModel with `getIndex()`/`setIndex()`
- [ ] Task 329: Implement domain-filtered actions
- [ ] Task 330: Actions declare `domains`/`allowedDomains`
- [ ] Task 331: Filter actions per-page by URL domain patterns
- [ ] Task 332: Implement special parameter injection
- [ ] Task 333: Inject `browserSession` into actions that declare it
- [ ] Task 334: Inject `pageExtractionLLM` into actions that declare it
- [ ] Task 335: Inject `fileSystem` into actions that declare it
- [ ] Task 336: Inject `availableFilePaths` into actions that declare it
- [ ] Task 337: Inject `pageUrl` into actions that declare it
- [ ] Task 338: Implement sensitive data replacement at execution time
- [ ] Task 339: Replace `<secret>placeholder</secret>` tags with domain-matched credentials
- [ ] Task 340: Support TOTP generation for 2FA codes in action params

---

## Part 4: Memory & State Management (Tasks 341-400)

### 4.1 Observation System (Tasks 341-370)

**Goal:** Typed observations with retention policies, freeze mask for prompt caching.

- [ ] Task 341: Create `packages/agent-memory/src/observation.ts`
- [ ] Task 342: Define `Observation` base type with `type`, `content`, `timestamp`
- [ ] Task 343: Define `WebObservation` — screenshot, tab info, URL
- [ ] Task 344: Define `ActionObservation` — action taken, parameters
- [ ] Task 345: Define `ActionResultObservation` — action result, extracted content
- [ ] Task 346: Define `ThoughtObservation` — agent reasoning
- [ ] Task 347: Define `ErrorObservation` — errors encountered
- [ ] Task 348: Implement retention policy: `dedupe` — collapse adjacent identical observations
- [ ] Task 349: Implement retention policy: `limit` — max N observations of a type
- [ ] Task 350: Implement retention policy: `expire` — observations older than X removed
- [ ] Task 351: Implement retention policy: `summarize` — LLM summarize old observations
- [ ] Task 352: Configure retention per observation type
- [ ] Task 353: Implement observation indexing for efficient retrieval
- [ ] Task 354: Implement observation query by type, time range, content
- [ ] Task 355: Create `packages/agent-memory/src/masking.ts` — freeze mask
- [ ] Task 356: Implement freeze mask for previously-rendered observations
- [ ] Task 357: Track which observations are frozen vs mutable
- [ ] Task 358: Implement prompt cache stability with frozen observations
- [ ] Task 359: Implement unfreeze on page change
- [ ] Task 360: Implement partial freeze (freeze content, keep metadata mutable)
- [ ] Task 361: Create `packages/agent-memory/src/todo-tracker.ts`
- [ ] Task 362: Define `TodoItem` with `id`, `description`, `status`
- [ ] Task 363: Define status: `pending`, `inProgress`, `completed`, `failed`
- [ ] Task 364: Implement todo list creation from task goal
- [ ] Task 365: Implement todo status updates during execution
- [ ] Task 366: Implement todo completion verification
- [ ] Task 367: Inject todo list into agent prompt
- [ ] Task 368: Track todo progress in agent state
- [ ] Task 369: Report todo completion in final results
- [ ] Task 370: Implement sub-todo items for complex tasks

### 4.2 Context Compaction (Tasks 371-400)

**Goal:** Intelligent context window management with LLM-based summarization.

- [ ] Task 371: Enhance `ContextCompactor` with LLM-based summarization
- [ ] Task 372: Define compaction trigger threshold (token count)
- [ ] Task 373: Define character limit for compaction
- [ ] Task 374: Define token limit for compaction
- [ ] Task 375: Implement LLM summarization of old history
- [ ] Task 376: Keep last N steps intact during compaction
- [ ] Task 377: Implement summary max size configuration
- [ ] Task 378: Implement compaction settings per agent
- [ ] Task 379: Implement compaction on context window approaching limit
- [ ] Task 380: Implement compaction on step count threshold
- [ ] Task 381: Implement compaction on token budget threshold
- [ ] Task 382: Add compaction logging with structured annotations
- [ ] Task 383: Track compaction ratio (before/after size)
- [ ] Task 384: Track compaction frequency
- [ ] Task 385: Implement compaction quality check (LLM verify summary)
- [ ] Task 386: Implement selective compaction (compact only certain observation types)
- [ ] Task 387: Implement incremental compaction (compact in chunks)
- [ ] Task 388: Implement compaction undo (restore previous state)
- [ ] Task 389: Create `packages/agent-memory/src/pattern-store.ts` — pattern learning
- [ ] Task 390: Store successful action patterns
- [ ] Task 391: Store failure patterns for avoidance
- [ ] Task 392: Implement pattern matching for similar situations
- [ ] Task 393: Implement pattern retrieval by context similarity
- [ ] Task 394: Implement pattern expiration (old patterns fade)
- [ ] Task 395: Implement pattern generalization (specific → general)
- [ ] Task 396: Create `packages/agent-memory/src/action-cache.ts`
- [ ] Task 397: Cache successful actions by instruction + DOM state hash
- [ ] Task 398: Implement cache hit replay without LLM call
- [ ] Task 399: Implement cache invalidation on DOM change
- [ ] Task 400: Implement cache size limit with LRU eviction

---

## Part 5: Diff-Aware Test Planning (Tasks 401-480)

### 5.1 Enhanced Diff Analysis (Tasks 401-440)

**Goal:** AST-based diff parsing + LLM-enhanced analysis for intelligent test plans.

- [ ] Task 401: Create `packages/orchestrator/src/testing/diff-ast-parser.ts`
- [ ] Task 402: Use TypeScript Compiler API to parse changed files
- [ ] Task 403: Extract component definitions from changed files
- [ ] Task 404: Extract function definitions from changed files
- [ ] Task 405: Extract route definitions from changed files
- [ ] Task 406: Extract API endpoint definitions from changed files
- [ ] Task 407: Extract form definitions from changed files
- [ ] Task 408: Extract test definitions from changed files
- [ ] Task 409: Build dependency graph from AST analysis
- [ ] Task 410: Identify impacted components via dependency traversal
- [ ] Task 411: Identify impacted routes via import analysis
- [ ] Task 412: Identify impacted APIs via call graph analysis
- [ ] Task 413: Create `packages/orchestrator/src/testing/diff-plan-llm.ts`
- [ ] Task 414: Send diff + AST analysis to LLM for richer understanding
- [ ] Task 415: LLM identifies user-facing behaviors changed
- [ ] Task 416: LLM identifies edge cases the changes introduce
- [ ] Task 417: LLM identifies existing functionality that might regress
- [ ] Task 418: LLM generates test step descriptions
- [ ] Task 419: LLM generates test priorities
- [ ] Task 420: LLM generates test confidence scores
- [ ] Task 421: Enhance `DiffPlanGenerator` with LLM output
- [ ] Task 422: Combine heuristic analysis with LLM analysis
- [ ] Task 423: Weight heuristic vs LLM results by confidence
- [ ] Task 424: Create `packages/orchestrator/src/testing/plan-optimizer.ts`
- [ ] Task 425: Deduplicate test steps from multiple sources
- [ ] Task 426: Prioritize test steps by impact and risk
- [ ] Task 427: Group related test steps
- [ ] Task 428: Order test steps for maximum coverage minimum steps
- [ ] Task 429: Remove redundant test steps
- [ ] Task 430: Merge similar test steps
- [ ] Task 431: Split complex test steps
- [ ] Task 432: Add adversarial test angles for each impacted area
- [ ] Task 433: Generate empty input tests
- [ ] Task 434: Generate boundary value tests
- [ ] Task 435: Generate race condition tests
- [ ] Task 436: Generate error state tests
- [ ] Task 437: Generate accessibility regression tests
- [ ] Task 438: Generate performance regression tests
- [ ] Task 439: Generate visual regression tests
- [ ] Task 440: Generate security regression tests

### 5.2 Git Integration (Tasks 441-480)

**Goal:** Comprehensive git integration for change detection and context.

- [ ] Task 441: Enhance `GitManager` with diff analysis
- [ ] Task 442: Get unstaged changes
- [ ] Task 443: Get staged changes
- [ ] Task 444: Get branch diff against main
- [ ] Task 445: Get commit diff
- [ ] Task 446: Get PR diff
- [ ] Task 447: Get file stats (added, removed, modified lines)
- [ ] Task 448: Get changed file types
- [ ] Task 449: Get changed directories
- [ ] Task 450: Get changed components (React/Vue/Angular)
- [ ] Task 451: Get changed pages/routes
- [ ] Task 452: Get changed API endpoints
- [ ] Task 453: Get changed tests
- [ ] Task 454: Get changed styles
- [ ] Task 455: Get changed config files
- [ ] Task 456: Get changed dependencies
- [ ] Task 457: Get changed environment variables
- [ ] Task 458: Get changed database migrations
- [ ] Task 459: Get changed CI configuration
- [ ] Task 460: Analyze change risk level (low/medium/high)
- [ ] Task 461: Analyze change scope (component/page/api/global)
- [ ] Task 462: Analyze change type (feature/bugfix/refactor/chore)
- [ ] Task 463: Analyze change author patterns
- [ ] Task 464: Get recent commits on branch
- [ ] Task 465: Get PR information for branch
- [ ] Task 466: Get PR status (open/draft/merged)
- [ ] Task 467: Get PR reviewers
- [ ] Task 468: Get PR comments
- [ ] Task 469: Get PR check status
- [ ] Task 470: Get branch protection rules
- [ ] Task 471: Get main branch name
- [ ] Task 472: Get remote branches
- [ ] Task 473: Get local branches
- [ ] Task 474: Get branch age
- [ ] Task 475: Get branch commit count
- [ ] Task 476: Get branch ahead/behind main
- [ ] Task 477: Get merge conflict status
- [ ] Task 478: Get code ownership for changed files
- [ ] Task 479: Get test coverage for changed files
- [ ] Task 480: Generate change summary for LLM context

---

## Part 6: Evaluation & Quality (Tasks 481-580)

### 6.1 Composable Evaluator System (Tasks 481-520)

**Goal:** Independent evaluators composed multiplicatively — all must pass.

- [ ] Task 481: Create `packages/quality/src/evaluator.ts` — evaluator interface
- [ ] Task 482: Define `Evaluator` interface with `evaluate()` method
- [ ] Task 483: Define `EvaluationResult` with `score`, `passed`, `reason`, `details`
- [ ] Task 484: Create `packages/quality/src/evaluators/string-match.ts`
- [ ] Task 485: Implement text content verification
- [ ] Task 486: Implement exact string match
- [ ] Task 487: Implement regex match
- [ ] Task 488: Implement fuzzy string match
- [ ] Task 489: Implement case-insensitive match
- [ ] Task 490: Create `packages/quality/src/evaluators/url-match.ts`
- [ ] Task 491: Implement URL verification
- [ ] Task 492: Implement exact URL match
- [ ] Task 493: Implement URL pattern match
- [ ] Task 494: Implement URL contains match
- [ ] Task 495: Create `packages/quality/src/evaluators/dom-query.ts`
- [ ] Task 496: Implement JavaScript DOM extraction
- [ ] Task 497: Implement CSS selector query
- [ ] Task 498: Implement XPath query
- [ ] Task 499: Implement element property check
- [ ] Task 500: Implement element attribute check
- [ ] Task 501: Create `packages/quality/src/evaluators/visual-match.ts`
- [ ] Task 502: Implement screenshot comparison
- [ ] Task 503: Implement pixel diff with threshold
- [ ] Task 504: Implement structural similarity index
- [ ] Task 505: Implement perceptual hash comparison
- [ ] Task 506: Create `packages/quality/src/evaluators/accessibility.ts`
- [ ] Task 507: Implement WCAG compliance check
- [ ] Task 508: Implement ARIA role validation
- [ ] Task 509: Implement color contrast check
- [ ] Task 510: Implement keyboard navigation check
- [ ] Task 511: Create `packages/quality/src/combined-evaluator.ts`
- [ ] Task 512: Implement multiplicative composition (all must pass)
- [ ] Task 513: Implement weighted composition
- [ ] Task 514: Implement OR composition (any must pass)
- [ ] Task 515: Implement conditional composition
- [ ] Task 516: Implement evaluator chain (short-circuit on failure)
- [ ] Task 517: Implement evaluator parallel execution
- [ ] Task 518: Add evaluator timeout
- [ ] Task 519: Add evaluator retry on transient failure
- [ ] Task 520: Add evaluator logging with structured annotations

### 6.2 LLM Judge (Tasks 521-560)

**Goal:** Automated LLM-based evaluation with statistical rigor.

- [ ] Task 521: Create `packages/quality/src/llm-judge.ts`
- [ ] Task 522: Define `JudgementResult` schema
- [ ] Task 523: Implement `reasoning` field — detailed breakdown
- [ ] Task 524: Implement `verdict` field — true/false
- [ ] Task 525: Implement `failureReason` field — max 5 sentences
- [ ] Task 526: Implement `impossibleTask` field — task unreachable
- [ ] Task 527: Implement `reachedCaptcha` field — captcha encountered
- [ ] Task 528: Build judge prompt with task goal and agent trajectory
- [ ] Task 529: Include action history in judge prompt
- [ ] Task 530: Include final page state in judge prompt
- [ ] Task 531: Include screenshots in judge prompt
- [ ] Task 532: Force structured JSON output from judge
- [ ] Task 533: Validate judge output schema
- [ ] Task 534: Implement judge retry on schema validation failure
- [ ] Task 535: Implement judge model selection (configurable)
- [ ] Task 536: Use cheaper model for judge (gemini-flash)
- [ ] Task 537: Implement judge alignment with human labels
- [ ] Task 538: Track judge accuracy over time
- [ ] Task 539: Implement judge bias detection
- [ ] Task 540: Implement judge calibration with known examples
- [ ] Task 541: Run task multiple times for statistical rigor
- [ ] Task 542: Implement bootstrapping for confidence intervals
- [ ] Task 543: Calculate error bars on success rate
- [ ] Task 544: Calculate statistical significance between runs
- [ ] Task 545: Implement A/B test comparison
- [ ] Task 546: Implement multi-run aggregation
- [ ] Task 547: Track run variance
- [ ] Task 548: Track run consistency
- [ ] Task 549: Implement configuration snapshot reproducibility
- [ ] Task 550: Record all agent settings per run
- [ ] Task 551: Record all environment variables per run
- [ ] Task 552: Record all model versions per run
- [ ] Task 553: Record all browser versions per run
- [ ] Task 554: Implement run reproducibility verification
- [ ] Task 555: Implement failure reason categorization
- [ ] Task 556: Extract raw failure reasons from judge
- [ ] Task 557: Cluster failure reasons into categories
- [ ] Task 558: Track failure category frequency
- [ ] Task 559: Generate failure category report
- [ ] Task 560: Implement daily failure mode sampling

### 6.3 Quality Scoring Engine (Tasks 561-580)

**Goal:** Log-normal scoring with categories, weighted audits.

- [ ] Task 561: Create `packages/quality/src/scoring-engine.ts`
- [ ] Task 562: Implement log-normal scoring function
- [ ] Task 563: Parameterize scoring with p10 control point
- [ ] Task 564: Parameterize scoring with median control point
- [ ] Task 565: Implement category weighting
- [ ] Task 566: Define categories: accessibility, performance, visual, functional
- [ ] Task 567: Define category weights (configurable)
- [ ] Task 568: Implement weighted audit references per category
- [ ] Task 569: Calculate category scores
- [ ] Task 570: Calculate overall quality score
- [ ] Task 571: Generate score breakdown
- [ ] Task 572: Generate score trend over time
- [ ] Task 573: Generate score comparison with baseline
- [ ] Task 574: Implement score threshold alerts
- [ ] Task 575: Implement score regression detection
- [ ] Task 576: Implement score improvement detection
- [ ] Task 577: Generate quality report card
- [ ] Task 578: Export scores to JSON
- [ ] Task 579: Export scores to CSV
- [ ] Task 580: Export scores to dashboard API

---

## Part 7: Accessibility & Performance (Tasks 581-680)

### 7.1 Accessibility Rule Engine (Tasks 581-630)

**Goal:** Three-tier Rule → Check → Result model, custom rule engine.

- [ ] Task 581: Create `packages/a11y/src/rule-engine.ts`
- [ ] Task 582: Define `Rule` class with `any`, `all`, `none` check composition
- [ ] Task 583: Define `Check` class with evaluation function
- [ ] Task 584: Define `Result` class with pass/fail/incomplete
- [ ] Task 585: Implement `any` composition (OR logic)
- [ ] Task 586: Implement `all` composition (AND logic)
- [ ] Task 587: Implement `none` composition (NAND logic)
- [ ] Task 588: Create `packages/a11y/src/virtual-node.ts`
- [ ] Task 589: Build cached wrapper around Playwright Locator
- [ ] Task 590: Implement lazy property evaluation
- [ ] Task 591: Implement DOM caching for repeated queries
- [ ] Task 592: Implement cache invalidation on DOM change
- [ ] Task 593: Create `packages/a11y/src/standards.ts`
- [ ] Task 594: Define ARIA roles data
- [ ] Task 595: Define ARIA attributes data
- [ ] Task 596: Define HTML elements data
- [ ] Task 597: Define CSS properties data
- [ ] Task 598: Define WCAG criteria data
- [ ] Task 599: Create `packages/a11y/src/impact.ts`
- [ ] Task 600: Define impact levels: minor, moderate, serious, critical
- [ ] Task 601: Implement impact aggregation as monoid with `max`
- [ ] Task 602: Use Effect's `Order` module for impact comparison
- [ ] Task 603: Create `packages/a11y/src/failure-summary.ts`
- [ ] Task 604: Implement message templates with data binding
- [ ] Task 605: Define pass message templates
- [ ] Task 606: Define fail message templates
- [ ] Task 607: Define incomplete message templates
- [ ] Task 608: Implement `${data.property}` interpolation
- [ ] Task 609: Generate human-readable remediation guidance
- [ ] Task 610: Generate fix code examples
- [ ] Task 611: Generate fix links to documentation
- [ ] Task 612: Create `packages/a11y/src/scanner.ts`
- [ ] Task 613: Implement tree-walking DOM scanner
- [ ] Task 614: Run all rules against all elements
- [ ] Task 615: Collect violations, passes, incomplete
- [ ] Task 616: Generate accessibility report
- [ ] Task 617: Create custom rule definitions as JSON data
- [ ] Task 618: Define rules for common patterns
- [ ] Task 619: Define rules for form accessibility
- [ ] Task 620: Define rules for navigation accessibility
- [ ] Task 621: Define rules for media accessibility
- [ ] Task 622: Define rules for dynamic content accessibility
- [ ] Task 623: Implement custom check evaluate functions
- [ ] Task 624: Implement color contrast check
- [ ] Task 625: Implement focus visible check
- [ ] Task 626: Implement heading order check
- [ ] Task 627: Implement alt text check
- [ ] Task 628: Implement ARIA attribute check
- [ ] Task 629: Implement keyboard trap check
- [ ] Task 630: Implement screen reader compatibility check

### 7.2 Performance Audit Pipeline (Tasks 631-680)

**Goal:** Custom audit pipeline with gatherer lifecycle, computed artifacts, web vitals.

- [ ] Task 631: Create `packages/lighthouse-quality/src/gatherer.ts`
- [ ] Task 632: Implement 5-phase gatherer lifecycle
- [ ] Task 633: Phase 1: `beforePass` — setup instrumentation
- [ ] Task 634: Phase 2: `pass` — collect data during page load
- [ ] Task 635: Phase 3: `afterPass` — teardown instrumentation
- [ ] Task 636: Phase 4: `compute` — compute artifacts from collected data
- [ ] Task 637: Phase 5: `audit` — run audits against artifacts
- [ ] Task 638: Map lifecycle to Effect's `acquireRelease`
- [ ] Task 639: Create `packages/lighthouse-quality/src/computed-artifacts.ts`
- [ ] Task 640: Implement `makeComputedArtifact()` decorator
- [ ] Task 641: Implement memoization by input
- [ ] Task 642: Implement cache invalidation
- [ ] Task 643: Create `packages/lighthouse-quality/src/web-vitals.ts`
- [ ] Task 644: Implement FCP (First Contentful Paint) collection
- [ ] Task 645: Implement LCP (Largest Contentful Paint) collection
- [ ] Task 646: Implement CLS (Cumulative Layout Shift) collection
- [ ] Task 647: Implement INP (Interaction to Next Paint) collection
- [ ] Task 648: Implement TTFB (Time to First Byte) collection
- [ ] Task 649: Create `packages/lighthouse-quality/src/cls-session.ts`
- [ ] Task 650: Implement CLS session grouping
- [ ] Task 651: 1000ms gap between sessions
- [ ] Task 652: 5000ms max session duration
- [ ] Task 653: Return max session score
- [ ] Task 654: Create `packages/lighthouse-quality/src/inp-calc.ts`
- [ ] Task 655: Implement INP via 98th percentile
- [ ] Task 656: Implement nearest-rank method on EventTiming trace events
- [ ] Task 657: Create `packages/lighthouse-quality/src/loaf-tracker.ts`
- [ ] Task 658: Implement LoAF (Long Animation Frame) detection
- [ ] Task 659: Filter LongAnimationFrame events after FCP
- [ ] Task 660: Track LoAF duration, scripts, style recalc
- [ ] Task 661: Create `packages/lighthouse-quality/src/trace-processor.ts`
- [ ] Task 662: Implement trace parsing
- [ ] Task 663: Implement task tree building
- [ ] Task 664: Implement main thread activity calculation
- [ ] Task 665: Create `packages/lighthouse-quality/src/network-analysis.ts`
- [ ] Task 666: Implement resource loading analysis
- [ ] Task 667: Implement critical resource detection
- [ ] Task 668: Implement render-blocking resource detection
- [ ] Task 669: Implement unused CSS detection
- [ ] Task 670: Implement unused JS detection
- [ ] Task 671: Implement image optimization detection
- [ ] Task 672: Implement font loading analysis
- [ ] Task 673: Implement third-party impact analysis
- [ ] Task 674: Create `packages/lighthouse-quality/src/scoring.ts`
- [ ] Task 675: Implement log-normal scoring for audits
- [ ] Task 676: Parameterize by p10 and median control points
- [ ] Task 677: Implement performance score calculation
- [ ] Task 678: Implement performance budget checking
- [ ] Task 679: Implement historical performance tracking
- [ ] Task 680: Generate performance report with recommendations

---

## Part 8: Safety & Reliability (Tasks 681-760)

### 8.1 Recovery & Loop Detection (Tasks 681-720)

**Goal:** Real recovery executors, enhanced loop detection, fallback chains.

- [ ] Task 681: Implement real recovery executors (no simulation-mode)
- [ ] Task 682: Implement `reScan` recovery — re-scan page for elements
- [ ] Task 683: Implement `refresh` recovery — reload page
- [ ] Task 684: Implement `goBack` recovery — navigate back
- [ ] Task 685: Implement `retryAction` recovery — retry with different selector
- [ ] Task 686: Implement `skipStep` recovery — skip failing step
- [ ] Task 687: Implement `alternativeAction` recovery — try different approach
- [ ] Task 688: Implement `resetState` recovery — reset to known good state
- [ ] Task 689: Implement `compactContext` recovery — reduce context size
- [ ] Task 690: Implement `switchModel` recovery — try different LLM
- [ ] Task 691: Implement `humanHelp` recovery — request human assistance
- [ ] Task 692: Implement `terminate` recovery — stop execution
- [ ] Task 693: Enhance `LoopDetector` with page fingerprinting
- [ ] Task 694: Compute action hash with normalization
- [ ] Task 695: Sort search tokens in action hash
- [ ] Task 696: Strip click indices in action hash
- [ ] Task 697: Track action hash repetition count
- [ ] Task 698: Compute page fingerprint: URL + element count + text hash
- [ ] Task 699: Track page fingerprint changes
- [ ] Task 700: Detect action loop with same page (stagnation)
- [ ] Task 701: Detect action loop with different pages (cycling)
- [ ] Task 702: Implement escalating nudges at 5, 8, 12 repetitions
- [ ] Task 703: Nudge 1: Gentle reminder of goal
- [ ] Task 704: Nudge 2: Suggest different approach
- [ ] Task 705: Nudge 3: Force different action type
- [ ] Task 706: Implement stall detection (no progress for N steps)
- [ ] Task 707: Implement exploration nudge when stuck
- [ ] Task 708: Implement plan replan nudge after stall
- [ ] Task 709: Create `packages/agent-governance/src/fallback-chains.ts`
- [ ] Task 710: Implement Playwright API → JS elementFromPoint → direct JS value
- [ ] Task 711: Implement selector fallback: CSS → XPath → text → role
- [ ] Task 712: Implement click fallback: click → dispatchEvent → set value
- [ ] Task 713: Implement type fallback: type → fill → evaluate
- [ ] Task 714: Implement wait fallback: waitForSelector → waitForTimeout → poll
- [ ] Task 715: Implement extract fallback: textContent → innerHTML → outerHTML
- [ ] Task 716: Track fallback chain usage
- [ ] Task 717: Track fallback chain success rate
- [ ] Task 718: Log fallback chain for debugging
- [ ] Task 719: Implement fallback chain timeout
- [ ] Task 720: Implement fallback chain abort on critical failure

### 8.2 Safety Guards (Tasks 721-760)

**Goal:** Max steps, timeout, resource limits, structured error communication.

- [ ] Task 721: Implement max steps limit
- [ ] Task 722: Implement per-step timeout
- [ ] Task 723: Implement total execution timeout
- [ ] Task 724: Implement token budget limit
- [ ] Task 725: Implement cost budget limit
- [ ] Task 726: Implement memory usage limit
- [ ] Task 727: Implement CPU usage limit
- [ ] Task 728: Implement network request limit
- [ ] Task 729: Implement DOM size limit
- [ ] Task 730: Implement screenshot count limit
- [ ] Task 731: Implement action count limit per step
- [ ] Task 732: Implement retry limit per action
- [ ] Task 733: Implement consecutive failure limit
- [ ] Task 734: Implement budget warning at 75%
- [ ] Task 735: Inject budget warning into agent prompt
- [ ] Task 736: Implement resource cleanup on limit reached
- [ ] Task 737: Implement graceful shutdown on limit reached
- [ ] Task 738: Implement emergency stop via signal
- [ ] Task 739: Create `packages/agent-governance/src/error-classifier.ts`
- [ ] Task 740: Classify errors as transient vs permanent
- [ ] Task 741: Classify errors as recoverable vs unrecoverable
- [ ] Task 742: Classify errors as agent fault vs environment fault
- [ ] Task 743: Implement structured error communication
- [ ] Task 744: `BrowserError` carries `shortTermMemory` (shown once)
- [ ] Task 745: `BrowserError` carries `longTermMemory` (persisted)
- [ ] Task 746: Implement error deduplication
- [ ] Task 747: Implement error aggregation
- [ ] Task 748: Implement error rate tracking
- [ ] Task 749: Implement error alerting
- [ ] Task 750: Implement error recovery suggestions
- [ ] Task 751: Create `packages/agent-governance/src/nudge-system.ts`
- [ ] Task 752: Define nudge types: reminder, suggestion, force
- [ ] Task 753: Implement nudge escalation policy
- [ ] Task 754: Implement nudge cooldown period
- [ ] Task 755: Track nudge effectiveness
- [ ] Task 756: Implement nudge logging
- [ ] Task 757: Implement nudge history in agent state
- [ ] Task 758: Implement nudge injection into prompt
- [ ] Task 759: Implement nudge removal after resolution
- [ ] Task 760: Implement nudge analytics

---

## Part 9: CI Mode & Parallel Execution (Tasks 761-860)

### 9.1 CI Mode (Tasks 761-800)

**Goal:** Headless execution with exit codes, JUnit/XML output, artifact upload, flaky test retry.

- [ ] Task 761: Create `packages/orchestrator/src/ci-mode.ts`
- [ ] Task 762: Implement headless browser configuration
- [ ] Task 763: Implement exit code semantics: 0=pass, 1=fail, 2=partial
- [ ] Task 764: Implement JUnit report output
- [ ] Task 765: Implement XML report output
- [ ] Task 766: Implement JSON report output
- [ ] Task 767: Implement Markdown report output
- [ ] Task 768: Implement HTML report output
- [ ] Task 769: Implement artifact upload (screenshots)
- [ ] Task 770: Implement artifact upload (replay recordings)
- [ ] Task 771: Implement artifact upload (execution logs)
- [ ] Task 772: Implement artifact upload (agent history)
- [ ] Task 773: Implement flaky test retry (N times before failing)
- [ ] Task 774: Implement flaky test detection (inconsistent results)
- [ ] Task 775: Implement flaky test quarantine
- [ ] Task 776: Implement flaky test report
- [ ] Task 777: Implement CI environment detection
- [ ] Task 778: Auto-enable CI mode in CI environments
- [ ] Task 779: Implement CI-specific timeouts
- [ ] Task 780: Implement CI-specific resource limits
- [ ] Task 781: Implement CI-specific logging (structured, machine-readable)
- [ ] Task 782: Implement GitHub Actions integration
- [ ] Task 783: Implement GitLab CI integration
- [ ] Task 784: Implement CircleCI integration
- [ ] Task 785: Implement Jenkins integration
- [ ] Task 786: Implement Azure DevOps integration
- [ ] Task 787: Implement PR comment posting with results
- [ ] Task 788: Implement PR check status update
- [ ] Task 789: Implement PR diff annotation
- [ ] Task 790: Implement commit status update
- [ ] Task 791: Implement Slack notification on failure
- [ ] Task 792: Implement email notification on failure
- [ ] Task 793: Implement webhook notification
- [ ] Task 794: Implement CI dashboard
- [ ] Task 795: Implement CI trend analysis
- [ ] Task 796: Implement CI flakiness trend
- [ ] Task 797: Implement CI cost tracking
- [ ] Task 798: Implement CI duration tracking
- [ ] Task 799: Implement CI success rate tracking
- [ ] Task 800: Implement CI quality score tracking

### 9.2 Parallel Execution (Tasks 801-860)

**Goal:** Massive parallelization for evaluation and testing.

- [ ] Task 801: Create `packages/orchestrator/src/parallel-executor.ts`
- [ ] Task 802: Implement task queue for parallel execution
- [ ] Task 803: Implement worker pool management
- [ ] Task 804: Implement dynamic worker scaling
- [ ] Task 805: Implement worker health checks
- [ ] Task 806: Implement worker recovery on crash
- [ ] Task 807: Implement task distribution across workers
- [ ] Task 808: Implement task result aggregation
- [ ] Task 809: Implement progress tracking across workers
- [ ] Task 810: Implement cancellation across all workers
- [ ] Task 811: Implement timeout per worker
- [ ] Task 812: Implement resource isolation per worker
- [ ] Task 813: Implement browser instance per worker
- [ ] Task 814: Implement cookie isolation per worker
- [ ] Task 815: Implement network isolation per worker
- [ ] Task 816: Implement result merging strategies
- [ ] Task 817: Implement conflict resolution for parallel results
- [ ] Task 818: Implement parallel test execution
- [ ] Task 819: Implement parallel plan generation
- [ ] Task 820: Implement parallel diff analysis
- [ ] Task 821: Implement parallel LLM calls (unbounded concurrency)
- [ ] Task 822: Implement parallel browser operations
- [ ] Task 823: Implement parallel screenshot capture
- [ ] Task 824: Implement parallel DOM collection
- [ ] Task 825: Implement parallel evaluation
- [ ] Task 826: Implement parallel reporting
- [ ] Task 827: Implement parallel artifact upload
- [ ] Task 828: Implement parallel notification sending
- [ ] Task 829: Implement parallel history recording
- [ ] Task 830: Implement parallel trajectory recording
- [ ] Task 831: Implement parallel stability detection
- [ ] Task 832: Implement parallel loop detection
- [ ] Task 833: Implement parallel recovery execution
- [ ] Task 834: Implement parallel checkpoint saving
- [ ] Task 835: Implement parallel cache updates
- [ ] Task 836: Implement parallel pattern store updates
- [ ] Task 837: Implement parallel todo tracking
- [ ] Task 838: Implement parallel compaction
- [ ] Task 839: Implement parallel masking
- [ ] Task 840: Implement parallel observability
- [ ] Task 841: Implement parallel metrics collection
- [ ] Task 842: Implement parallel tracing
- [ ] Task 843: Implement parallel cost tracking
- [ ] Task 844: Implement parallel analytics
- [ ] Task 845: Implement parallel dashboard updates
- [ ] Task 846: Implement parallel session recording
- [ ] Task 847: Implement parallel HAR recording
- [ ] Task 848: Implement parallel video export
- [ ] Task 849: Implement parallel screenshot diffing
- [ ] Task 850: Implement parallel accessibility auditing
- [ ] Task 851: Implement parallel performance auditing
- [ ] Task 852: Implement parallel security scanning
- [ ] Task 853: Implement parallel chaos testing
- [ ] Task 854: Implement parallel mocking
- [ ] Task 855: Implement parallel resilience testing
- [ ] Task 856: Implement parallel workflow execution
- [ ] Task 857: Implement parallel service orchestration
- [ ] Task 858: Implement parallel enterprise operations
- [ ] Task 859: Implement parallel SDK operations
- [ ] Task 860: Implement parallel MCP server handling

---

## Part 10: Session Recording & Replay (Tasks 861-920)

### 10.1 Enhanced Session Recording (Tasks 861-900)

**Goal:** Full session recording with mutation buffer, snapshots, compression, replay.

- [ ] Task 861: Enhance `@inspect/session` with rrweb integration
- [ ] Task 862: Implement MutationBuffer with dedup and ordering
- [ ] Task 863: Implement full snapshot with recursive serialization
- [ ] Task 864: Implement Mirror (bidirectional ID map: id ↔ node)
- [ ] Task 865: Implement freeze/lock mechanism during interactions
- [ ] Task 866: Implement checkout system (periodic full snapshots)
- [ ] Task 867: Implement zlib compression with fflate + base64
- [ ] Task 868: Implement event serialization
- [ ] Task 869: Implement event deserialization
- [ ] Task 870: Implement event streaming to storage
- [ ] Task 871: Implement event batching for efficiency
- [ ] Task 872: Implement event filtering (exclude noise)
- [ ] Task 873: Implement event annotation (add metadata)
- [ ] Task 874: Implement event tagging (categorize events)
- [ ] Task 875: Implement event search
- [ ] Task 876: Implement event indexing
- [ ] Task 877: Implement event compression ratio tracking
- [ ] Task 878: Implement event storage size tracking
- [ ] Task 879: Implement event retention policy
- [ ] Task 880: Implement event archival to cold storage
- [ ] Task 881: Implement replay player with XState
- [ ] Task 882: Implement replay speed control (0.5x, 1x, 2x, 4x)
- [ ] Task 883: Implement replay seek to timestamp
- [ ] Task 884: Implement replay step-by-step navigation
- [ ] Task 885: Implement replay pause/resume
- [ ] Task 886: Implement replay event highlighting
- [ ] Task 887: Implement replay action overlay
- [ ] Task 888: Implement replay error overlay
- [ ] Task 889: Implement replay DOM state inspection
- [ ] Task 890: Implement replay network inspection
- [ ] Task 891: Implement replay console inspection
- [ ] Task 892: Implement replay screenshot comparison
- [ ] Task 893: Implement replay export to video
- [ ] Task 894: Implement replay export to GIF
- [ ] Task 895: Implement replay share via URL
- [ ] Task 896: Implement replay embedding in reports
- [ ] Task 897: Implement replay annotation
- [ ] Task 898: Implement replay commenting
- [ ] Task 899: Implement replay bookmarking
- [ ] Task 900: Implement replay playlist (multiple sessions)

### 10.2 Video & Visual Export (Tasks 901-920)

**Goal:** Video compositions, scenes, visual export.

- [ ] Task 901: Complete `@inspect/video` Remotion integration
- [ ] Task 902: Implement video composition from session recording
- [ ] Task 903: Implement scene definitions
- [ ] Task 904: Implement scene transitions
- [ ] Task 905: Implement title cards
- [ ] Task 906: Implement end cards
- [ ] Task 907: Implement screenshot slideshow
- [ ] Task 908: Implement action annotation overlay
- [ ] Task 909: Implement result annotation overlay
- [ ] Task 910: Implement error annotation overlay
- [ ] Task 911: Implement quality score overlay
- [ ] Task 912: Implement timing overlay
- [ ] Task 913: Implement cost overlay
- [ ] Task 914: Implement video export to MP4
- [ ] Task 915: Implement video export to WebM
- [ ] Task 916: Implement video export to GIF
- [ ] Task 917: Implement video upload to cloud storage
- [ ] Task 918: Implement video share via URL
- [ ] Task 919: Implement video embedding in reports
- [ ] Task 920: Implement video thumbnail generation

---

## Part 11: Self-Improvement Loop (Tasks 921-980)

### 11.1 Automated Self-Improvement (Tasks 921-960)

**Goal:** Agent evaluates itself, finds flaws, writes patches, proves success statistically.

- [ ] Task 921: Create `packages/orchestrator/src/self-improvement.ts`
- [ ] Task 922: Implement automated eval on every PR
- [ ] Task 923: Implement regression detection on PR
- [ ] Task 924: Implement improvement detection on PR
- [ ] Task 925: Implement eval result posting to PR
- [ ] Task 926: Implement eval result posting to Slack
- [ ] Task 927: Implement MCP server for eval triggering
- [ ] Task 928: Implement agent-driven eval orchestration
- [ ] Task 929: Implement eval result querying via SQL
- [ ] Task 930: Implement statistical A/B analysis
- [ ] Task 931: Implement delta explanation
- [ ] Task 932: Implement fix suggestion generation
- [ ] Task 933: Implement automatic patch generation
- [ ] Task 934: Implement patch verification via eval
- [ ] Task 935: Implement closed-loop self-improvement
- [ ] Task 936: Track improvement over time
- [ ] Task 937: Track improvement velocity
- [ ] Task 938: Track improvement success rate
- [ ] Task 939: Implement improvement report generation
- [ ] Task 940: Implement improvement recommendation engine
- [ ] Task 941: Implement pattern-based improvement suggestions
- [ ] Task 942: Implement failure pattern learning
- [ ] Task 943: Implement success pattern replication
- [ ] Task 944: Implement cross-task pattern learning
- [ ] Task 945: Implement cross-model pattern learning
- [ ] Task 946: Implement cross-site pattern learning
- [ ] Task 947: Implement domain-specific optimization
- [ ] Task 948: Implement prompt optimization
- [ ] Task 949: Implement tool optimization
- [ ] Task 950: Implement action optimization
- [ ] Task 951: Implement strategy optimization
- [ ] Task 952: Implement configuration optimization
- [ ] Task 953: Implement model selection optimization
- [ ] Task 954: Implement timeout optimization
- [ ] Task 955: Implement retry policy optimization
- [ ] Task 956: Implement resource allocation optimization
- [ ] Task 957: Implement cost optimization
- [ ] Task 958: Implement speed optimization
- [ ] Task 959: Implement quality optimization
- [ ] Task 960: Implement reliability optimization

### 11.2 Observability at Scale (Tasks 961-980)

**Goal:** Stream every token, prompt, timing metric, cost into queryable dataset.

- [ ] Task 961: Implement token streaming to observability
- [ ] Task 962: Implement prompt streaming to observability
- [ ] Task 963: Implement timing metric streaming
- [ ] Task 964: Implement cost streaming
- [ ] Task 965: Implement browser session recording to observability
- [ ] Task 966: Implement frame saving to observability
- [ ] Task 967: Implement real-time dashboard state sync
- [ ] Task 968: Implement active run tracking
- [ ] Task 969: Implement result tracking
- [ ] Task 970: Implement queryable dataset API
- [ ] Task 971: Implement SQL query interface
- [ ] Task 972: Implement GraphQL query interface
- [ ] Task 973: Implement REST query interface
- [ ] Task 974: Implement dataset export
- [ ] Task 975: Implement dataset import
- [ ] Task 976: Implement dataset versioning
- [ ] Task 977: Implement dataset retention policy
- [ ] Task 978: Implement dataset archival
- [ ] Task 979: Implement dataset analytics
- [ ] Task 980: Implement dataset visualization

---

## Part 12: TUI State Flow & UX (Tasks 981-1020)

### 12.1 TUI Architecture (Tasks 981-1000)

**Goal:** Define TUI state flow, live view, plan review, error display.

- [ ] Task 981: Define TUI state machine
- [ ] Task 982: Define states: idle, planning, reviewing, executing, complete, error
- [ ] Task 983: Define transitions between states
- [ ] Task 984: Define state data requirements
- [ ] Task 985: Implement state persistence
- [ ] Task 986: Implement state restoration
- [ ] Task 987: Implement state validation
- [ ] Task 988: Implement state logging
- [ ] Task 989: Implement state analytics
- [ ] Task 990: Implement orchestrator state publishing via PubSub
- [ ] Task 991: Implement IPC mechanism for CLI ↔ orchestrator
- [ ] Task 992: Implement live view for step progress
- [ ] Task 993: Implement live browser screenshot streaming
- [ ] Task 994: Implement plan review/approval flow
- [ ] Task 995: Implement plan editing in TUI
- [ ] Task 996: Implement plan step reordering
- [ ] Task 997: Implement plan step removal
- [ ] Task 998: Implement plan step addition
- [ ] Task 999: Implement real-time error display with fix guidance
- [ ] Task 1000: Implement error recovery suggestions in TUI

### 12.2 UX Enhancements (Tasks 1001-1020)

**Goal:** World-class user experience.

- [ ] Task 1001: Implement keyboard shortcuts for all actions
- [ ] Task 1002: Implement command palette
- [ ] Task 1003: Implement search across all screens
- [ ] Task 1004: Implement filtering across all screens
- [ ] Task 1005: Implement sorting across all screens
- [ ] Task 1006: Implement pagination for large result sets
- [ ] Task 1007: Implement virtual scrolling for large lists
- [ ] Task 1008: Implement lazy loading for heavy content
- [ ] Task 1009: Implement skeleton loading states
- [ ] Task 1010: Implement error boundaries for all screens
- [ ] Task 1011: Implement retry on error
- [ ] Task 1012: Implement offline mode
- [ ] Task 1013: Implement dark mode
- [ ] Task 1014: Implement light mode
- [ ] Task 1015: Implement theme customization
- [ ] Task 1016: Implement accessibility for TUI (screen reader support)
- [ ] Task 1017: Implement internationalization
- [ ] Task 1018: Implement help system
- [ ] Task 1019: Implement onboarding flow
- [ ] Task 1020: Implement tutorial mode

---

## Part 13: MCP Server & Integrations (Tasks 1021-1080)

### 13.1 MCP Server (Tasks 1021-1050)

**Goal:** Full MCP server for external tool integration.

- [ ] Task 1021: Build full `@inspect/mcp` server
- [ ] Task 1022: Implement `inspect_run` tool — run test plan
- [ ] Task 1023: Implement `inspect_plan` tool — generate test plan
- [ ] Task 1024: Implement `inspect_diff` tool — analyze git diff
- [ ] Task 1025: Implement `inspect_a11y` tool — run accessibility audit
- [ ] Task 1026: Implement `inspect_perf` tool — run performance audit
- [ ] Task 1027: Implement `inspect_visual` tool — run visual regression
- [ ] Task 1028: Implement `inspect_security` tool — run security scan
- [ ] Task 1029: Implement `inspect_chaos` tool — run chaos test
- [ ] Task 1030: Implement `inspect_crawl` tool — crawl website
- [ ] Task 1031: Implement `inspect_extract` tool — extract data from page
- [ ] Task 1032: Implement `inspect_screenshot` tool — take screenshot
- [ ] Task 1033: Implement `inspect_replay` tool — replay session
- [ ] Task 1034: Implement `inspect_compare` tool — compare two runs
- [ ] Task 1035: Implement `inspect_status` tool — get run status
- [ ] Task 1036: Implement `inspect_history` tool — get run history
- [ ] Task 1037: Implement `inspect_results` tool — get run results
- [ ] Task 1038: Implement `inspect_artifacts` tool — get run artifacts
- [ ] Task 1039: Implement `inspect_config` tool — get/set configuration
- [ ] Task 1040: Implement `inspect_models` tool — list available models
- [ ] Task 1041: Implement `inspect_devices` tool — list device presets
- [ ] Task 1042: Implement `inspect_agents` tool — list agent configurations
- [ ] Task 1043: Implement `inspect_workflows` tool — list workflows
- [ ] Task 1044: Implement `inspect_credentials` tool — manage credentials
- [ ] Task 1045: Implement `inspect_proxy` tool — manage proxy settings
- [ ] Task 1046: Implement `inspect_tunnel` tool — manage tunnels
- [ ] Task 1047: Implement `inspect_dashboard` tool — get dashboard data
- [ ] Task 1048: Implement `inspect_report` tool — generate report
- [ ] Task 1049: Implement `inspect_export` tool — export data
- [ ] Task 1050: Implement `inspect_import` tool — import data

### 13.2 External Integrations (Tasks 1051-1080)

**Goal:** Integrate with coding agents, CI/CD, cloud providers.

- [ ] Task 1051: Implement Claude Code ACP integration
- [ ] Task 1052: Implement Codex ACP integration
- [ ] Task 1053: Implement Cursor ACP integration
- [ ] Task 1054: Implement GitHub Copilot integration
- [ ] Task 1055: Implement Zed Claude Agent ACP integration
- [ ] Task 1056: Implement ACP client with SSE streaming
- [ ] Task 1057: Implement ACP authentication
- [ ] Task 1058: Implement ACP session management
- [ ] Task 1059: Implement ACP message routing
- [ ] Task 1060: Implement ACP error handling
- [ ] Task 1061: Implement cloud browser provider (BrowserStack)
- [ ] Task 1062: Implement cloud browser provider (SauceLabs)
- [ ] Task 1063: Implement cloud browser provider (LambdaTest)
- [ ] Task 1064: Implement cloud browser provider (Percy)
- [ ] Task 1065: Implement cloud session pool management
- [ ] Task 1066: Implement cloud session failover
- [ ] Task 1067: Implement cloud session cost tracking
- [ ] Task 1068: Implement cloud session performance tracking
- [ ] Task 1069: Implement iOS simulator integration
- [ ] Task 1070: Implement Android emulator integration
- [ ] Task 1071: Implement Docker container integration
- [ ] Task 1072: Implement Kubernetes integration
- [ ] Task 1073: Implement GitHub Actions integration
- [ ] Task 1074: Implement GitLab CI integration
- [ ] Task 1075: Implement CircleCI integration
- [ ] Task 1076: Implement Jenkins integration
- [ ] Task 1077: Implement Azure DevOps integration
- [ ] Task 1078: Implement Slack integration
- [ ] Task 1079: Implement Discord integration
- [ ] Task 1080: Implement email integration

---

## Part 14: Testing Infrastructure (Tasks 1081-1140)

### 14.1 Unit Tests (Tasks 1081-1100)

**Goal:** Comprehensive unit test coverage for all packages.

- [ ] Task 1081: Add unit tests for `@inspect/shared` schemas
- [ ] Task 1082: Add unit tests for `@inspect/shared` errors
- [ ] Task 1083: Add unit tests for `@inspect/shared` event bus
- [ ] Task 1084: Add unit tests for `@inspect/shared` circuit breaker
- [ ] Task 1085: Add unit tests for `@inspect/shared` assertions
- [ ] Task 1086: Add unit tests for `@inspect/orchestrator` executor
- [ ] Task 1087: Add unit tests for `@inspect/orchestrator` recovery
- [ ] Task 1088: Add unit tests for `@inspect/orchestrator` loop detector
- [ ] Task 1089: Add unit tests for `@inspect/orchestrator` scheduler
- [ ] Task 1090: Add unit tests for `@inspect/orchestrator` planner
- [ ] Task 1091: Add unit tests for `@inspect/browser` browser manager
- [ ] Task 1092: Add unit tests for `@inspect/browser` page manager
- [ ] Task 1093: Add unit tests for `@inspect/browser` DOM capture
- [ ] Task 1094: Add unit tests for `@inspect/browser` screenshot capture
- [ ] Task 1095: Add unit tests for `@inspect/browser` session recorder
- [ ] Task 1096: Add unit tests for `@inspect/llm` providers
- [ ] Task 1097: Add unit tests for `@inspect/llm` router
- [ ] Task 1098: Add unit tests for `@inspect/llm` rate limiter
- [ ] Task 1099: Add unit tests for `@inspect/agent-memory` compactor
- [ ] Task 1100: Add unit tests for `@inspect/agent-tools` registry

### 14.2 Integration Tests (Tasks 1101-1120)

**Goal:** Integration tests for cross-package interactions.

- [ ] Task 1101: Add integration tests for agent loop
- [ ] Task 1102: Add integration tests for browser automation
- [ ] Task 1103: Add integration tests for cookie extraction
- [ ] Task 1104: Add integration tests for LLM routing
- [ ] Task 1105: Add integration tests for diff analysis
- [ ] Task 1106: Add integration tests for test planning
- [ ] Task 1107: Add integration tests for test execution
- [ ] Task 1108: Add integration tests for evaluation
- [ ] Task 1109: Add integration tests for reporting
- [ ] Task 1110: Add integration tests for session recording
- [ ] Task 1111: Add integration tests for accessibility auditing
- [ ] Task 1112: Add integration tests for performance auditing
- [ ] Task 1113: Add integration tests for visual regression
- [ ] Task 1114: Add integration tests for security scanning
- [ ] Task 1115: Add integration tests for chaos testing
- [ ] Task 1116: Add integration tests for workflow execution
- [ ] Task 1117: Add integration tests for API server
- [ ] Task 1118: Add integration tests for MCP server
- [ ] Task 1119: Add integration tests for CLI commands
- [ ] Task 1120: Add integration tests for TUI screens

### 14.3 E2E Tests (Tasks 1121-1140)

**Goal:** End-to-end tests for complete workflows.

- [ ] Task 1121: Add E2E test for full test run (diff → plan → execute → report)
- [ ] Task 1122: Add E2E test for PR testing workflow
- [ ] Task 1123: Add E2E test for branch testing workflow
- [ ] Task 1124: Add E2E test for commit testing workflow
- [ ] Task 1125: Add E2E test for working tree testing workflow
- [ ] Task 1126: Add E2E test for authenticated testing (cookies)
- [ ] Task 1127: Add E2E test for multi-device testing
- [ ] Task 1128: Add E2E test for multi-browser testing
- [ ] Task 1129: Add E2E test for accessibility audit
- [ ] Task 1130: Add E2E test for performance audit
- [ ] Task 1131: Add E2E test for visual regression
- [ ] Task 1132: Add E2E test for security scan
- [ ] Task 1133: Add E2E test for chaos test
- [ ] Task 1134: Add E2E test for workflow execution
- [ ] Task 1135: Add E2E test for CI mode
- [ ] Task 1136: Add E2E test for parallel execution
- [ ] Task 1137: Add E2E test for self-improvement loop
- [ ] Task 1138: Add E2E test for MCP server
- [ ] Task 1139: Add E2E test for API server
- [ ] Task 1140: Add E2E test for dashboard

---

## Part 15: Documentation & Developer Experience (Tasks 1141-1180)

### 15.1 Documentation (Tasks 1141-1160)

**Goal:** Comprehensive documentation for all features.

- [ ] Task 1141: Write architecture documentation
- [ ] Task 1142: Write package documentation for all 36 packages
- [ ] Task 1143: Write API documentation for all public APIs
- [ ] Task 1144: Write CLI documentation for all commands
- [ ] Task 1145: Write TUI documentation
- [ ] Task 1146: Write configuration documentation
- [ ] Task 1147: Write agent configuration documentation
- [ ] Task 1148: Write browser configuration documentation
- [ ] Task 1149: Write LLM configuration documentation
- [ ] Task 1150: Write evaluation configuration documentation
- [ ] Task 1151: Write CI/CD integration documentation
- [ ] Task 1152: Write MCP server documentation
- [ ] Task 1153: Write SDK documentation
- [ ] Task 1154: Write plugin development documentation
- [ ] Task 1155: Write custom evaluator documentation
- [ ] Task 1156: Write custom rule documentation
- [ ] Task 1157: Write custom tool documentation
- [ ] Task 1158: Write custom workflow documentation
- [ ] Task 1159: Write troubleshooting guide
- [ ] Task 1160: Write FAQ

### 15.2 Developer Experience (Tasks 1161-1180)

**Goal:** World-class developer experience.

- [ ] Task 1161: Implement `inspect init` — project setup wizard
- [ ] Task 1162: Implement `inspect doctor` — environment health check
- [ ] Task 1163: Implement `inspect install` — dependency installation
- [ ] Task 1164: Implement `inspect generate` — generate test plans from natural language
- [ ] Task 1165: Implement `inspect audit` — comprehensive code audit
- [ ] Task 1166: Implement `inspect show-report` — view report in browser
- [ ] Task 1167: Implement `inspect show-trace` — view trace in browser
- [ ] Task 1168: Implement `inspect alias` — command aliases
- [ ] Task 1169: Implement `inspect devices` — list device presets
- [ ] Task 1170: Implement `inspect agents` — list agent configurations
- [ ] Task 1171: Implement `inspect models` — list available models
- [ ] Task 1172: Implement `inspect completions` — shell completions
- [ ] Task 1173: Implement `inspect serve` — start API server
- [ ] Task 1174: Implement `inspect dashboard` — start dashboard
- [ ] Task 1175: Implement `inspect cost` — show cost breakdown
- [ ] Task 1176: Implement `inspect tunnel` — create secure tunnel
- [ ] Task 1177: Implement `inspect sessions` — list active sessions
- [ ] Task 1178: Implement `inspect engine` — start workflow engine
- [ ] Task 1179: Implement `inspect trail` — show audit trail
- [ ] Task 1180: Implement `inspect autonomy` — show autonomy level

---

## Part 16: Enterprise & Security (Tasks 1181-1220)

### 16.1 Enterprise Features (Tasks 1181-1200)

**Goal:** Enterprise-grade features for large organizations.

- [ ] Task 1181: Implement RBAC (Role-Based Access Control)
- [ ] Task 1182: Implement SSO (Single Sign-On)
- [ ] Task 1183: Implement tenant management
- [ ] Task 1184: Implement hybrid LLM routing
- [ ] Task 1185: Implement team management
- [ ] Task 1186: Implement project management
- [ ] Task 1187: Implement billing integration
- [ ] Task 1188: Implement usage tracking
- [ ] Task 1189: Implement quota management
- [ ] Task 1190: Implement audit logging
- [ ] Task 1191: Implement compliance reporting
- [ ] Task 1192: Implement data retention policies
- [ ] Task 1193: Implement data export
- [ ] Task 1194: Implement data import
- [ ] Task 1195: Implement data encryption at rest
- [ ] Task 1196: Implement data encryption in transit
- [ ] Task 1197: Implement API key management
- [ ] Task 1198: Implement webhook security
- [ ] Task 1199: Implement rate limiting per tenant
- [ ] Task 1200: Implement SLA monitoring

### 16.2 Security (Tasks 1201-1220)

**Goal:** Comprehensive security scanning and protection.

- [ ] Task 1201: Implement OWASP ZAP scanning
- [ ] Task 1202: Implement Nuclei scanning
- [ ] Task 1203: Implement proxy-based scanning
- [ ] Task 1204: Implement sensitive data masking
- [ ] Task 1205: Implement credential vault
- [ ] Task 1206: Implement TOTP generation
- [ ] Task 1207: Implement email polling for OTP
- [ ] Task 1208: Implement SMS polling for OTP
- [ ] Task 1209: Implement Azure KeyVault integration
- [ ] Task 1210: Implement AWS Secrets Manager integration
- [ ] Task 1211: Implement GCP Secret Manager integration
- [ ] Task 1212: Implement HashiCorp Vault integration
- [ ] Task 1213: Implement network proxy management
- [ ] Task 1214: Implement SOCKS5 proxy
- [ ] Task 1215: Implement security data masking
- [ ] Task 1216: Implement stealth browser mode
- [ ] Task 1217: Implement anti-detection measures
- [ ] Task 1218: Implement captcha solving
- [ ] Task 1219: Implement popup handling
- [ ] Task 1220: Implement dialog handling

---

## Part 17: Performance & Optimization (Tasks 1221-1260)

### 17.1 Performance Optimization (Tasks 1221-1240)

**Goal:** Optimize for speed, cost, and reliability.

- [ ] Task 1221: Implement prompt caching optimization
- [ ] Task 1222: Implement token usage optimization
- [ ] Task 1223: Implement LLM call batching
- [ ] Task 1224: Implement DOM collection optimization
- [ ] Task 1225: Implement screenshot compression optimization
- [ ] Task 1226: Implement network request optimization
- [ ] Task 1227: Implement browser launch optimization
- [ ] Task 1228: Implement context creation optimization
- [ ] Task 1229: Implement cookie injection optimization
- [ ] Task 1230: Implement session recording optimization
- [ ] Task 1231: Implement artifact upload optimization
- [ ] Task 1232: Implement report generation optimization
- [ ] Task 1233: Implement dashboard rendering optimization
- [ ] Task 1234: Implement TUI rendering optimization
- [ ] Task 1235: Implement memory usage optimization
- [ ] Task 1236: Implement CPU usage optimization
- [ ] Task 1237: Implement disk usage optimization
- [ ] Task 1238: Implement network bandwidth optimization
- [ ] Task 1239: Implement startup time optimization
- [ ] Task 1240: Implement shutdown time optimization

### 17.2 Cost Optimization (Tasks 1241-1260)

**Goal:** Minimize cost per test run.

- [ ] Task 1241: Implement cost tracking per test run
- [ ] Task 1242: Implement cost tracking per agent
- [ ] Task 1243: Implement cost tracking per model
- [ ] Task 1244: Implement cost tracking per browser
- [ ] Task 1245: Implement cost tracking per device
- [ ] Task 1246: Implement cost tracking per project
- [ ] Task 1247: Implement cost tracking per team
- [ ] Task 1248: Implement cost tracking per tenant
- [ ] Task 1249: Implement cost budget alerts
- [ ] Task 1250: Implement cost optimization suggestions
- [ ] Task 1251: Implement cheaper model routing for simple tasks
- [ ] Task 1252: Implement flash mode for token savings
- [ ] Task 1253: Implement context compaction for token savings
- [ ] Task 1254: Implement prompt caching for token savings
- [ ] Task 1255: Implement action caching for LLM call savings
- [ ] Task 1256: Implement result caching for test run savings
- [ ] Task 1257: Implement parallel execution for time savings
- [ ] Task 1258: Implement incremental testing for change-based savings
- [ ] Task 1259: Implement test prioritization for risk-based savings
- [ ] Task 1260: Implement test deduplication for redundancy savings

---

## Part 18: Monitoring & Alerting (Tasks 1261-1300)

### 18.1 Observability (Tasks 1261-1280)

**Goal:** Comprehensive monitoring with structured logging, tracing, metrics.

- [ ] Task 1261: Implement structured logging for all packages
- [ ] Task 1262: Implement distributed tracing across packages
- [ ] Task 1263: Implement metrics collection for all operations
- [ ] Task 1264: Implement log aggregation
- [ ] Task 1265: Implement trace aggregation
- [ ] Task 1266: Implement metric aggregation
- [ ] Task 1267: Implement log search
- [ ] Task 1268: Implement trace search
- [ ] Task 1269: Implement metric search
- [ ] Task 1270: Implement log visualization
- [ ] Task 1271: Implement trace visualization
- [ ] Task 1272: Implement metric visualization
- [ ] Task 1273: Implement log export
- [ ] Task 1274: Implement trace export
- [ ] Task 1275: Implement metric export
- [ ] Task 1276: Implement log retention policy
- [ ] Task 1277: Implement trace retention policy
- [ ] Task 1278: Implement metric retention policy
- [ ] Task 1279: Implement log archival
- [ ] Task 1280: Implement trace archival

### 18.2 Alerting (Tasks 1281-1300)

**Goal:** Proactive alerting for failures and anomalies.

- [ ] Task 1281: Implement failure alerting
- [ ] Task 1282: Implement performance alerting
- [ ] Task 1283: Implement cost alerting
- [ ] Task 1284: Implement quality alerting
- [ ] Task 1285: Implement security alerting
- [ ] Task 1286: Implement availability alerting
- [ ] Task 1287: Implement anomaly detection
- [ ] Task 1288: Implement trend detection
- [ ] Task 1289: Implement regression detection
- [ ] Task 1290: Implement improvement detection
- [ ] Task 1291: Implement alert routing
- [ ] Task 1292: Implement alert deduplication
- [ ] Task 1293: Implement alert escalation
- [ ] Task 1294: Implement alert suppression
- [ ] Task 1295: Implement alert scheduling
- [ ] Task 1296: Implement alert templates
- [ ] Task 1297: Implement alert testing
- [ ] Task 1298: Implement alert history
- [ ] Task 1299: Implement alert analytics
- [ ] Task 1300: Implement alert dashboard

---

## Part 19: Deployment & Operations (Tasks 1301-1340)

### 19.1 Deployment (Tasks 1301-1320)

**Goal:** Easy deployment across environments.

- [ ] Task 1301: Implement Docker image build
- [ ] Task 1302: Implement Docker Compose configuration
- [ ] Task 1303: Implement Kubernetes deployment
- [ ] Task 1304: Implement Helm chart
- [ ] Task 1305: Implement Terraform module
- [ ] Task 1306: Implement AWS deployment
- [ ] Task 1307: Implement GCP deployment
- [ ] Task 1308: Implement Azure deployment
- [ ] Task 1309: Implement Vercel deployment
- [ ] Task 1310: Implement Railway deployment
- [ ] Task 1311: Implement Fly.io deployment
- [ ] Task 1312: Implement Cloudflare Workers deployment
- [ ] Task 1313: Implement edge deployment
- [ ] Task 1314: Implement serverless deployment
- [ ] Task 1315: Implement container orchestration
- [ ] Task 1316: Implement auto-scaling
- [ ] Task 1317: Implement load balancing
- [ ] Task 1318: Implement health checks
- [ ] Task 1319: Implement readiness probes
- [ ] Task 1320: Implement liveness probes

### 19.2 Operations (Tasks 1321-1340)

**Goal:** Reliable operations in production.

- [ ] Task 1321: Implement configuration management
- [ ] Task 1322: Implement secret management
- [ ] Task 1323: Implement environment management
- [ ] Task 1324: Implement feature flags
- [ ] Task 1325: Implement canary deployments
- [ ] Task 1326: Implement blue-green deployments
- [ ] Task 1327: Implement rolling deployments
- [ ] Task 1328: Implement zero-downtime deployments
- [ ] Task 1329: Implement rollback procedures
- [ ] Task 1330: Implement disaster recovery
- [ ] Task 1331: Implement backup procedures
- [ ] Task 1332: Implement restore procedures
- [ ] Task 1333: Implement migration procedures
- [ ] Task 1334: Implement upgrade procedures
- [ ] Task 1335: Implement downgrade procedures
- [ ] Task 1336: Implement maintenance mode
- [ ] Task 1337: Implement graceful shutdown
- [ ] Task 1338: Implement graceful startup
- [ ] Task 1339: Implement operational runbooks
- [ ] Task 1340: Implement incident response procedures

---

## Part 20: Success Metrics & Verification (Tasks 1341-1360)

### 20.1 Success Metrics (Tasks 1341-1350)

**Goal:** Measurable success criteria.

- [ ] Task 1341: Define Effect-TS adoption metric: 36/36 packages
- [ ] Task 1342: Define real agent loop metric: full LLM-driven loop
- [ ] Task 1343: Define diff-aware test plan metric: LLM-enhanced AST analysis
- [ ] Task 1344: Define multi-tree DOM metric: DOM + Snapshot + AX
- [ ] Task 1345: Define structured thinking metric: AgentBrain output schema compliance
- [ ] Task 1346: Define accessibility metric: WCAG violations caught
- [ ] Task 1347: Define performance metric: Web Vitals accuracy
- [ ] Task 1348: Define stability detection metric: flaky test reduction rate
- [ ] Task 1349: Define CI mode metric: CI integration tests pass
- [ ] Task 1350: Define token efficiency metric: <$0.50 per test run

### 20.2 Verification (Tasks 1351-1360)

**Goal:** Verify all tasks are complete and working.

- [ ] Task 1351: Run `pnpm check` — format, lint, typecheck
- [ ] Task 1352: Run `pnpm test` — all unit tests pass
- [ ] Task 1353: Run `pnpm test:integration` — all integration tests pass
- [ ] Task 1354: Run `pnpm test:e2e` — all E2E tests pass
- [ ] Task 1355: Run `pnpm build` — all packages build
- [ ] Task 1356: Run `inspect test` on sample project
- [ ] Task 1357: Run `inspect pr` on sample PR
- [ ] Task 1358: Run `inspect a11y` on sample site
- [ ] Task 1359: Run `inspect lighthouse` on sample site
- [ ] Task 1360: Run full autonomous test cycle with zero human intervention

---

## Execution Strategy

### Phase 1: Foundation (Weeks 1-4)

- Tasks 1-120: Effect-TS migration across all packages
- Tasks 121-220: Real agent loop implementation
- **Deliverable:** All packages use Effect-TS, real agent loop replaces simulation-mode

### Phase 2: Browser Understanding (Weeks 5-8)

- Tasks 221-340: Multi-tree DOM, vision-first, stability detection
- Tasks 341-400: Memory and state management
- **Deliverable:** Comprehensive browser understanding with vision + DOM fusion

### Phase 3: Intelligence (Weeks 9-12)

- Tasks 401-480: Diff-aware test planning
- Tasks 481-580: Evaluation and quality scoring
- **Deliverable:** Intelligent test plans with automated evaluation

### Phase 4: Quality & Safety (Weeks 13-16)

- Tasks 581-680: Accessibility and performance auditing
- Tasks 681-760: Safety and reliability
- **Deliverable:** Comprehensive quality audits with safety guardrails

### Phase 5: Scale & Automation (Weeks 17-20)

- Tasks 761-860: CI mode and parallel execution
- Tasks 861-920: Session recording and replay
- **Deliverable:** Parallel execution at scale with full observability

### Phase 6: Self-Improvement (Weeks 21-24)

- Tasks 921-980: Automated self-improvement loop
- Tasks 981-1020: TUI state flow and UX
- **Deliverable:** Self-improving agent with world-class UX

### Phase 7: Integration & Polish (Weeks 25-28)

- Tasks 1021-1080: MCP server and external integrations
- Tasks 1081-1140: Testing infrastructure
- **Deliverable:** Full integration ecosystem with comprehensive tests

### Phase 8: Enterprise & Operations (Weeks 29-32)

- Tasks 1141-1220: Documentation, enterprise, security
- Tasks 1221-1300: Performance, monitoring, alerting
- **Deliverable:** Enterprise-ready with full observability

### Phase 9: Launch (Weeks 33-36)

- Tasks 1301-1360: Deployment, operations, verification
- **Deliverable:** Production-ready world-class testing infrastructure

---

---

## Part 21: OSS Innovations - Vision-First Understanding (Tasks 1361-1420)

**Source**: Skyvern, Stagehand, browser-use, Shortest
**Goal**: Combine screenshots with DOM for richer LLM context, coordinate-based grounding.

### 21.1 Annotated Screenshots (Tasks 1361-1390)

- [ ] Task 1361: Create `packages/browser/src/vision/annotated-screenshot.ts`
- [ ] Task 1362: Implement element bounding box detection
- [ ] Task 1363: Implement bounding box overlay on screenshots
- [ ] Task 1364: Assign numeric IDs to interactive elements
- [ ] Task 1365: Draw numbered labels on screenshot overlay
- [ ] Task 1366: Support different colors for different element types
- [ ] Task 1367: Support transparency for overlay readability
- [ ] Task 1368: Generate element ID → selector mapping
- [ ] Task 1369: Generate element ID → coordinates mapping
- [ ] Task 1370: Handle overlapping elements in annotation
- [ ] Task 1371: Implement z-index aware overlay
- [ ] Task 1372: Implement viewport-aware annotation (only visible elements)
- [ ] Task 1373: Implement scroll-aware annotation (mark off-screen elements)
- [ ] Task 1374: Support hover state screenshots
- [ ] Task 1375: Support focus state screenshots
- [ ] Task 1376: Support click state screenshots
- [ ] Task 1377: Implement before/after action screenshots
- [ ] Task 1378: Implement screenshot diff highlighting
- [ ] Task 1379: Export annotated screenshot for LLM
- [ ] Task 1380: Export annotated screenshot for debugging

### 21.2 Coordinate-Based Interaction (Tasks 1381-1400)

- [ ] Task 1381: Create `packages/browser/src/vision/coordinate-interaction.ts`
- [ ] Task 1382: Implement coordinate extraction from annotated screenshot
- [ ] Task 1383: Implement coordinate → element mapping
- [ ] Task 1384: Implement coordinate-based click
- [ ] Task 1385: Implement coordinate-based double-click
- [ ] Task 1386: Implement coordinate-based right-click
- [ ] Task 1387: Implement coordinate-based drag
- [ ] Task 1388: Implement coordinate-based scroll
- [ ] Task 1389: Implement coordinate-based type
- [ ] Task 1390: Handle device pixel ratio in coordinate mapping
- [ ] Task 1391: Handle iframe coordinate offsets
- [ ] Task 1392: Handle scroll position in coordinate mapping
- [ ] Task 1393: Implement coordinate fallback to selector
- [ ] Task 1394: Implement CUA (Computer Use API) mode for OpenAI
- [ ] Task 1395: Implement CUA mode for Anthropic
- [ ] Task 1396: Support coordinate-only mode (no DOM)
- [ ] Task 1397: Support hybrid mode (coordinates + DOM)
- [ ] Task 1398: Implement coordinate validation
- [ ] Task 1399: Implement coordinate bounds checking
- [ ] Task 1400: Implement coordinate hit testing

### 21.3 Vision-First Page Understanding (Tasks 1401-1420)

- [ ] Task 1401: Create `packages/browser/src/vision/page-understanding.ts`
- [ ] Task 1402: Implement vision-only context mode
- [ ] Task 1403: Implement vision+DOM context mode
- [ ] Task 1404: Implement vision+AX context mode
- [ ] Task 1405: Implement full fusion mode (vision + DOM + AX)
- [ ] Task 1406: Support screenshot-only LLM calls
- [ ] Task 1407: Support dual-modality prompts (image + text)
- [ ] Task 1408: Implement visual element detection fallback
- [ ] Task 1409: Implement visual form field detection
- [ ] Task 1410: Implement visual button detection
- [ ] Task 1411: Implement visual link detection
- [ ] Task 1412: Implement visual image detection
- [ ] Task 1413: Implement visual text detection
- [ ] Task 1414: Implement visual captcha detection
- [ ] Task 1415: Implement visual popup detection
- [ ] Task 1416: Implement visual overlay detection
- [ ] Task 1417: Implement visual loading state detection
- [ ] Task 1418: Implement visual error state detection
- [ ] Task 1419: Implement visual success state detection
- [ ] Task 1420: Implement visual comparison between states

---

## Part 22: OSS Innovations - Speculative Execution (Tasks 1421-1470)

**Source**: Skyvern, browser-use
**Goal**: Pre-compute next actions while current executes for 30-40% speedup.

### 22.1 Speculative Planning Engine (Tasks 1421-1450)

- [ ] Task 1421: Create `packages/agent/src/speculative-planner.ts`
- [ ] Task 1422: Implement speculative plan data structure
- [ ] Task 1423: Implement speculative state tracking
- [ ] Task 1424: Implement parallel action pre-computation
- [ ] Task 1425: Implement parallel LLM calls during execution
- [ ] Task 1426: Implement next-step prediction
- [ ] Task 1427: Implement page state prediction
- [ ] Task 1428: Implement DOM prediction after action
- [ ] Task 1429: Implement screenshot prediction after action
- [ ] Task 1430: Implement action validity checking
- [ ] Task 1431: Implement speculative result caching
- [ ] Task 1432: Implement speculative cache invalidation
- [ ] Task 1433: Implement speculative cache expiration
- [ ] Task 1434: Implement speculative hit rate tracking
- [ ] Task 1435: Implement speculative miss recovery
- [ ] Task 1436: Implement speculative timeout handling
- [ ] Task 1437: Implement speculative cancellation on state change
- [ ] Task 1438: Implement speculative result merging
- [ ] Task 1439: Implement speculative confidence scoring
- [ ] Task 1440: Implement speculative fallback on low confidence

### 22.2 Parallel Execution Pipeline (Tasks 1441-1470)

- [ ] Task 1441: Create `packages/agent/src/parallel-pipeline.ts`
- [ ] Task 1442: Implement concurrent DOM collection
- [ ] Task 1443: Implement concurrent screenshot capture
- [ ] Task 1444: Implement concurrent LLM preparation
- [ ] Task 1445: Implement concurrent LLM calling
- [ ] Task 1446: Implement result streaming
- [ ] Task 1447: Implement partial result handling
- [ ] Task 1448: Implement out-of-order result handling
- [ ] Task 1449: Implement result aggregation
- [ ] Task 1450: Implement result validation
- [ ] Task 1451: Implement result deduplication
- [ ] Task 1452: Implement result prioritization
- [ ] Task 1453: Implement result merging
- [ ] Task 1454: Implement pipeline stage tracking
- [ ] Task 1455: Implement pipeline stage timeout
- [ ] Task 1456: Implement pipeline stage retry
- [ ] Task 1457: Implement pipeline stage failure handling
- [ ] Task 1458: Implement pipeline performance metrics
- [ ] Task 1459: Implement pipeline bottleneck detection
- [ ] Task 1460: Implement pipeline auto-tuning
- [ ] Task 1461: Implement pipeline resource allocation
- [ ] Task 1462: Implement pipeline backpressure
- [ ] Task 1463: Implement pipeline load balancing
- [ ] Task 1464: Implement pipeline queue management
- [ ] Task 1465: Implement pipeline worker pool
- [ ] Task 1466: Implement pipeline worker scaling
- [ ] Task 1467: Implement pipeline worker recovery
- [ ] Task 1468: Implement pipeline observability
- [ ] Task 1469: Implement pipeline tracing
- [ ] Task 1470: Implement pipeline cost tracking

---

## Part 23: OSS Innovations - Watchdog System (Tasks 1471-1530)

**Source**: browser-use
**Goal**: Parallel monitors for captcha, popups, crashes, downloads.

### 23.1 Watchdog Architecture (Tasks 1471-1490)

- [ ] Task 1471: Create `packages/agent-watchdogs/src/watchdog-system.ts`
- [ ] Task 1472: Implement watchdog base class
- [ ] Task 1473: Implement watchdog lifecycle (start, stop, pause)
- [ ] Task 1474: Implement watchdog configuration
- [ ] Task 1475: Implement parallel watchdog execution
- [ ] Task 1476: Implement watchdog result aggregation
- [ ] Task 1477: Implement watchdog event publishing
- [ ] Task 1478: Implement watchdog priority handling
- [ ] Task 1479: Implement watchdog conflict resolution
- [ ] Task 1480: Implement watchdog cooldown periods
- [ ] Task 1481: Implement watchdog rate limiting
- [ ] Task 1482: Implement watchdog health checks
- [ ] Task 1483: Implement watchdog restart on failure
- [ ] Task 1484: Implement watchdog observability
- [ ] Task 1485: Implement watchdog metrics
- [ ] Task 1486: Implement watchdog alerts
- [ ] Task 1487: Implement watchdog logging
- [ ] Task 1488: Implement watchdog tracing
- [ ] Task 1489: Implement watchdog testing utilities
- [ ] Task 1490: Implement watchdog simulation mode

### 23.2 Captcha Detection (Tasks 1491-1505)

- [ ] Task 1491: Create `packages/agent-watchdogs/src/captcha-watchdog.ts`
- [ ] Task 1492: Implement image captcha detection
- [ ] Task 1493: Implement reCAPTCHA detection
- [ ] Task 1494: Implement hCaptcha detection
- [ ] Task 1495: Implement Cloudflare Turnstile detection
- [ ] Task 1496: Implement CAPTCHA provider identification
- [ ] Task 1497: Implement CAPTCHA difficulty estimation
- [ ] Task 1498: Implement CAPTCHA solving integration
- [ ] Task 1499: Implement 2Captcha integration
- [ ] Task 1500: Implement Anti-Captcha integration
- [ ] Task 1501: Implement custom CAPTCHA solver hook
- [ ] Task 1502: Implement CAPTCHA pause and notify
- [ ] Task 1503: Implement CAPTCHA auto-retry
- [ ] Task 1504: Implement CAPTCHA bypass strategies
- [ ] Task 1505: Implement CAPTCHA detection confidence

### 23.3 Popup and Overlay Handling (Tasks 1506-1520)

- [ ] Task 1506: Create `packages/agent-watchdogs/src/popup-watchdog.ts`
- [ ] Task 1507: Implement modal detection
- [ ] Task 1508: Implement alert detection
- [ ] Task 1509: Implement confirm dialog detection
- [ ] Task 1510: Implement prompt dialog detection
- [ ] Task 1511: Implement cookie consent detection
- [ ] Task 1512: Implement newsletter signup detection
- [ ] Task 1513: Implement advertisement popup detection
- [ ] Task 1514: Implement chat widget detection
- [ ] Task 1515: Implement overlay detection
- [ ] Task 1516: Implement popup auto-dismiss
- [ ] Task 1517: Implement popup handling strategies
- [ ] Task 1518: Implement popup priority ordering
- [ ] Task 1519: Implement popup escalation
- [ ] Task 1520: Implement popup logging

### 23.4 Crash and Download Monitoring (Tasks 1521-1530)

- [ ] Task 1521: Create `packages/agent-watchdogs/src/crash-watchdog.ts`
- [ ] Task 1522: Implement page crash detection
- [ ] Task 1523: Implement browser crash detection
- [ ] Task 1524: Implement out-of-memory detection
- [ ] Task 1525: Implement infinite loop detection
- [ ] Task 1526: Implement crash recovery strategies
- [ ] Task 1527: Create `packages/agent-watchdogs/src/download-watchdog.ts`
- [ ] Task 1528: Implement download start detection
- [ ] Task 1529: Implement download progress tracking
- [ ] Task 1530: Implement download completion handling

---

## Part 24: OSS Innovations - Natural Language API (Tasks 1531-1580)

**Source**: Shortest, Stagehand, browser-use
**Goal**: Simple `inspect("Login")` API for natural language testing.

### 24.1 NL Test API (Tasks 1531-1560)

- [ ] Task 1531: Create `packages/sdk/src/natural-language.ts`
- [ ] Task 1532: Implement `inspect.natural()` API
- [ ] Task 1533: Implement intent parsing from natural language
- [ ] Task 1534: Implement goal extraction
- [ ] Task 1535: Implement action inference
- [ ] Task 1536: Implement automatic step generation from NL
- [ ] Task 1537: Implement NL to test plan conversion
- [ ] Task 1538: Implement NL assertion parsing
- [ ] Task 1539: Implement NL expectation extraction
- [ ] Task 1540: Implement NL context understanding
- [ ] Task 1541: Implement NL ambiguity detection
- [ ] Task 1542: Implement NL clarification requests
- [ ] Task 1543: Implement NL confirmation prompts
- [ ] Task 1544: Support conversational test building
- [ ] Task 1545: Support one-shot test definition
- [ ] Task 1546: Support multi-step NL instructions
- [ ] Task 1547: Support conditional NL instructions
- [ ] Task 1548: Support loop NL instructions
- [ ] Task 1549: Support data-driven NL instructions
- [ ] Task 1550: Implement NL test templates
- [ ] Task 1551: Implement NL test reuse
- [ ] Task 1552: Implement NL test composition
- [ ] Task 1553: Implement NL test inheritance
- [ ] Task 1554: Implement NL test parameterization
- [ ] Task 1555: Implement NL test data binding
- [ ] Task 1556: Implement NL test fixtures
- [ ] Task 1557: Implement NL test hooks
- [ ] Task 1558: Implement NL test tagging
- [ ] Task 1559: Implement NL test filtering
- [ ] Task 1560: Implement NL test organization

### 24.2 NL to Code Generation (Tasks 1561-1580)

- [ ] Task 1561: Create `packages/sdk/src/nl-to-code.ts`
- [ ] Task 1562: Implement NL to Playwright code generation
- [ ] Task 1563: Implement NL to Inspect code generation
- [ ] Task 1564: Implement code generation confidence scoring
- [ ] Task 1565: Implement generated code validation
- [ ] Task 1566: Implement generated code execution
- [ ] Task 1567: Implement generated code debugging
- [ ] Task 1568: Implement generated code refinement
- [ ] Task 1569: Implement generated code persistence
- [ ] Task 1570: Implement generated code versioning
- [ ] Task 1571: Implement generated code review
- [ ] Task 1572: Implement human approval for generated code
- [ ] Task 1573: Implement incremental code generation
- [ ] Task 1574: Implement interactive code generation
- [ ] Task 1575: Implement code generation from examples
- [ ] Task 1576: Implement code generation from recordings
- [ ] Task 1577: Implement code generation best practices
- [ ] Task 1578: Implement code generation patterns
- [ ] Task 1579: Implement code generation templates
- [ ] Task 1580: Implement code generation documentation

---

## Part 25: OSS Innovations - Multi-Agent Orchestration (Tasks 1581-1640)

**Source**: OpenAI Agents SDK, AutoGen, Langflow
**Goal**: Agent handoffs, delegation, and multi-agent workflows.

### 25.1 Multi-Agent System (Tasks 1581-1610)

- [ ] Task 1581: Create `packages/agent/src/multi-agent/orchestrator.ts`
- [ ] Task 1582: Implement agent definition DSL
- [ ] Task 1583: Implement agent role definition
- [ ] Task 1584: Implement agent capabilities definition
- [ ] Task 1585: Implement agent constraints definition
- [ ] Task 1586: Implement agent registry
- [ ] Task 1587: Implement agent discovery
- [ ] Task 1588: Implement agent lifecycle management
- [ ] Task 1589: Implement agent communication protocol
- [ ] Task 1590: Implement agent message passing
- [ ] Task 1591: Implement agent shared context
- [ ] Task 1592: Implement agent state sharing
- [ ] Task 1593: Implement agent handoff protocol
- [ ] Task 1594: Implement agent delegation
- [ ] Task 1595: Implement agent collaboration
- [ ] Task 1596: Implement agent competition
- [ ] Task 1597: Implement agent negotiation
- [ ] Task 1598: Implement agent conflict resolution
- [ ] Task 1599: Implement agent priority system
- [ ] Task 1600: Implement agent scheduling
- [ ] Task 1601: Implement agent resource allocation
- [ ] Task 1602: Implement agent load balancing
- [ ] Task 1603: Implement agent failover
- [ ] Task 1604: Implement agent recovery
- [ ] Task 1605: Implement agent observability
- [ ] Task 1606: Implement agent metrics
- [ ] Task 1607: Implement agent tracing
- [ ] Task 1608: Implement agent cost tracking
- [ ] Task 1609: Implement agent testing utilities
- [ ] Task 1610: Implement agent simulation mode

### 25.2 Agent Patterns (Tasks 1611-1640)

- [ ] Task 1611: Implement supervisor agent pattern
- [ ] Task 1612: Implement worker agent pattern
- [ ] Task 1613: Implement specialist agent pattern
- [ ] Task 1614: Implement router agent pattern
- [ ] Task 1615: Implement aggregator agent pattern
- [ ] Task 1616: Implement evaluator agent pattern
- [ ] Task 1617: Implement planner agent pattern
- [ ] Task 1618: Implement executor agent pattern
- [ ] Task 1619: Implement monitor agent pattern
- [ ] Task 1620: Implement human-in-the-loop agent
- [ ] Task 1621: Implement agent-as-tool pattern
- [ ] Task 1622: Implement agent tool calling
- [ ] Task 1623: Implement agent guardrails
- [ ] Task 1624: Implement agent input validation
- [ ] Task 1625: Implement agent output validation
- [ ] Task 1626: Implement agent safety checks
- [ ] Task 1627: Implement agent rate limiting
- [ ] Task 1628: Implement agent quota management
- [ ] Task 1629: Implement agent audit logging
- [ ] Task 1630: Implement agent session management
- [ ] Task 1631: Implement agent conversation history
- [ ] Task 1632: Implement agent context management
- [ ] Task 1633: Implement agent memory sharing
- [ ] Task 1634: Implement agent knowledge base
- [ ] Task 1635: Implement agent learning
- [ ] Task 1636: Implement agent adaptation
- [ ] Task 1637: Implement agent self-improvement
- [ ] Task 1638: Implement agent feedback loops
- [ ] Task 1639: Implement agent A/B testing
- [ ] Task 1640: Implement agent experimentation

---

## Part 26: OSS Innovations - Self-Healing System (Tasks 1641-1700)

**Source**: Stagehand, Skyvern, browser-use
**Goal**: Fresh context + re-plan on failure, not just retry.

### 26.1 Self-Healing Architecture (Tasks 1641-1670)

- [ ] Task 1641: Create `packages/agent/src/self-healing/healer.ts`
- [ ] Task 1642: Implement failure detection
- [ ] Task 1643: Implement failure classification
- [ ] Task 1644: Implement failure severity assessment
- [ ] Task 1645: Implement healing strategy selection
- [ ] Task 1646: Implement healing strategy: fresh snapshot
- [ ] Task 1647: Implement healing strategy: re-plan
- [ ] Task 1648: Implement healing strategy: alternative approach
- [ ] Task 1649: Implement healing strategy: fall back to simpler action
- [ ] Task 1650: Implement healing strategy: escalate to human
- [ ] Task 1651: Implement healing execution
- [ ] Task 1652: Implement healing validation
- [ ] Task 1653: Implement healing success tracking
- [ ] Task 1654: Implement healing failure tracking
- [ ] Task 1655: Implement healing learning
- [ ] Task 1656: Implement healing pattern recognition
- [ ] Task 1657: Implement healing pattern application
- [ ] Task 1658: Implement healing optimization
- [ ] Task 1659: Implement healing cost tracking
- [ ] Task 1660: Implement healing time tracking
- [ ] Task 1661: Implement healing effectiveness metrics
- [ ] Task 1662: Implement healing escalation
- [ ] Task 1663: Implement healing cooldown
- [ ] Task 1664: Implement healing rate limiting
- [ ] Task 1665: Implement healing observability
- [ ] Task 1666: Implement healing tracing
- [ ] Task 1667: Implement healing reporting
- [ ] Task 1668: Implement healing alerting
- [ ] Task 1669: Implement healing testing
- [ ] Task 1670: Implement healing simulation

### 26.2 Action Caching (Tasks 1671-1700)

- [ ] Task 1671: Create `packages/agent/src/self-healing/action-cache.ts`
- [ ] Task 1672: Implement action hash generation
- [ ] Task 1673: Implement instruction+DOM hash key
- [ ] Task 1674: Implement instruction+URL hash key
- [ ] Task 1675: Implement cache storage
- [ ] Task 1676: Implement cache retrieval
- [ ] Task 1677: Implement cache hit detection
- [ ] Task 1678: Implement cache miss handling
- [ ] Task 1679: Implement cache validation
- [ ] Task 1680: Implement cache invalidation on DOM change
- [ ] Task 1681: Implement cache invalidation on URL change
- [ ] Task 1682: Implement cache expiration
- [ ] Task 1683: Implement cache size limits
- [ ] Task 1684: Implement cache LRU eviction
- [ ] Task 1685: Implement cache persistence
- [ ] Task 1686: Implement cache loading
- [ ] Task 1687: Implement cache warming
- [ ] Task 1688: Implement cache statistics
- [ ] Task 1689: Implement cache hit rate tracking
- [ ] Task 1690: Implement cache cost savings tracking
- [ ] Task 1691: Implement cache replay
- [ ] Task 1692: Implement cache fallback
- [ ] Task 1693: Implement cache conflict resolution
- [ ] Task 1694: Implement cache versioning
- [ ] Task 1695: Implement cache migration
- [ ] Task 1696: Implement cache backup
- [ ] Task 1697: Implement cache restore
- [ ] Task 1698: Implement cache testing
- [ ] Task 1699: Implement cache observability
- [ ] Task 1700: Implement cache optimization

---

## OSS Reference Summary

| Repository | Language | Category | Key Pattern |
|------------|----------|----------|-------------|
| browser-use | Python | Agent | 3-phase loop, watchdogs, action caching |
| Skyvern | Python | Agent | Vision+DOM fusion, speculative planning |
| Stagehand | TypeScript | Agent | Hybrid snapshot, self-healing, act/extract/observe |
| OpenAI Agents SDK | Python | Framework | Handoffs, guardrails, human-in-loop |
| AutoGen | Python | Framework | Multi-agent orchestration |
| Langflow | Python | Workflow | Visual builder |
| Playwright MCP | TypeScript | Browser | Accessibility-only mode |
| rrweb | TypeScript | Recording | Session replay |
| Lighthouse | JavaScript | Quality | Performance audits, log-normal scoring |
| E2B | Python/TS | Infrastructure | Sandboxed execution |
| QA Wolf | TypeScript | Testing | Record → Code |
| Shortest | TypeScript | Testing | NL tests, caching |

---

## Updated Task Count: 1,700 tasks across 26 parts, 9 phases

## OSS-Informed Priority Adjustments

### P0 (Critical) - Add from OSS analysis:
- Vision-first understanding (Part 21) - Skyvern pattern
- Speculative execution (Part 22) - Skyvern pattern
- Self-healing system (Part 26) - Stagehand pattern
- Action caching (Part 26) - browser-use pattern

### P1 (High) - Add from OSS analysis:
- Watchdog system (Part 23) - browser-use pattern
- Natural language API (Part 24) - Shortest pattern
- Multi-agent orchestration (Part 25) - OpenAI Agents SDK pattern

### Existing Priorities (unchanged):
- Part 1: Effect-TS migration (P0)
- Part 2: Real agent loop (P0)
- Part 3: Browser understanding (P0)
- Part 4: Memory management (P1)
- Part 5: Diff-aware planning (P1)
- Part 6: Evaluation (P1)
- Part 7: Accessibility/Performance (P1)
- Part 8: Safety (P1)
- Part 9: CI/Parallel (P2)
- Part 10: Session recording (P2)
- Part 11: Self-improvement (P2)
- Part 12-20: UI, integrations, docs (P2-P3)

## Total Task Count: 1,700 tasks across 26 parts, 9 phases

## Key Dependencies & Ordering

- **Phase 1 must complete before Phase 2** — Effect-TS foundation enables all other work
- **Phase 2 must complete before Phase 3** — browser understanding enables intelligent planning
- **Phase 3 must complete before Phase 4** — evaluation requires planning
- **Phase 4 must complete before Phase 5** — safety enables scale
- **Phase 5 must complete before Phase 6** — scale enables self-improvement
- **Phases 7-9 can overlap with Phase 6** — documentation, testing, deployment are parallel tracks

## Risk Mitigation

1. **Effect-TS migration risk:** Migrate package-by-package, run `pnpm check` after each, keep simulation-mode as fallback until real implementation is wired
2. **LLM non-determinism risk:** Use structured output schemas, retry with backoff, deterministic prompts
3. **Token cost risk:** Prompt caching (freeze mask), context compaction, flash mode, cheaper models for extraction
4. **Browser state leak risk:** Fresh context per test, cookie isolation, cleanup finalizers
5. **DOM change risk:** Multi-tree DOM collection, element hashing, fallback locators
6. **Context window risk:** Message compaction, step history summarization, checkpoint system
7. **Timeline risk:** Prioritize P0 components first, defer P2/P3 to post-MVP

---

## Part 14: Comprehensive OSS Repository Analysis

Deep analysis of 27 open-source repositories providing patterns, innovations, and reference implementations.

- Vision-first page understanding with annotated screenshots
- Speculative planning for parallel execution
- Rich prompt template library
- Visual workflow builder
- Captcha solving integration

---

### 3. Stagehand (TypeScript, $67M, 15K★)
**Key Innovations:**
- **act/extract/observe SDK pattern**
- **Hybrid DOM+A11y snapshot** merging for richer context
- **Act caching** by hash(instruction + URL)
- **Self-healing**: Fresh snapshot + new LLM call on failure
- **2-step actions** for complex interactions (dropdowns)
- **Inference vs Playwright** modes
- **CDP engine** for optimized low-level browser control
- **Zod schema validation** for structured extraction

**What's Missing in Inspect:**
- Hybrid DOM+A11y tree merging
- Act caching with URL hash
- Self-healing via fresh snapshot
- 2-step action pattern for complex UI
- Clean SDK pattern (act/extract/observe)

---

### 4. Shortest (TypeScript)
**Key Innovations:**
- **Natural language tests**: `shortest("Login")`
- **Test run caching**: Cache entire successful runs for replay
- **Coordinate-based CUA** (Computer Use API)
- **Claude-powered** with vision
- **Zero-config** testing
- **GitHub Actions integration**

**What's Missing in Inspect:**
- Natural language test API
- Test run caching for replay
- Coordinate-based interaction mode

---

## Tier 2: Browser Infrastructure

### 5. Playwright MCP (Microsoft Official)
**Key Innovations:**
- **Accessibility tree only** (no screenshots = cheap)
- **MCP protocol** for tool server communication
- **Structured tool definitions** for LLMs
- **Deterministic tool application**

**What's Missing in Inspect:**
- MCP server implementation (partial scaffold exists)
- Accessibility-tree-only mode for cost savings

---

### 6. Steel Browser (5K★)
**Key Innovations:**
- **Managed browser sessions**
- **Proxy rotation**
- **Anti-detection** mechanisms
- **Session persistence**
- **No LLM** (pure infrastructure)

**What's Missing in Inspect:**
- Session persistence across runs
- Proxy rotation infrastructure
- Anti-detection mechanisms

---

### 7. rrweb (TypeScript, 18K★)
**Key Innovations:**
- **Session recording** with DOM mutations
- **Replayer** with timeline scrubbing
- **rrweb-snapshot** for serialization
- **Incremental snapshots** for efficiency
- **Event-based architecture**
- **Player UI** with controls

**What's Missing in Inspect:**
- Full session recording integration
- Timeline-based replay viewer
- DOM mutation tracking

---

### 8. QA Wolf (TypeScript)
**Key Innovations:**
- **Record browser actions** → generate Playwright code
- **Auto-wait** for elements
- **Test attribute priority** (data-qa)
- **CI workflow generation**
- **Video recording** per test
- **Parallel test execution**

**What's Missing in Inspect:**
- Action recording → code generation
- Auto-wait mechanisms
- Video recording per test

---

## Tier 3: Agent Frameworks

### 9. OpenAI Agents SDK (Python)
**Key Innovations:**
- **Agent as tool** pattern
- **Handoffs** between agents
- **Guardrails** for safety checks
- **Human in the loop** mechanisms
- **Sessions** for conversation history
- **Tracing** for observability
- **Realtime agents** with voice
- **MCP server support**

**What's Missing in Inspect:**
- Agent handoff system
- Guardrails framework
- Human-in-the-loop checkpoints
- Built-in tracing integration
- Realtime/voice agent support

---

### 10. AutoGen (Microsoft, Python)
**Key Innovations:**
- **Multi-agent orchestration**
- **AgentChat** for conversation patterns
- **MCP workbench** integration
- **Agent-as-a-tool** pattern
- **Streaming responses**
- **Console UI** for debugging

**What's Missing in Inspect:**
- Multi-agent orchestration
- Agent chat patterns
- Streaming response handling

---

### 11. Langflow (Python, 50K★)
**Key Innovations:**
- **Visual workflow builder**
- **Source code access** for components
- **Interactive playground**
- **Multi-agent orchestration**
- **Deploy as API/MCP**
- **LangSmith/LangFuse observability**

**What's Missing in Inspect:**
- Visual workflow builder
- Component marketplace
- Interactive playground

---

### 12. E2B (Python/TypeScript, 15K★)
**Key Innovations:**
- **Sandboxed code execution**
- **Cloud sandbox infrastructure**
- **Code interpreter** SDK
- **Secure isolated environments**
- **Terraform deployment**

**What's Missing in Inspect:**
- Sandboxed code execution
- Secure environment isolation

---

## Tier 4: Specialized Tools

### 13. Anthropic Quickstarts
**Key Demos:**
- **Computer Use Demo**: Desktop control via Claude
- **Browser Tools API Demo**: Playwright-based browser automation
- **Autonomous Coding Agent**: Two-agent pattern (initializer + coding agent)
- **Customer Support Agent**: Knowledge base integration

**What's Missing in Inspect:**
- Desktop automation (not just browser)
- Two-agent coding pattern
- Knowledge base integration

---

### 14. LaVague (Python, 10K★)
**Key Innovations:**
- **WorldModel → ActionEngine → Driver** architecture
- **RAG-based element targeting** with XPath retrieval
- **Two-tier LLM**: Vision + Text models
- **Selenium/Playwright** driver abstraction

**What's Missing in Inspect:**
- RAG-based element retrieval
- Two-tier LLM architecture
- Driver abstraction layer

---

### 15. Zerostep
**Key Innovations:**
- **Lightweight Playwright plugin**
- **Remote server** for processing
- **CDP commands** returned from server
- **Minimal client footprint**

**What's Missing in Inspect:**
- Remote processing option
- Minimal client mode

---

### 16. GPT Engineer (Python, 60K★)
**Key Innovations:**
- **Natural language code generation**
- **Improvement mode** for existing code
- **Benchmark system** for agents
- **Template-based generation**

**What's Missing in Inspect:**
- Code generation from tests
- Benchmark framework

---

## Tier 5: Testing & Quality

### 17. Lighthouse (Google)
**Key Innovations:**
- **5-phase gatherer lifecycle**: beforePass → pass → afterPass → compute → audit
- **Computed artifacts** with memoization
- **Web Vitals**: FCP, LCP, CLS, INP, TTFB
- **Log-normal scoring** with p10/median control points
- **Trace processing** for performance analysis
- **Custom audit pipeline**

**What's Missing in Inspect:**
- Full 5-phase gatherer lifecycle
- Computed artifacts with memoization
- Complete Web Vitals implementation
- Log-normal scoring engine

---

### 18. Axe-Core
**Key Innovations:**
- **Rule → Check → Result** model
- **any/all/none** check composition
- **VirtualNode** for lazy evaluation
- **Impact levels**: minor, moderate, serious, critical
- **Failure summary** with remediation
- **Custom rule definitions**

**What's Missing in Inspect:**
- Rule/Check/Result tiered model
- Lazy virtual node evaluation
- Custom rule engine

---

### 19. Uffizzi
**Key Innovations:**
- **Ephemeral environments** per PR
- **Docker Compose support**
- **Kubernetes integration**
- **Preview deployments**

**What's Missing in Inspect:**
- Ephemeral environment provisioning
- PR preview environments

---

## Key Patterns to Adopt for Inspect

### 1. Agent Loop Architecture
```
Observe → Think → Act → Finalize
   ↓
AgentBrain: {evaluation, memory, next_goal}
```

**Repos**: browser-use, Skyvern, Stagehand

### 2. Hybrid Context Building
```
DOM Tree + Accessibility Tree + Screenshot + Network State
```

**Repos**: Stagehand, Skyvern, browser-use

### 3. Speculative Planning
```
Current Action Execution
        ↓
Next Step Pre-computation (parallel)
```

**Repos**: Skyvern, browser-use

### 4. Self-Healing Actions
```
Failure → Fresh Snapshot → New LLM Call → Retry
```

**Repos**: Stagehand, Skyvern

### 5. Action Caching
```
hash(instruction + DOM_state) → cached_action
```

**Repos**: browser-use, Stagehand, Shortest

### 6. Watchdog System
```
Parallel Monitors:
  - Captcha detector
  - Popup handler
  - Crash detector
  - Download tracker
```

**Repos**: browser-use

### 7. Multi-Agent Orchestration
```
Agent A → Handoff → Agent B
  ↓           ↓
Guardrails  Human-in-loop
```

**Repos**: OpenAI Agents SDK, AutoGen, Langflow

---

## Critical Gaps in Inspect

### HIGH PRIORITY

1. **Real Agent Loop** (Not Simulation)
   - Current: Simulation mode in orchestrator
   - Needed: Observe→Think→Act loop
   - Ref: browser-use, Skyvern

2. **Vision-First Understanding**
   - Current: DOM only
   - Needed: Screenshot + bounding boxes + DOM
   - Ref: Skyvern, Stagehand

3. **Speculative Planning**
   - Current: Sequential execution
   - Needed: Parallel next-step pre-computation
   - Ref: Skyvern

4. **Action Caching**
   - Current: None
   - Needed: Cache by instruction+DOM hash
   - Ref: browser-use, Stagehand

5. **Self-Healing**
   - Current: Basic retry
   - Needed: Fresh context + re-plan on failure
   - Ref: Stagehand

### MEDIUM PRIORITY

6. **Watchdog System**
   - Current: Basic error handling
   - Needed: Parallel monitors for captcha/popups
   - Ref: browser-use

7. **Guardrails Framework**
   - Current: Basic validation
   - Needed: Input/output safety checks
   - Ref: OpenAI Agents SDK

8. **Session Recording**
   - Current: Partial rrweb integration
   - Needed: Full replay with timeline
   - Ref: rrweb

9. **Natural Language Tests**
   - Current: Structured test plans
   - Needed: `inspect("Login")` API
   - Ref: Shortest

10. **Multi-Agent Orchestration**
    - Current: Single agent
    - Needed: Agent handoffs
    - Ref: OpenAI Agents SDK, AutoGen

### LOW PRIORITY

11. **Visual Workflow Builder**
    - Ref: Langflow, Skyvern

12. **MCP Server**
    - Current: Scaffold
    - Needed: Full implementation
    - Ref: Playwright MCP

13. **Code Generation from Recording**
    - Ref: QA Wolf

14. **Benchmark Framework**
    - Ref: GPT Engineer

---

## Recommendations for PLAN.md Updates

### Add New Sections:

1. **Vision-First Browser Understanding** (Tasks 900-950)
   - Annotated screenshots with element IDs
   - Bounding box overlays
   - Coordinate-based interaction

2. **Speculative Execution Engine** (Tasks 951-980)
   - Pre-compute next actions
   - Parallel LLM calls
   - Result caching

3. **Watchdog System** (Tasks 981-1010)
   - Captcha detection
   - Popup handling
   - Download tracking
   - Crash recovery

4. **Natural Language Test API** (Tasks 1011-1040)
   - `inspect.natural("...")` interface
   - Intent parsing
   - Automatic step generation

5. **Multi-Agent Orchestration** (Tasks 1041-1080)
   - Agent definition
   - Handoff protocols
   - Shared context

6. **Self-Healing System** (Tasks 1081-1110)
   - Failure detection
   - Fresh context acquisition
   - Re-planning

### Update Existing Sections:

- **Part 3 (Browser Understanding)**: Add vision-first tasks
- **Part 8 (Safety)**: Add watchdog tasks
- **Part 9 (CI Mode)**: Add action caching tasks

---

## Repository Reference Table

| Repository | Language | Stars | Category | Key Innovation |
|------------|----------|-------|----------|----------------|
| browser-use | Python | 78K | Agent | 3-phase loop, watchdogs |
| Skyvern | Python | 20K | Agent | Vision+DOM, speculative planning |
| Stagehand | TypeScript | 15K | Agent | Hybrid snapshot, self-healing |
| OpenAI Agents | Python | 25K | Framework | Handoffs, guardrails |
| AutoGen | Python | 35K | Framework | Multi-agent orchestration |
| Langflow | Python | 50K | Workflow | Visual builder |
| Playwright MCP | TypeScript | 5K | Browser | Accessibility-only mode |
| rrweb | TypeScript | 18K | Recording | Session replay |
| Lighthouse | JavaScript | 30K | Quality | Performance audits |
| E2B | Python/TS | 15K | Infrastructure | Sandboxed execution |
| QA Wolf | TypeScript | 5K | Testing | Record → Code |
| Shortest | TypeScript | 3K | Testing | NL tests, caching |

---

## Conclusion

Inspect has a solid foundation with 36 packages covering browser automation, git integration, accessibility, and visual regression. However, it lacks:

1. **Real agent loop** (simulation mode only)
2. **Vision-first understanding** (DOM only)
3. **Speculative planning** (sequential only)
4. **Action caching** (no caching)
5. **Self-healing** (basic retry only)

The OSS-REF repositories provide mature patterns for all these gaps. Priority should be:
1. Implement real agent loop (browser-use pattern)
2. Add vision-first understanding (Skyvern pattern)
3. Build speculative planning (Skyvern pattern)
4. Add action caching (Stagehand pattern)
5. Implement self-healing (Stagehand pattern)

---

## Part 15: Detailed Phase-by-Phase Implementation Guide

Extracted from archive/IMPLEMENTATION-PLAN.md — specific implementation steps for each phase.

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

---

## Appendix A: Complete Implementation Plan (from archive)

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

---

## Appendix B: Comprehensive OSS Repository Analysis (from archive)

# OSS-REF Analysis: Comprehensive Repository Review

**Date:** 2026-04-01
**Analyzed:** 27 repositories in OSS-REF/

---

## Executive Summary

After analyzing 27 open-source repositories, I've identified **key architectural patterns**, **missing features in Inspect**, and **innovations to adopt**. The OSS landscape reveals mature solutions for agent loops, browser automation, testing infrastructure, and multi-agent orchestration.

---

## Tier 1: Direct Competitors (AI Browser Agents)

### 1. browser-use (Python, 78K★)
**Key Innovations:**
- **3-phase step loop**: prepare_context → get_next_action → execute_actions
- **15+ LLM provider support** with unified interface
- **Loop detection** with action hashing and escalating nudges
- **Watchdog system**: parallel monitors for captcha, popups, crashes, downloads
- **Action caching** by hash(instruction + DOM state)
- **Dynamic action registry** with Pydantic models
- **Structured output** with AgentBrain (evaluation, memory, next_goal)
- **Cloud mode** with stealth browsers, proxy rotation
- **Multi-element interaction**: click, type, scroll, drag, upload, switch_tab

**What's Missing in Inspect:**
- Real agent loop (currently simulation-mode)
- Dynamic action union building
- Watchdog parallel monitoring system
- Escalating nudge injection
- Action caching by DOM state hash
- Structured AgentBrain output

---

### 2. Skyvern (Python, 20K★, $2.7M)
**Key Innovations:**
- **Vision+DOM fusion**: Annotated screenshots with bounding boxes overlaid on HTML
- **Speculative planning**: Pre-compute next step while current executes (30-40% faster)
- **80+ Jinja2 prompt templates** for different scenarios
- **REST API** with async job queue
- **Workflow system** with nodes and edges
- **Self-healing**: Re-plan on failure with fresh context
- **Captcha solving** integration
- **2FA/TOTP handling**

**What's Missing in Inspect:**
- Vision-first page understanding with annotated screenshots
- Speculative planning for parallel execution
- Rich prompt template library
- Visual workflow builder
- Captcha solving integration

---

### 3. Stagehand (TypeScript, $67M, 15K★)
**Key Innovations:**
- **act/extract/observe SDK pattern**
- **Hybrid DOM+A11y snapshot** merging for richer context
- **Act caching** by hash(instruction + URL)
- **Self-healing**: Fresh snapshot + new LLM call on failure
- **2-step actions** for complex interactions (dropdowns)
- **Inference vs Playwright** modes
- **CDP engine** for optimized low-level browser control
- **Zod schema validation** for structured extraction

**What's Missing in Inspect:**
- Hybrid DOM+A11y tree merging
- Act caching with URL hash
- Self-healing via fresh snapshot
- 2-step action pattern for complex UI
- Clean SDK pattern (act/extract/observe)

---

### 4. Shortest (TypeScript)
**Key Innovations:**
- **Natural language tests**: `shortest("Login")`
- **Test run caching**: Cache entire successful runs for replay
- **Coordinate-based CUA** (Computer Use API)
- **Claude-powered** with vision
- **Zero-config** testing
- **GitHub Actions integration**

**What's Missing in Inspect:**
- Natural language test API
- Test run caching for replay
- Coordinate-based interaction mode

---

## Tier 2: Browser Infrastructure

### 5. Playwright MCP (Microsoft Official)
**Key Innovations:**
- **Accessibility tree only** (no screenshots = cheap)
- **MCP protocol** for tool server communication
- **Structured tool definitions** for LLMs
- **Deterministic tool application**

**What's Missing in Inspect:**
- MCP server implementation (partial scaffold exists)
- Accessibility-tree-only mode for cost savings

---

### 6. Steel Browser (5K★)
**Key Innovations:**
- **Managed browser sessions**
- **Proxy rotation**
- **Anti-detection** mechanisms
- **Session persistence**
- **No LLM** (pure infrastructure)

**What's Missing in Inspect:**
- Session persistence across runs
- Proxy rotation infrastructure
- Anti-detection mechanisms

---

### 7. rrweb (TypeScript, 18K★)
**Key Innovations:**
- **Session recording** with DOM mutations
- **Replayer** with timeline scrubbing
- **rrweb-snapshot** for serialization
- **Incremental snapshots** for efficiency
- **Event-based architecture**
- **Player UI** with controls

**What's Missing in Inspect:**
- Full session recording integration
- Timeline-based replay viewer
- DOM mutation tracking

---

### 8. QA Wolf (TypeScript)
**Key Innovations:**
- **Record browser actions** → generate Playwright code
- **Auto-wait** for elements
- **Test attribute priority** (data-qa)
- **CI workflow generation**
- **Video recording** per test
- **Parallel test execution**

**What's Missing in Inspect:**
- Action recording → code generation
- Auto-wait mechanisms
- Video recording per test

---

## Tier 3: Agent Frameworks

### 9. OpenAI Agents SDK (Python)
**Key Innovations:**
- **Agent as tool** pattern
- **Handoffs** between agents
- **Guardrails** for safety checks
- **Human in the loop** mechanisms
- **Sessions** for conversation history
- **Tracing** for observability
- **Realtime agents** with voice
- **MCP server support**

**What's Missing in Inspect:**
- Agent handoff system
- Guardrails framework
- Human-in-the-loop checkpoints
- Built-in tracing integration
- Realtime/voice agent support

---

### 10. AutoGen (Microsoft, Python)
**Key Innovations:**
- **Multi-agent orchestration**
- **AgentChat** for conversation patterns
- **MCP workbench** integration
- **Agent-as-a-tool** pattern
- **Streaming responses**
- **Console UI** for debugging

**What's Missing in Inspect:**
- Multi-agent orchestration
- Agent chat patterns
- Streaming response handling

---

### 11. Langflow (Python, 50K★)
**Key Innovations:**
- **Visual workflow builder**
- **Source code access** for components
- **Interactive playground**
- **Multi-agent orchestration**
- **Deploy as API/MCP**
- **LangSmith/LangFuse observability**

**What's Missing in Inspect:**
- Visual workflow builder
- Component marketplace
- Interactive playground

---

### 12. E2B (Python/TypeScript, 15K★)
**Key Innovations:**
- **Sandboxed code execution**
- **Cloud sandbox infrastructure**
- **Code interpreter** SDK
- **Secure isolated environments**
- **Terraform deployment**

**What's Missing in Inspect:**
- Sandboxed code execution
- Secure environment isolation

---

## Tier 4: Specialized Tools

### 13. Anthropic Quickstarts
**Key Demos:**
- **Computer Use Demo**: Desktop control via Claude
- **Browser Tools API Demo**: Playwright-based browser automation
- **Autonomous Coding Agent**: Two-agent pattern (initializer + coding agent)
- **Customer Support Agent**: Knowledge base integration

**What's Missing in Inspect:**
- Desktop automation (not just browser)
- Two-agent coding pattern
- Knowledge base integration

---

### 14. LaVague (Python, 10K★)
**Key Innovations:**
- **WorldModel → ActionEngine → Driver** architecture
- **RAG-based element targeting** with XPath retrieval
- **Two-tier LLM**: Vision + Text models
- **Selenium/Playwright** driver abstraction

**What's Missing in Inspect:**
- RAG-based element retrieval
- Two-tier LLM architecture
- Driver abstraction layer

---

### 15. Zerostep
**Key Innovations:**
- **Lightweight Playwright plugin**
- **Remote server** for processing
- **CDP commands** returned from server
- **Minimal client footprint**

**What's Missing in Inspect:**
- Remote processing option
- Minimal client mode

---

### 16. GPT Engineer (Python, 60K★)
**Key Innovations:**
- **Natural language code generation**
- **Improvement mode** for existing code
- **Benchmark system** for agents
- **Template-based generation**

**What's Missing in Inspect:**
- Code generation from tests
- Benchmark framework

---

## Tier 5: Testing & Quality

### 17. Lighthouse (Google)
**Key Innovations:**
- **5-phase gatherer lifecycle**: beforePass → pass → afterPass → compute → audit
- **Computed artifacts** with memoization
- **Web Vitals**: FCP, LCP, CLS, INP, TTFB
- **Log-normal scoring** with p10/median control points
- **Trace processing** for performance analysis
- **Custom audit pipeline**

**What's Missing in Inspect:**
- Full 5-phase gatherer lifecycle
- Computed artifacts with memoization
- Complete Web Vitals implementation
- Log-normal scoring engine

---

### 18. Axe-Core
**Key Innovations:**
- **Rule → Check → Result** model
- **any/all/none** check composition
- **VirtualNode** for lazy evaluation
- **Impact levels**: minor, moderate, serious, critical
- **Failure summary** with remediation
- **Custom rule definitions**

**What's Missing in Inspect:**
- Rule/Check/Result tiered model
- Lazy virtual node evaluation
- Custom rule engine

---

### 19. Uffizzi
**Key Innovations:**
- **Ephemeral environments** per PR
- **Docker Compose support**
- **Kubernetes integration**
- **Preview deployments**

**What's Missing in Inspect:**
- Ephemeral environment provisioning
- PR preview environments

---

## Key Patterns to Adopt for Inspect

### 1. Agent Loop Architecture
```
Observe → Think → Act → Finalize
   ↓
AgentBrain: {evaluation, memory, next_goal}
```

**Repos**: browser-use, Skyvern, Stagehand

### 2. Hybrid Context Building
```
DOM Tree + Accessibility Tree + Screenshot + Network State
```

**Repos**: Stagehand, Skyvern, browser-use

### 3. Speculative Planning
```
Current Action Execution
        ↓
Next Step Pre-computation (parallel)
```

**Repos**: Skyvern, browser-use

### 4. Self-Healing Actions
```
Failure → Fresh Snapshot → New LLM Call → Retry
```

**Repos**: Stagehand, Skyvern

### 5. Action Caching
```
hash(instruction + DOM_state) → cached_action
```

**Repos**: browser-use, Stagehand, Shortest

### 6. Watchdog System
```
Parallel Monitors:
  - Captcha detector
  - Popup handler
  - Crash detector
  - Download tracker
```

**Repos**: browser-use

### 7. Multi-Agent Orchestration
```
Agent A → Handoff → Agent B
  ↓           ↓
Guardrails  Human-in-loop
```

**Repos**: OpenAI Agents SDK, AutoGen, Langflow

---

## Critical Gaps in Inspect

### HIGH PRIORITY

1. **Real Agent Loop** (Not Simulation)
   - Current: Simulation mode in orchestrator
   - Needed: Observe→Think→Act loop
   - Ref: browser-use, Skyvern

2. **Vision-First Understanding**
   - Current: DOM only
   - Needed: Screenshot + bounding boxes + DOM
   - Ref: Skyvern, Stagehand

3. **Speculative Planning**
   - Current: Sequential execution
   - Needed: Parallel next-step pre-computation
   - Ref: Skyvern

4. **Action Caching**
   - Current: None
   - Needed: Cache by instruction+DOM hash
   - Ref: browser-use, Stagehand

5. **Self-Healing**
   - Current: Basic retry
   - Needed: Fresh context + re-plan on failure
   - Ref: Stagehand

### MEDIUM PRIORITY

6. **Watchdog System**
   - Current: Basic error handling
   - Needed: Parallel monitors for captcha/popups
   - Ref: browser-use

7. **Guardrails Framework**
   - Current: Basic validation
   - Needed: Input/output safety checks
   - Ref: OpenAI Agents SDK

8. **Session Recording**
   - Current: Partial rrweb integration
   - Needed: Full replay with timeline
   - Ref: rrweb

9. **Natural Language Tests**
   - Current: Structured test plans
   - Needed: `inspect("Login")` API
   - Ref: Shortest

10. **Multi-Agent Orchestration**
    - Current: Single agent
    - Needed: Agent handoffs
    - Ref: OpenAI Agents SDK, AutoGen

### LOW PRIORITY

11. **Visual Workflow Builder**
    - Ref: Langflow, Skyvern

12. **MCP Server**
    - Current: Scaffold
    - Needed: Full implementation
    - Ref: Playwright MCP

13. **Code Generation from Recording**
    - Ref: QA Wolf

14. **Benchmark Framework**
    - Ref: GPT Engineer

---

## Recommendations for PLAN.md Updates

### Add New Sections:

1. **Vision-First Browser Understanding** (Tasks 900-950)
   - Annotated screenshots with element IDs
   - Bounding box overlays
   - Coordinate-based interaction

2. **Speculative Execution Engine** (Tasks 951-980)
   - Pre-compute next actions
   - Parallel LLM calls
   - Result caching

3. **Watchdog System** (Tasks 981-1010)
   - Captcha detection
   - Popup handling
   - Download tracking
   - Crash recovery

4. **Natural Language Test API** (Tasks 1011-1040)
   - `inspect.natural("...")` interface
   - Intent parsing
   - Automatic step generation

5. **Multi-Agent Orchestration** (Tasks 1041-1080)
   - Agent definition
   - Handoff protocols
   - Shared context

6. **Self-Healing System** (Tasks 1081-1110)
   - Failure detection
   - Fresh context acquisition
   - Re-planning

### Update Existing Sections:

- **Part 3 (Browser Understanding)**: Add vision-first tasks
- **Part 8 (Safety)**: Add watchdog tasks
- **Part 9 (CI Mode)**: Add action caching tasks

---

## Repository Reference Table

| Repository | Language | Stars | Category | Key Innovation |
|------------|----------|-------|----------|----------------|
| browser-use | Python | 78K | Agent | 3-phase loop, watchdogs |
| Skyvern | Python | 20K | Agent | Vision+DOM, speculative planning |
| Stagehand | TypeScript | 15K | Agent | Hybrid snapshot, self-healing |
| OpenAI Agents | Python | 25K | Framework | Handoffs, guardrails |
| AutoGen | Python | 35K | Framework | Multi-agent orchestration |
| Langflow | Python | 50K | Workflow | Visual builder |
| Playwright MCP | TypeScript | 5K | Browser | Accessibility-only mode |
| rrweb | TypeScript | 18K | Recording | Session replay |
| Lighthouse | JavaScript | 30K | Quality | Performance audits |
| E2B | Python/TS | 15K | Infrastructure | Sandboxed execution |
| QA Wolf | TypeScript | 5K | Testing | Record → Code |
| Shortest | TypeScript | 3K | Testing | NL tests, caching |

---

## Conclusion

Inspect has a solid foundation with 36 packages covering browser automation, git integration, accessibility, and visual regression. However, it lacks:

1. **Real agent loop** (simulation mode only)
2. **Vision-first understanding** (DOM only)
3. **Speculative planning** (sequential only)
4. **Action caching** (no caching)
5. **Self-healing** (basic retry only)

The OSS-REF repositories provide mature patterns for all these gaps. Priority should be:
1. Implement real agent loop (browser-use pattern)
2. Add vision-first understanding (Skyvern pattern)
3. Build speculative planning (Skyvern pattern)
4. Add action caching (Stagehand pattern)
5. Implement self-healing (Stagehand pattern)

---

## Appendix C: Complete Task Breakdown (1,700+ tasks from archive)

# PLAN.md — World-Class Agent Testing Infrastructure

## Vision

Build a fully autonomous, human-out-of-the-loop testing infrastructure for AI coding agents. Inspect will automatically detect code changes, generate intelligent test plans, execute them in real browsers with authenticated sessions, evaluate results with LLM judges, and report findings — all without human intervention.

**Target:** Zero human interaction from `git diff` to test report.

---

## Part 0: Current State Assessment

### What Exists (Keep & Migrate)

| Package                       | Status          | LOC    | Effect-TS       | Gap                                      |
| ----------------------------- | --------------- | ------ | --------------- | ---------------------------------------- |
| `@inspect/cookies`            | Complete        | 622    | FULL (template) | Wire into browser session                |
| `@inspect/browser`            | Complete        | 9,442  | NONE            | Migrate to Effect-TS, add multi-tree DOM |
| `@inspect/orchestrator`       | Simulation-mode | 8,467  | NONE            | Real agent loop, wire browser            |
| `@inspect/llm`                | Complete        | 3,233  | NONE            | Migrate to Effect-TS                     |
| `@inspect/agent`              | Complete        | 3,250  | NONE            | Facade — migrate sub-packages            |
| `@inspect/agent-memory`       | Complete        | 1,937  | NONE            | Add retention policies, freeze mask      |
| `@inspect/agent-tools`        | Complete        | 2,535  | NONE            | Dynamic action union, domain filtering   |
| `@inspect/agent-watchdogs`    | Complete        | 1,465  | NONE            | Migrate to Effect-TS                     |
| `@inspect/agent-governance`   | Complete        | 631    | NONE            | Migrate to Effect-TS                     |
| `@inspect/shared`             | Complete        | 5,557  | PARTIAL         | Convert interfaces to Schema             |
| `@inspect/git`                | Complete        | 1,107  | NONE            | Migrate to Effect-TS                     |
| `@inspect/session`            | Partial         | 191    | PARTIAL         | Enhance rrweb integration                |
| `@inspect/visual`             | Complete        | 1,602  | NONE            | Migrate to Effect-TS                     |
| `@inspect/reporter`           | Complete        | 2,707  | NONE            | Migrate to Effect-TS                     |
| `@inspect/observability`      | Complete        | 2,289  | NONE            | Migrate to Effect-TS                     |
| `@inspect/a11y`               | Complete        | 780    | NONE            | Add custom rule engine                   |
| `@inspect/lighthouse-quality` | Complete        | 915    | NONE            | Add custom audit pipeline                |
| `@inspect/quality`            | Scaffold        | 113    | NONE            | Build scoring engine                     |
| `@inspect/data`               | Complete        | 5,106  | NONE            | Migrate to Effect-TS                     |
| `@inspect/credentials`        | Complete        | 2,786  | NONE            | Migrate to Effect-TS                     |
| `@inspect/network`            | Complete        | 2,141  | NONE            | Migrate to Effect-TS                     |
| `@inspect/api`                | Complete        | 4,521  | NONE            | Migrate to Effect-TS                     |
| `@inspect/workflow`           | Complete        | 6,144  | NONE            | Migrate to Effect-TS                     |
| `@inspect/services`           | Complete        | 3,730  | NONE            | Migrate to Effect-TS                     |
| `@inspect/enterprise`         | Complete        | 761    | NONE            | Migrate to Effect-TS                     |
| `@inspect/sdk`                | Complete        | 2,748  | NONE            | Migrate to Effect-TS                     |
| `@inspect/mcp`                | Scaffold        | 48     | NONE            | Build full MCP server                    |
| `@inspect/video`              | Partial         | 119    | NONE            | Complete Remotion integration            |
| `@inspect/chaos`              | Complete        | 787    | NONE            | Migrate to Effect-TS                     |
| `@inspect/mocking`            | Complete        | 1,597  | NONE            | Migrate to Effect-TS                     |
| `@inspect/resilience`         | Complete        | 896    | NONE            | Migrate to Effect-TS                     |
| `@inspect/security-scanner`   | Complete        | 1,147  | NONE            | Migrate to Effect-TS                     |
| `@inspect/devices`            | Complete        | 550    | NONE            | Data-only, keep as-is                    |
| `@inspect/cli-context`        | Complete        | 598    | NONE            | Migrate to Effect-TS                     |
| `@inspect/core`               | Scaffold        | 150    | NONE            | Remove barrel file                       |
| `@inspect/expect-skill`       | Scaffold        | 0      | NONE            | Build skill implementation               |
| `apps/cli`                    | Complete        | 37,377 | NONE            | Migrate to Effect-TS, clean tech debt    |

**Total:** ~118,000 LOC across 36 packages + CLI

### What's Missing Entirely

1. Real agent loop (observe → think → act) — currently simulation-mode
2. Effect-TS adoption across 33 of 36 packages
3. Effect Schema for all domain models
4. Multi-tree DOM collection (DOM + Accessibility + Snapshot)
5. Vision-first page understanding
6. Dynamic action union for LLM
7. Structured LLM thinking (AgentBrain)
8. Observation/memory system with retention policies
9. Composable evaluator system
10. Log-normal scoring engine
11. Two-phase stability detection (network + visual)
12. Tab activity tracking
13. Fallback execution strategies
14. CI mode (headless + exit codes + JUnit)
15. TUI state flow definition
16. LLM judge for automated evaluation
17. Statistical rigor (bootstrapping, error bars)
18. Parallel execution engine
19. Self-improvement loop
20. Configuration snapshot reproducibility

---

## Part 1: Effect-TS Foundation (Tasks 1-120)

### 1.1 Core Schema Definitions (Tasks 1-20)

**Goal:** All domain models defined as Effect Schema classes, not plain interfaces.

- [x] Task 1: Define `TestPlan` as `Schema.Class` with `id`, `steps`, `baseUrl`, `isHeadless`, `requiresCookies`
- [x] Task 2: Define `TestPlanStep` as `Schema.Class` with `id`, `instruction`, `status`, `summary`, `startedAt`
- [x] Task 3: Define `TestResult` as `Schema.Class` with `status`, `summary`, `steps`, `duration`, `artifacts`
- [x] Task 4: Define `ExecutionEvent` as `Schema.TaggedUnion` with variants: `StepStarted`, `StepCompleted`, `StepFailed`, `ToolCall`, `ToolResult`, `Error`
- [x] Task 5: Define `AgentState` as `Schema.Class` with `nSteps`, `consecutiveFailures`, `lastResult`, `plan`, `loopDetector`
- [x] Task 6: Define `AgentOutput` as `Schema.Class` with `brain`, `actions`, `plan`
- [x] Task 7: Define `AgentBrain` as `Schema.Struct` with `evaluation`, `memory`, `nextGoal`
- [x] Task 8: Define `ActionResult` as `Schema.Class` with `isDone`, `success`, `error`, `extractedContent`, `longTermMemory`, `attachments`
- [x] Task 9: Define `AgentHistory` as `Schema.Class` with `modelOutput`, `results`, `browserState`, `metadata`
- [x] Task 10: Define `AgentHistoryList` as `Schema.Class` extending `Array(AgentHistory)` with query methods
- [x] Task 11: Define `BrowserConfig` as `Schema.Class` with `name`, `channel`, `headless`, `viewport`, `userAgent`
- [x] Task 12: Define `DeviceConfig` as `Schema.Class` with `name`, `viewport`, `userAgent`, `deviceScaleFactor`, `isMobile`
- [x] Task 13: Define `CookieParam` as `Schema.Struct` matching Playwright's cookie format
- [x] Task 14: Define `MCPToolDefinition` as `Schema.Struct` with `name`, `description`, `inputSchema`
- [x] Task 15: Define `GitScope` as `Schema.TaggedUnion` with variants: `WorkingTree`, `Branch`, `Commit`, `PullRequest`
- [x] Task 16: Define `DiffTestPlan` as `Schema.Class` with `impactedAreas`, `testSteps`, `confidence`
- [x] Task 17: Define `A11yReport` as interface (plain TS, used by a11y package)
- [ ] Task 18: Define `DashboardEvent` as `Schema.TaggedUnion` with all dashboard event variants
- [x] Task 19: Define `DashboardRunState` as `Schema.Class` with `runs`, `status`, `startTime`, `endTime`
- [x] Task 20: Define `DashboardSnapshot` as `Schema.Class` with `runs`, `metrics`, `summary`

### 1.2 Error Hierarchy (Tasks 21-35)

**Goal:** All errors use `Schema.ErrorClass` with explicit `_tag`, derived `message` field.

- [x] Task 21: Define `InspectError` as base `Schema.ErrorClass` with `code`, `context`
- [x] Task 22: Define `BrowserError` extending `InspectError` with `browser`, `page`, `url`
- [x] Task 23: Define `AgentError` extending `InspectError` with `agent`, `step`, `action`
- [x] Task 24: Define `ConfigError` extending `InspectError` with `key`, `value`, `reason`
- [x] Task 25: Define `NavigationError` extending `BrowserError` with `url`, `cause`
- [x] Task 26: Define `ElementNotFoundError` extending `BrowserError` with `selector`, `pageUrl`
- [x] Task 27: Define `CookieReadError` extending `InspectError` with `browser`, `cause`
- [x] Task 28: Define `CookieDatabaseNotFoundError` extending `InspectError` with `browser`
- [x] Task 29: Define `LLMProviderError` extending `AgentError` with `provider`, `model`, `cause`
- [x] Task 30: Define `RateLimitError` extending `LLMProviderError` with `retryAfter`
- [x] Task 31: Define `TokenBudgetExceededError` extending `AgentError` with `used`, `limit`
- [x] Task 32: Define `LoopDetectedError` extending `AgentError` with `actionHash`, `repetitions`
- [x] Task 33: Define `TimeoutError` extending `InspectError` with `operation`, `timeoutMs`
- [x] Task 34: Define `SchemaValidationError` extending `InspectError` with `parseError`
- [x] Task 35: Remove all legacy plain Error classes (`WorkflowError`, `CredentialError`, `NetworkError`)

### 1.3 Service Architecture — @inspect/orchestrator (Tasks 36-55)

**Goal:** Migrate orchestrator to `ServiceMap.Service` with proper Layer composition.

- [x] Task 36: Convert `TestExecutor` to `ServiceMap.Service` with `make:` property
- [x] Task 37: Define `TestExecutor.execute` as `Effect.fn` with span annotation
- [ ] Task 38: Define `TestExecutor.generatePlan` as `Effect.fn` (remove simulation-mode)
- [ ] Task 39: Define `TestExecutor.runStep` as `Effect.fn` (remove simulation-mode)
- [ ] Task 40: Define `TestExecutor.recover` as `Effect.fn` with proper error handling
- [x] Task 41: Create `TestExecutor.layer` with `Layer.provide()` chaining
- [x] Task 42: Convert `RecoveryManager` to `ServiceMap.Service`
- [x] Task 43: Define 10 failure types as `Schema.TaggedStruct`
- [x] Task 44: Define 12 recovery strategies as `Schema.TaggedStruct`
- [ ] Task 45: Implement real recovery executors (no simulation-mode)
- [x] Task 46: Convert `LoopDetector` to `ServiceMap.Service`
- [ ] Task 47: Add page fingerprinting to loop detection
- [ ] Task 48: Convert `SpeculativePlanner` to `ServiceMap.Service`
- [x] Task 49: Convert `CheckpointManager` to `ServiceMap.Service`
- [x] Task 50: Convert `DiffRunner` to `ServiceMap.Service`
- [ ] Task 51: Convert `DiffPlanGenerator` to `ServiceMap.Service`
- [x] Task 52: Convert `AdversarialExecutor` to `ServiceMap.Service`
- [ ] Task 53: Convert `RetryExecutor` to `ServiceMap.Service`
- [ ] Task 54: Convert `TestPrioritizer` to `ServiceMap.Service`
- [ ] Task 55: Convert `FlakinessDetector` to `ServiceMap.Service`

### 1.4 Service Architecture — @inspect/browser (Tasks 56-75)

**Goal:** Migrate browser automation to Effect-TS with proper resource management.

- [x] Task 56: Convert `BrowserManager` to `ServiceMap.Service`
- [x] Task 57: Define `BrowserManager.launch` with `Effect.acquireRelease` for cleanup
- [x] Task 58: Define `BrowserManager.close` as scoped resource
- [ ] Task 59: Convert `PageManager` to `ServiceMap.Service`
- [ ] Task 60: Convert `CrossBrowserManager` to `ServiceMap.Service`
- [x] Task 61: Convert `AriaSnapshotBuilder` to `ServiceMap.Service`
- [x] Task 62: Convert `DOMCapture` to `ServiceMap.Service`
- [ ] Task 63: Convert `HybridTree` to `ServiceMap.Service`
- [x] Task 64: Convert `ScreenshotCapture` to `ServiceMap.Service`
- [x] Task 65: Convert `VisionDetector` to `ServiceMap.Service`
- [x] Task 66: Convert `SessionRecorder` to `ServiceMap.Service`
- [ ] Task 67: Convert `HARRecorder` to `ServiceMap.Service`
- [x] Task 68: Convert `NetworkInterceptor` to `ServiceMap.Service`
- [x] Task 69: Convert `NetworkMonitor` to `ServiceMap.Service`
- [ ] Task 70: Convert `CookieExtractor` to `ServiceMap.Service`
- [ ] Task 71: Convert `ProfileManager` to `ServiceMap.Service`
- [ ] Task 72: Convert `MCPServer` to `ServiceMap.Service`
- [ ] Task 73: Convert `BrowserWatchdog` to `ServiceMap.Service`
- [ ] Task 74: Convert `FrameTraverser` to `ServiceMap.Service`
- [ ] Task 75: Convert `ShadowDomResolver` to `ServiceMap.Service`

### 1.5 Service Architecture — Remaining Packages (Tasks 76-100)

**Goal:** All packages use Effect-TS patterns.

- [x] Task 76: Migrate `@inspect/llm` — Convert `LLMProvider` abstract class to `ServiceMap.Service`
- [ ] Task 77: Migrate `@inspect/llm` — Convert `ClaudeProvider` to layer
- [ ] Task 78: Migrate `@inspect/llm` — Convert `OpenAIProvider` to layer
- [ ] Task 79: Migrate `@inspect/llm` — Convert `GeminiProvider` to layer
- [ ] Task 80: Migrate `@inspect/llm` — Convert `DeepSeekProvider` to layer
- [ ] Task 81: Migrate `@inspect/llm` — Convert `OllamaProvider` to layer
- [x] Task 82: Migrate `@inspect/llm` — Convert `AgentRouter` to `ServiceMap.Service`
- [x] Task 83: Migrate `@inspect/llm` — Convert `RateLimiter` to `ServiceMap.Service`
- [x] Task 84: Migrate `@inspect/llm` — Convert `FallbackManager` to `ServiceMap.Service`
- [x] Task 85: Migrate `@inspect/agent-memory` — Convert `MessageManager` to `ServiceMap.Service`
- [ ] Task 86: Migrate `@inspect/agent-memory` — Convert `LongTermMemory` to `ServiceMap.Service`
- [ ] Task 87: Migrate `@inspect/agent-memory` — Convert `ContextCompactor` to `ServiceMap.Service`
- [ ] Task 88: Migrate `@inspect/agent-memory` — Convert `MessageCompactor` to `ServiceMap.Service`
- [x] Task 89: Migrate `@inspect/agent-memory` — Convert `PatternStore` to `ServiceMap.Service`
- [x] Task 90: Migrate `@inspect/agent-tools` — Convert `ToolRegistry` to `ServiceMap.Service`
- [ ] Task 91: Migrate `@inspect/agent-tools` — Convert `ToolValidator` to `ServiceMap.Service`
- [x] Task 92: Migrate `@inspect/agent-tools` — Convert `NLAssert` to `ServiceMap.Service`
- [x] Task 93: Migrate `@inspect/agent-tools` — Convert `TokenTracker` to `ServiceMap.Service`
- [x] Task 94: Migrate `@inspect/agent-tools` — Convert `SensitiveDataMasker` to `ServiceMap.Service`
- [x] Task 95: Migrate `@inspect/agent-tools` — Convert `JudgeLLM` to `ServiceMap.Service`
- [x] Task 96: Migrate `@inspect/git` — Convert `GitManager` to `ServiceMap.Service`
- [ ] Task 97: Migrate `@inspect/git` — Convert `FingerprintGenerator` to `ServiceMap.Service`
- [ ] Task 98: Migrate `@inspect/reporter` — Convert all reporters to `ServiceMap.Service`
- [x] Task 99: Migrate `@inspect/observability` — Convert logger, tracer, metrics to `ServiceMap.Service`
- [x] Task 100: Migrate `@inspect/observability` — Convert `CostTracker`, `AnalyticsCollector` to `ServiceMap.Service`

### 1.6 CLI Migration (Tasks 101-120)

**Goal:** Clean CLI tech debt, remove invented types, extract business logic from React.

- [x] Task 101: Remove `TestContext` invented interface — use `TestContext` Schema from shared
- [x] Task 102: Remove `BrowserEnvironmentHints` — values belong on `TestPlanDraft`
- [x] Task 103: Remove `EnvironmentOverrides` — duplicate of `BrowserEnvironmentHints`
- [x] Task 104: Remove `TestRunConfig` — no intermediate bag needed
- [x] Task 105: Remove `AgentProvider` CLI type — define in shared as `Schema.Literals`
- [x] Task 106: Remove `HealthcheckResult` — delete entire healthcheck stub
- [x] Task 107: Remove `FetchTestContextsResult` — unused exported interface
- [x] Task 108: Remove `CommanderGlobalOptions` — parse directly into domain types
- [ ] Task 109: Extract `TestingScreen` execution lifecycle into effect-atom
- [x] Task 110: Add `status` field to `TestPlanStep` — eliminate derivation in component
- [x] Task 111: Add `displayText` getter on `ToolCall` schema — eliminate fragile property checks
- [x] Task 112: Add `displayName` getter on `ChangesFor` — eliminate duplication
- [ ] Task 113: Delete `usePlanningEffect` hook — supervisor should own session lifecycle
- [ ] Task 114: Extract `@`-picker logic into shared hook
- [ ] Task 115: Convert context option loading to React Query hooks
- [ ] Task 116: Convert PR comment posting to React Query mutation
- [x] Task 117: Add `toPlainText` getter on `TestReport` — move formatting out of component
- [x] Task 118: Define `BranchFilter` in shared models — move out of component
- [x] Task 119: Add `update()` method on `TestPlanDraft` — immutable field updates
- [ ] Task 120: Resolve `process.cwd()` scattering — store once at startup

---

## Part 2: Real Agent Loop (Tasks 121-220)

### 2.1 Agent Loop Core (Tasks 121-150)

**Goal:** Build real observe → think → act → finalize loop, replacing simulation-mode.

- [ ] Task 121: Create `packages/agent/src/agent-loop.ts` — main step loop
- [ ] Task 122: Implement `AgentLoop.run()` with while-loop: `while (state.nSteps <= maxSteps)`
- [ ] Task 123: Implement Phase 1 `_prepareContext()` — OBSERVE: get browser state, build messages
- [ ] Task 124: Implement Phase 2 `_getNextAction()` — THINK: call LLM, validate output schema
- [ ] Task 125: Implement Phase 3 `_executeActions()` — ACT: execute via tool registry
- [ ] Task 126: Implement Phase 4 `_postProcess()` — FINALIZE: update plan, record loop detection
- [ ] Task 127: Implement `_finalize()` — always runs, records history even on failure
- [ ] Task 128: Add step timeout via `Effect.timeout` per step
- [ ] Task 129: Add consecutive failure counter — break loop at `maxFailures`
- [ ] Task 130: Add catch-all error handler in `step()` — delegates to `_handleStepError()`
- [ ] Task 131: Implement `_handleStepError()` — format errors, increment failure counters
- [ ] Task 132: Implement page-change guard in `_executeActions()` — abort on URL/focus change
- [ ] Task 133: Implement `terminatesSequence` flag for actions that navigate
- [ ] Task 134: Implement runtime URL comparison after each action
- [ ] Task 135: Implement runtime focus target comparison after each action
- [ ] Task 136: Create `packages/agent/src/agent-state.ts` — mutable runtime state
- [ ] Task 137: Define `AgentState` with `nSteps`, `consecutiveFailures`, `lastResult`, `plan`
- [ ] Task 138: Define `AgentState` with `loopDetector`, `messageManagerState`
- [ ] Task 139: Implement state clearing after context preparation (prevent stale data)
- [ ] Task 140: Create `packages/agent/src/agent-output.ts` — LLM response schema
- [ ] Task 141: Define `AgentOutput` with `brain` fields + `actions` array
- [ ] Task 142: Implement dynamic action model extension (Pydantic `create_model` equivalent)
- [ ] Task 143: Filter actions by page URL domain patterns
- [ ] Task 144: Create `packages/agent/src/message-manager.ts` — prompt construction
- [ ] Task 145: Implement context window management with threshold detection
- [ ] Task 146: Implement message compaction when context grows past threshold
- [ ] Task 147: Implement LLM-based summarization of old history
- [ ] Task 148: Keep last N steps intact during compaction
- [ ] Task 149: Create `packages/agent/src/prompt-templates.ts` — system prompts
- [ ] Task 150: Define system prompt template with agent role, capabilities, constraints

### 2.2 Structured Thinking (Tasks 151-165)

**Goal:** AgentBrain pattern — force LLM to reason, not guess.

- [x] Task 151: Define `AgentBrain` schema with `evaluation`, `memory`, `nextGoal`
- [ ] Task 152: Add `evaluation` field — evaluate previous goal success/failure
- [ ] Task 153: Add `memory` field — persist important observations across steps
- [ ] Task 154: Add `nextGoal` field — declare what to do next
- [ ] Task 155: Inject AgentBrain fields into every LLM call prompt
- [ ] Task 156: Validate AgentBrain output schema on every LLM response
- [ ] Task 157: Implement flash mode — strip thinking fields for token savings
- [ ] Task 158: Flash mode: remove `evaluation`, `nextGoal`, keep only `memory` + `action`
- [ ] Task 159: Add flash mode toggle in agent settings
- [ ] Task 160: Implement action history feedback — every step receives full history
- [ ] Task 161: Format action history for LLM consumption (compact text format)
- [ ] Task 162: Include action results in history (success, error, extracted content)
- [ ] Task 163: Implement nudge injection system for loop detection
- [ ] Task 164: Define escalating nudge messages (5, 8, 12 repetitions)
- [ ] Task 165: Implement planning nudge injection when no plan exists

### 2.3 LLM Integration (Tasks 166-190)

**Goal:** Robust LLM calling with retry, fallback, and structured output.

- [ ] Task 166: Implement `_getLLMWithRetry()` — primary LLM with fallback chain
- [ ] Task 167: Implement exponential backoff retry for LLM calls
- [ ] Task 168: Implement `_trySwitchToFallbackLLM()` on rate-limit/provider errors
- [ ] Task 169: Register fallback LLM for token cost tracking
- [ ] Task 170: Implement structured output validation on LLM responses
- [ ] Task 171: Retry empty actions once, then insert safe "done" noop
- [ ] Task 172: Implement LLM provider protocol (like `BaseChatModel` from browser-use)
- [ ] Task 173: Use Protocol over ABC for LLM compatibility
- [ ] Task 174: Implement overloaded `invoke` — with/without output format
- [ ] Task 175: Add provider string property for provider-specific logic
- [ ] Task 176: Implement streaming LLM responses with SSE
- [ ] Task 177: Add token usage tracking per LLM call
- [ ] Task 178: Add cost tracking per LLM call (provider-specific pricing)
- [ ] Task 179: Implement prompt caching with freeze mask
- [ ] Task 180: Define freeze mask for previously-rendered observations
- [ ] Task 181: Implement prompt cache stability across steps
- [ ] Task 182: Add LLM call logging with structured annotations
- [ ] Task 183: Add LLM response validation with schema decode
- [ ] Task 184: Implement LLM timeout with `Effect.timeout`
- [ ] Task 185: Add LLM rate limiting with token bucket
- [ ] Task 186: Implement model routing based on task complexity
- [ ] Task 187: Add cheaper model for simple tasks, expensive for verification
- [ ] Task 188: Implement speculative planning — pre-compute next LLM call
- [ ] Task 189: Run next step's scrape + LLM concurrently with current action execution
- [ ] Task 190: Implement `SpeculativePlan` dataclass with scraped page, prompt, response

### 2.4 History & Trajectory (Tasks 191-220)

**Goal:** Rich history recording with query methods and replay capability.

- [ ] Task 191: Create `packages/agent/src/history.ts` — agent history recording
- [ ] Task 192: Define `AgentHistory` with `modelOutput`, `results`, `browserState`, `metadata`
- [ ] Task 193: Define `AgentHistoryList` extending array with 30+ query methods
- [ ] Task 194: Implement `urls()` — extract all URLs visited
- [ ] Task 195: Implement `screenshots()` — extract all screenshot paths
- [ ] Task 196: Implement `errors()` — extract all errors encountered
- [ ] Task 197: Implement `actions()` — extract all actions taken
- [ ] Task 198: Implement `stepDurations()` — extract timing per step
- [ ] Task 199: Implement `totalDuration()` — total execution time
- [ ] Task 200: Implement `tokenUsage()` — total tokens consumed
- [ ] Task 201: Implement `cost()` — total cost in USD
- [ ] Task 202: Implement `successRate()` — percentage of successful steps
- [ ] Task 203: Implement `toJson()` — serialize for storage
- [ ] Task 204: Implement `fromJson()` — deserialize for replay
- [ ] Task 205: Implement `rerunHistory()` — replay saved history
- [ ] Task 206: Implement 5-level element matching for replay: exact hash, stable hash, xpath, ax_name, attribute
- [ ] Task 207: Implement exponential backoff retries during replay
- [ ] Task 208: Implement AI summary generation after replay
- [ ] Task 209: Add trajectory recording — every step captures screenshot, action, URL, errors
- [ ] Task 210: Add model outputs to trajectory
- [ ] Task 211: Persist history to disk after each step
- [ ] Task 212: Implement history compression for long runs
- [ ] Task 213: Add history pruning — keep only last N steps in memory
- [ ] Task 214: Implement history export to JSONL format
- [ ] Task 215: Add history visualization endpoint
- [ ] Task 216: Implement step-by-step replay viewer
- [ ] Task 217: Add screenshot overlay on replay
- [ ] Task 218: Add action annotation on replay
- [ ] Task 219: Add error highlighting on replay
- [ ] Task 220: Implement history comparison (A/B runs)

---

## Part 3: Browser Understanding (Tasks 221-340)

### 3.1 Multi-Tree DOM Collection (Tasks 221-260)

**Goal:** Collect DOM + Accessibility + Snapshot trees in parallel for comprehensive understanding.

- [ ] Task 221: Create `packages/browser/src/dom/multi-tree.ts` — parallel tree collection
- [ ] Task 222: Implement `_getAllTrees()` — fire 3 CDP requests in parallel
- [ ] Task 223: Implement `DOMSnapshot.captureSnapshot` — layout, paint order, DOM rects
- [ ] Task 224: Implement `DOM.getDocument` — full DOM tree
- [ ] Task 225: Implement `Accessibility.getFullAXTree` — accessibility tree across frames
- [ ] Task 226: Add 10s timeout per CDP request
- [ ] Task 227: Add single retry with 2s timeout on failed requests
- [ ] Task 228: Implement viewport ratio detection
- [ ] Task 229: Implement JS click listener detection via `getEventListeners`
- [ ] Task 230: Create `packages/browser/src/dom/element-tree.ts` — enhanced node type
- [ ] Task 231: Define `EnhancedDOMTreeNode` merging DOM + AX + Snapshot data
- [ ] Task 232: Implement DOM data: tag, attributes, styles
- [ ] Task 233: Implement AX data: role, name, description
- [ ] Task 234: Implement Snapshot data: bounds, paint order, computed styles
- [ ] Task 235: Implement `_constructEnhancedNode()` — recursive tree builder
- [ ] Task 236: Track absolute positions across iframe coordinate systems
- [ ] Task 237: Handle shadow DOM in enhanced tree
- [ ] Task 238: Handle content documents in enhanced tree
- [ ] Task 239: Handle cross-origin iframes in enhanced tree
- [ ] Task 240: Compute visibility using CSS styles + viewport intersection
- [ ] Task 241: Implement `isElementVisibleAccordingToAllParents()`
- [ ] Task 242: Check CSS display property for visibility
- [ ] Task 243: Check CSS visibility property for visibility
- [ ] Task 244: Check CSS opacity property for visibility
- [ ] Task 245: Check viewport bounds with configurable threshold (1000px beyond)
- [ ] Task 246: Implement iframe depth limit (default 5)
- [ ] Task 247: Implement iframe quantity limit (default 100)
- [ ] Task 248: Implement cross-origin iframe support with lazy fetching
- [ ] Task 249: Match iframes by src URL if frameId missing
- [ ] Task 250: Skip invisible/small iframes
- [ ] Task 251: Create `packages/browser/src/dom/serializer.ts` — LLM-friendly text
- [ ] Task 252: Filter out non-displayable nodes (style, script, SVG decorative)
- [ ] Task 253: Remove elements hidden behind others
- [ ] Task 254: Remove elements outside viewport
- [ ] Task 255: Assign numeric `[index]` to clickable elements
- [ ] Task 256: Generate selector map mapping element indices to nodes
- [ ] Task 257: Format output as indented text outline: `[index] role: name`
- [ ] Task 258: Create `packages/browser/src/dom/clickable-detector.ts`
- [ ] Task 259: Implement `isInteractable()` — comprehensive interactability check
- [ ] Task 260: Check ARIA widget roles, pointer events, special inputs, framework bindings

### 3.2 Vision-First Understanding (Tasks 261-290)

**Goal:** Combine screenshot + DOM for LLM context, coordinate-based grounding.

- [ ] Task 261: Create `packages/browser/src/vision/screenshot-capture.ts` — DPR-normalized screenshots
- [ ] Task 262: Resize screenshots by `devicePixelRatio` before sending to LLM
- [ ] Task 263: Convert coordinates back after LLM returns click positions
- [ ] Task 264: Create `packages/browser/src/vision/bounding-box-overlay.ts`
- [ ] Task 265: Draw numbered boxes around interactable elements on screenshots
- [ ] Task 266: Support different box colors for different element types
- [ ] Task 267: Support box transparency for readability
- [ ] Task 268: Create `packages/browser/src/vision/coordinate-transform.ts`
- [ ] Task 269: Map LLM coordinates to Playwright clicks
- [ ] Task 270: Handle DPR scaling in coordinate transformation
- [ ] Task 271: Handle iframe coordinate offsets
- [ ] Task 272: Handle scroll position in coordinate transformation
- [ ] Task 273: Create `packages/browser/src/vision/visual-grounding.ts`
- [ ] Task 274: Combine screenshot + DOM for LLM context
- [ ] Task 275: Implement dual-modality prompt (image + text)
- [ ] Task 276: Implement CUA (Computer Use API) support for OpenAI
- [ ] Task 277: Implement CUA support for Anthropic
- [ ] Task 278: Implement screenshot-only mode for CUA engines
- [ ] Task 279: Implement coordinate-based clicking for CUA
- [ ] Task 280: Implement element-index clicking for text-based engines
- [ ] Task 281: Add vision detector for captcha, popups, overlays
- [ ] Task 282: Implement captcha detection from screenshots
- [ ] Task 283: Implement popup detection from screenshots
- [ ] Task 284: Implement overlay detection from screenshots
- [ ] Task 285: Add vision-based element detection fallback
- [ ] Task 286: Implement visual diff between consecutive screenshots
- [ ] Task 287: Use visual diff for page change detection
- [ ] Task 288: Add screenshot compression for token efficiency
- [ ] Task 289: Implement screenshot quality settings (configurable)
- [ ] Task 290: Add screenshot caching for unchanged pages

### 3.3 Stability Detection (Tasks 291-320)

**Goal:** Two-phase stability detection — network + visual — before agent acts.

- [ ] Task 291: Create `packages/browser/src/stability-detector.ts`
- [ ] Task 292: Implement network stability monitoring
- [ ] Task 293: Monitor relevant requests: document, CSS, JS, images, fonts, XHR
- [ ] Task 294: Filter out analytics requests
- [ ] Task 295: Filter out ad requests
- [ ] Task 296: Filter out WebSocket connections
- [ ] Task 297: Wait for 500ms of no relevant activity
- [ ] Task 298: Implement visual stability detection
- [ ] Task 299: Take screenshots at 100ms intervals
- [ ] Task 300: Pixel diff with `sharp` library
- [ ] Task 301: Require 3 consecutive stable frames below 0.01 difference
- [ ] Task 302: Implement combined stability check (network AND visual)
- [ ] Task 303: Add stability timeout (max wait time)
- [ ] Task 304: Emit stability events via PubSub
- [ ] Task 305: Create `packages/browser/src/tab-manager.ts`
- [ ] Task 306: Implement multi-tab management
- [ ] Task 307: Inject `__tabActivityTime` into each page via `page.evaluate()`
- [ ] Task 308: Poll activity every 200ms
- [ ] Task 309: Auto-switch to most recently active tab
- [ ] Task 310: Track tab creation events
- [ ] Task 311: Track tab close events
- [ ] Task 312: Track agent focus changes
- [ ] Task 313: Create `packages/browser/src/browser-provider.ts`
- [ ] Task 314: Implement singleton browser with hash + reuse
- [ ] Task 315: Hash launch options for browser instance matching
- [ ] Task 316: Reuse existing browser instances when options match
- [ ] Task 317: Close browser when last context closes
- [ ] Task 318: Implement browser reconnection on disconnect
- [ ] Task 319: Distinguish transient disconnects from terminal browser closure
- [ ] Task 320: Wait for `_reconnect_event` before retrying after disconnect

### 3.4 Dynamic Action System (Tasks 321-340)

**Goal:** Dynamic action union building, domain filtering, special parameter injection.

- [ ] Task 321: Enhance `ToolRegistry` with dynamic action model creation
- [ ] Task 322: Implement action registration via decorator pattern
- [ ] Task 323: Implement signature normalization for actions
- [ ] Task 324: Separate "special params" from "action params"
- [ ] Task 325: Auto-generate Pydantic param model from signature
- [ ] Task 326: Implement dynamic Union of individual action models
- [ ] Task 327: Each action becomes single-field model (e.g., `ClickActionModel`)
- [ ] Task 328: Wrap Union in RootModel with `getIndex()`/`setIndex()`
- [ ] Task 329: Implement domain-filtered actions
- [ ] Task 330: Actions declare `domains`/`allowedDomains`
- [ ] Task 331: Filter actions per-page by URL domain patterns
- [ ] Task 332: Implement special parameter injection
- [ ] Task 333: Inject `browserSession` into actions that declare it
- [ ] Task 334: Inject `pageExtractionLLM` into actions that declare it
- [ ] Task 335: Inject `fileSystem` into actions that declare it
- [ ] Task 336: Inject `availableFilePaths` into actions that declare it
- [ ] Task 337: Inject `pageUrl` into actions that declare it
- [ ] Task 338: Implement sensitive data replacement at execution time
- [ ] Task 339: Replace `<secret>placeholder</secret>` tags with domain-matched credentials
- [ ] Task 340: Support TOTP generation for 2FA codes in action params

---

## Part 4: Memory & State Management (Tasks 341-400)

### 4.1 Observation System (Tasks 341-370)

**Goal:** Typed observations with retention policies, freeze mask for prompt caching.

- [ ] Task 341: Create `packages/agent-memory/src/observation.ts`
- [ ] Task 342: Define `Observation` base type with `type`, `content`, `timestamp`
- [ ] Task 343: Define `WebObservation` — screenshot, tab info, URL
- [ ] Task 344: Define `ActionObservation` — action taken, parameters
- [ ] Task 345: Define `ActionResultObservation` — action result, extracted content
- [ ] Task 346: Define `ThoughtObservation` — agent reasoning
- [ ] Task 347: Define `ErrorObservation` — errors encountered
- [ ] Task 348: Implement retention policy: `dedupe` — collapse adjacent identical observations
- [ ] Task 349: Implement retention policy: `limit` — max N observations of a type
- [ ] Task 350: Implement retention policy: `expire` — observations older than X removed
- [ ] Task 351: Implement retention policy: `summarize` — LLM summarize old observations
- [ ] Task 352: Configure retention per observation type
- [ ] Task 353: Implement observation indexing for efficient retrieval
- [ ] Task 354: Implement observation query by type, time range, content
- [ ] Task 355: Create `packages/agent-memory/src/masking.ts` — freeze mask
- [ ] Task 356: Implement freeze mask for previously-rendered observations
- [ ] Task 357: Track which observations are frozen vs mutable
- [ ] Task 358: Implement prompt cache stability with frozen observations
- [ ] Task 359: Implement unfreeze on page change
- [ ] Task 360: Implement partial freeze (freeze content, keep metadata mutable)
- [ ] Task 361: Create `packages/agent-memory/src/todo-tracker.ts`
- [ ] Task 362: Define `TodoItem` with `id`, `description`, `status`
- [ ] Task 363: Define status: `pending`, `inProgress`, `completed`, `failed`
- [ ] Task 364: Implement todo list creation from task goal
- [ ] Task 365: Implement todo status updates during execution
- [ ] Task 366: Implement todo completion verification
- [ ] Task 367: Inject todo list into agent prompt
- [ ] Task 368: Track todo progress in agent state
- [ ] Task 369: Report todo completion in final results
- [ ] Task 370: Implement sub-todo items for complex tasks

### 4.2 Context Compaction (Tasks 371-400)

**Goal:** Intelligent context window management with LLM-based summarization.

- [ ] Task 371: Enhance `ContextCompactor` with LLM-based summarization
- [ ] Task 372: Define compaction trigger threshold (token count)
- [ ] Task 373: Define character limit for compaction
- [ ] Task 374: Define token limit for compaction
- [ ] Task 375: Implement LLM summarization of old history
- [ ] Task 376: Keep last N steps intact during compaction
- [ ] Task 377: Implement summary max size configuration
- [ ] Task 378: Implement compaction settings per agent
- [ ] Task 379: Implement compaction on context window approaching limit
- [ ] Task 380: Implement compaction on step count threshold
- [ ] Task 381: Implement compaction on token budget threshold
- [ ] Task 382: Add compaction logging with structured annotations
- [ ] Task 383: Track compaction ratio (before/after size)
- [ ] Task 384: Track compaction frequency
- [ ] Task 385: Implement compaction quality check (LLM verify summary)
- [ ] Task 386: Implement selective compaction (compact only certain observation types)
- [ ] Task 387: Implement incremental compaction (compact in chunks)
- [ ] Task 388: Implement compaction undo (restore previous state)
- [ ] Task 389: Create `packages/agent-memory/src/pattern-store.ts` — pattern learning
- [ ] Task 390: Store successful action patterns
- [ ] Task 391: Store failure patterns for avoidance
- [ ] Task 392: Implement pattern matching for similar situations
- [ ] Task 393: Implement pattern retrieval by context similarity
- [ ] Task 394: Implement pattern expiration (old patterns fade)
- [ ] Task 395: Implement pattern generalization (specific → general)
- [ ] Task 396: Create `packages/agent-memory/src/action-cache.ts`
- [ ] Task 397: Cache successful actions by instruction + DOM state hash
- [ ] Task 398: Implement cache hit replay without LLM call
- [ ] Task 399: Implement cache invalidation on DOM change
- [ ] Task 400: Implement cache size limit with LRU eviction

---

## Part 5: Diff-Aware Test Planning (Tasks 401-480)

### 5.1 Enhanced Diff Analysis (Tasks 401-440)

**Goal:** AST-based diff parsing + LLM-enhanced analysis for intelligent test plans.

- [ ] Task 401: Create `packages/orchestrator/src/testing/diff-ast-parser.ts`
- [ ] Task 402: Use TypeScript Compiler API to parse changed files
- [ ] Task 403: Extract component definitions from changed files
- [ ] Task 404: Extract function definitions from changed files
- [ ] Task 405: Extract route definitions from changed files
- [ ] Task 406: Extract API endpoint definitions from changed files
- [ ] Task 407: Extract form definitions from changed files
- [ ] Task 408: Extract test definitions from changed files
- [ ] Task 409: Build dependency graph from AST analysis
- [ ] Task 410: Identify impacted components via dependency traversal
- [ ] Task 411: Identify impacted routes via import analysis
- [ ] Task 412: Identify impacted APIs via call graph analysis
- [ ] Task 413: Create `packages/orchestrator/src/testing/diff-plan-llm.ts`
- [ ] Task 414: Send diff + AST analysis to LLM for richer understanding
- [ ] Task 415: LLM identifies user-facing behaviors changed
- [ ] Task 416: LLM identifies edge cases the changes introduce
- [ ] Task 417: LLM identifies existing functionality that might regress
- [ ] Task 418: LLM generates test step descriptions
- [ ] Task 419: LLM generates test priorities
- [ ] Task 420: LLM generates test confidence scores
- [ ] Task 421: Enhance `DiffPlanGenerator` with LLM output
- [ ] Task 422: Combine heuristic analysis with LLM analysis
- [ ] Task 423: Weight heuristic vs LLM results by confidence
- [ ] Task 424: Create `packages/orchestrator/src/testing/plan-optimizer.ts`
- [ ] Task 425: Deduplicate test steps from multiple sources
- [ ] Task 426: Prioritize test steps by impact and risk
- [ ] Task 427: Group related test steps
- [ ] Task 428: Order test steps for maximum coverage minimum steps
- [ ] Task 429: Remove redundant test steps
- [ ] Task 430: Merge similar test steps
- [ ] Task 431: Split complex test steps
- [ ] Task 432: Add adversarial test angles for each impacted area
- [ ] Task 433: Generate empty input tests
- [ ] Task 434: Generate boundary value tests
- [ ] Task 435: Generate race condition tests
- [ ] Task 436: Generate error state tests
- [ ] Task 437: Generate accessibility regression tests
- [ ] Task 438: Generate performance regression tests
- [ ] Task 439: Generate visual regression tests
- [ ] Task 440: Generate security regression tests

### 5.2 Git Integration (Tasks 441-480)

**Goal:** Comprehensive git integration for change detection and context.

- [ ] Task 441: Enhance `GitManager` with diff analysis
- [ ] Task 442: Get unstaged changes
- [ ] Task 443: Get staged changes
- [ ] Task 444: Get branch diff against main
- [ ] Task 445: Get commit diff
- [ ] Task 446: Get PR diff
- [ ] Task 447: Get file stats (added, removed, modified lines)
- [ ] Task 448: Get changed file types
- [ ] Task 449: Get changed directories
- [ ] Task 450: Get changed components (React/Vue/Angular)
- [ ] Task 451: Get changed pages/routes
- [ ] Task 452: Get changed API endpoints
- [ ] Task 453: Get changed tests
- [ ] Task 454: Get changed styles
- [ ] Task 455: Get changed config files
- [ ] Task 456: Get changed dependencies
- [ ] Task 457: Get changed environment variables
- [ ] Task 458: Get changed database migrations
- [ ] Task 459: Get changed CI configuration
- [ ] Task 460: Analyze change risk level (low/medium/high)
- [ ] Task 461: Analyze change scope (component/page/api/global)
- [ ] Task 462: Analyze change type (feature/bugfix/refactor/chore)
- [ ] Task 463: Analyze change author patterns
- [ ] Task 464: Get recent commits on branch
- [ ] Task 465: Get PR information for branch
- [ ] Task 466: Get PR status (open/draft/merged)
- [ ] Task 467: Get PR reviewers
- [ ] Task 468: Get PR comments
- [ ] Task 469: Get PR check status
- [ ] Task 470: Get branch protection rules
- [ ] Task 471: Get main branch name
- [ ] Task 472: Get remote branches
- [ ] Task 473: Get local branches
- [ ] Task 474: Get branch age
- [ ] Task 475: Get branch commit count
- [ ] Task 476: Get branch ahead/behind main
- [ ] Task 477: Get merge conflict status
- [ ] Task 478: Get code ownership for changed files
- [ ] Task 479: Get test coverage for changed files
- [ ] Task 480: Generate change summary for LLM context

---

## Part 6: Evaluation & Quality (Tasks 481-580)

### 6.1 Composable Evaluator System (Tasks 481-520)

**Goal:** Independent evaluators composed multiplicatively — all must pass.

- [ ] Task 481: Create `packages/quality/src/evaluator.ts` — evaluator interface
- [ ] Task 482: Define `Evaluator` interface with `evaluate()` method
- [ ] Task 483: Define `EvaluationResult` with `score`, `passed`, `reason`, `details`
- [ ] Task 484: Create `packages/quality/src/evaluators/string-match.ts`
- [ ] Task 485: Implement text content verification
- [ ] Task 486: Implement exact string match
- [ ] Task 487: Implement regex match
- [ ] Task 488: Implement fuzzy string match
- [ ] Task 489: Implement case-insensitive match
- [ ] Task 490: Create `packages/quality/src/evaluators/url-match.ts`
- [ ] Task 491: Implement URL verification
- [ ] Task 492: Implement exact URL match
- [ ] Task 493: Implement URL pattern match
- [ ] Task 494: Implement URL contains match
- [ ] Task 495: Create `packages/quality/src/evaluators/dom-query.ts`
- [ ] Task 496: Implement JavaScript DOM extraction
- [ ] Task 497: Implement CSS selector query
- [ ] Task 498: Implement XPath query
- [ ] Task 499: Implement element property check
- [ ] Task 500: Implement element attribute check
- [ ] Task 501: Create `packages/quality/src/evaluators/visual-match.ts`
- [ ] Task 502: Implement screenshot comparison
- [ ] Task 503: Implement pixel diff with threshold
- [ ] Task 504: Implement structural similarity index
- [ ] Task 505: Implement perceptual hash comparison
- [ ] Task 506: Create `packages/quality/src/evaluators/accessibility.ts`
- [ ] Task 507: Implement WCAG compliance check
- [ ] Task 508: Implement ARIA role validation
- [ ] Task 509: Implement color contrast check
- [ ] Task 510: Implement keyboard navigation check
- [ ] Task 511: Create `packages/quality/src/combined-evaluator.ts`
- [ ] Task 512: Implement multiplicative composition (all must pass)
- [ ] Task 513: Implement weighted composition
- [ ] Task 514: Implement OR composition (any must pass)
- [ ] Task 515: Implement conditional composition
- [ ] Task 516: Implement evaluator chain (short-circuit on failure)
- [ ] Task 517: Implement evaluator parallel execution
- [ ] Task 518: Add evaluator timeout
- [ ] Task 519: Add evaluator retry on transient failure
- [ ] Task 520: Add evaluator logging with structured annotations

### 6.2 LLM Judge (Tasks 521-560)

**Goal:** Automated LLM-based evaluation with statistical rigor.

- [ ] Task 521: Create `packages/quality/src/llm-judge.ts`
- [ ] Task 522: Define `JudgementResult` schema
- [ ] Task 523: Implement `reasoning` field — detailed breakdown
- [ ] Task 524: Implement `verdict` field — true/false
- [ ] Task 525: Implement `failureReason` field — max 5 sentences
- [ ] Task 526: Implement `impossibleTask` field — task unreachable
- [ ] Task 527: Implement `reachedCaptcha` field — captcha encountered
- [ ] Task 528: Build judge prompt with task goal and agent trajectory
- [ ] Task 529: Include action history in judge prompt
- [ ] Task 530: Include final page state in judge prompt
- [ ] Task 531: Include screenshots in judge prompt
- [ ] Task 532: Force structured JSON output from judge
- [ ] Task 533: Validate judge output schema
- [ ] Task 534: Implement judge retry on schema validation failure
- [ ] Task 535: Implement judge model selection (configurable)
- [ ] Task 536: Use cheaper model for judge (gemini-flash)
- [ ] Task 537: Implement judge alignment with human labels
- [ ] Task 538: Track judge accuracy over time
- [ ] Task 539: Implement judge bias detection
- [ ] Task 540: Implement judge calibration with known examples
- [ ] Task 541: Run task multiple times for statistical rigor
- [ ] Task 542: Implement bootstrapping for confidence intervals
- [ ] Task 543: Calculate error bars on success rate
- [ ] Task 544: Calculate statistical significance between runs
- [ ] Task 545: Implement A/B test comparison
- [ ] Task 546: Implement multi-run aggregation
- [ ] Task 547: Track run variance
- [ ] Task 548: Track run consistency
- [ ] Task 549: Implement configuration snapshot reproducibility
- [ ] Task 550: Record all agent settings per run
- [ ] Task 551: Record all environment variables per run
- [ ] Task 552: Record all model versions per run
- [ ] Task 553: Record all browser versions per run
- [ ] Task 554: Implement run reproducibility verification
- [ ] Task 555: Implement failure reason categorization
- [ ] Task 556: Extract raw failure reasons from judge
- [ ] Task 557: Cluster failure reasons into categories
- [ ] Task 558: Track failure category frequency
- [ ] Task 559: Generate failure category report
- [ ] Task 560: Implement daily failure mode sampling

### 6.3 Quality Scoring Engine (Tasks 561-580)

**Goal:** Log-normal scoring with categories, weighted audits.

- [ ] Task 561: Create `packages/quality/src/scoring-engine.ts`
- [ ] Task 562: Implement log-normal scoring function
- [ ] Task 563: Parameterize scoring with p10 control point
- [ ] Task 564: Parameterize scoring with median control point
- [ ] Task 565: Implement category weighting
- [ ] Task 566: Define categories: accessibility, performance, visual, functional
- [ ] Task 567: Define category weights (configurable)
- [ ] Task 568: Implement weighted audit references per category
- [ ] Task 569: Calculate category scores
- [ ] Task 570: Calculate overall quality score
- [ ] Task 571: Generate score breakdown
- [ ] Task 572: Generate score trend over time
- [ ] Task 573: Generate score comparison with baseline
- [ ] Task 574: Implement score threshold alerts
- [ ] Task 575: Implement score regression detection
- [ ] Task 576: Implement score improvement detection
- [ ] Task 577: Generate quality report card
- [ ] Task 578: Export scores to JSON
- [ ] Task 579: Export scores to CSV
- [ ] Task 580: Export scores to dashboard API

---

## Part 7: Accessibility & Performance (Tasks 581-680)

### 7.1 Accessibility Rule Engine (Tasks 581-630)

**Goal:** Three-tier Rule → Check → Result model, custom rule engine.

- [ ] Task 581: Create `packages/a11y/src/rule-engine.ts`
- [ ] Task 582: Define `Rule` class with `any`, `all`, `none` check composition
- [ ] Task 583: Define `Check` class with evaluation function
- [ ] Task 584: Define `Result` class with pass/fail/incomplete
- [ ] Task 585: Implement `any` composition (OR logic)
- [ ] Task 586: Implement `all` composition (AND logic)
- [ ] Task 587: Implement `none` composition (NAND logic)
- [ ] Task 588: Create `packages/a11y/src/virtual-node.ts`
- [ ] Task 589: Build cached wrapper around Playwright Locator
- [ ] Task 590: Implement lazy property evaluation
- [ ] Task 591: Implement DOM caching for repeated queries
- [ ] Task 592: Implement cache invalidation on DOM change
- [ ] Task 593: Create `packages/a11y/src/standards.ts`
- [ ] Task 594: Define ARIA roles data
- [ ] Task 595: Define ARIA attributes data
- [ ] Task 596: Define HTML elements data
- [ ] Task 597: Define CSS properties data
- [ ] Task 598: Define WCAG criteria data
- [ ] Task 599: Create `packages/a11y/src/impact.ts`
- [ ] Task 600: Define impact levels: minor, moderate, serious, critical
- [ ] Task 601: Implement impact aggregation as monoid with `max`
- [ ] Task 602: Use Effect's `Order` module for impact comparison
- [ ] Task 603: Create `packages/a11y/src/failure-summary.ts`
- [ ] Task 604: Implement message templates with data binding
- [ ] Task 605: Define pass message templates
- [ ] Task 606: Define fail message templates
- [ ] Task 607: Define incomplete message templates
- [ ] Task 608: Implement `${data.property}` interpolation
- [ ] Task 609: Generate human-readable remediation guidance
- [ ] Task 610: Generate fix code examples
- [ ] Task 611: Generate fix links to documentation
- [ ] Task 612: Create `packages/a11y/src/scanner.ts`
- [ ] Task 613: Implement tree-walking DOM scanner
- [ ] Task 614: Run all rules against all elements
- [ ] Task 615: Collect violations, passes, incomplete
- [ ] Task 616: Generate accessibility report
- [ ] Task 617: Create custom rule definitions as JSON data
- [ ] Task 618: Define rules for common patterns
- [ ] Task 619: Define rules for form accessibility
- [ ] Task 620: Define rules for navigation accessibility
- [ ] Task 621: Define rules for media accessibility
- [ ] Task 622: Define rules for dynamic content accessibility
- [ ] Task 623: Implement custom check evaluate functions
- [ ] Task 624: Implement color contrast check
- [ ] Task 625: Implement focus visible check
- [ ] Task 626: Implement heading order check
- [ ] Task 627: Implement alt text check
- [ ] Task 628: Implement ARIA attribute check
- [ ] Task 629: Implement keyboard trap check
- [ ] Task 630: Implement screen reader compatibility check

### 7.2 Performance Audit Pipeline (Tasks 631-680)

**Goal:** Custom audit pipeline with gatherer lifecycle, computed artifacts, web vitals.

- [ ] Task 631: Create `packages/lighthouse-quality/src/gatherer.ts`
- [ ] Task 632: Implement 5-phase gatherer lifecycle
- [ ] Task 633: Phase 1: `beforePass` — setup instrumentation
- [ ] Task 634: Phase 2: `pass` — collect data during page load
- [ ] Task 635: Phase 3: `afterPass` — teardown instrumentation
- [ ] Task 636: Phase 4: `compute` — compute artifacts from collected data
- [ ] Task 637: Phase 5: `audit` — run audits against artifacts
- [ ] Task 638: Map lifecycle to Effect's `acquireRelease`
- [ ] Task 639: Create `packages/lighthouse-quality/src/computed-artifacts.ts`
- [ ] Task 640: Implement `makeComputedArtifact()` decorator
- [ ] Task 641: Implement memoization by input
- [ ] Task 642: Implement cache invalidation
- [ ] Task 643: Create `packages/lighthouse-quality/src/web-vitals.ts`
- [ ] Task 644: Implement FCP (First Contentful Paint) collection
- [ ] Task 645: Implement LCP (Largest Contentful Paint) collection
- [ ] Task 646: Implement CLS (Cumulative Layout Shift) collection
- [ ] Task 647: Implement INP (Interaction to Next Paint) collection
- [ ] Task 648: Implement TTFB (Time to First Byte) collection
- [ ] Task 649: Create `packages/lighthouse-quality/src/cls-session.ts`
- [ ] Task 650: Implement CLS session grouping
- [ ] Task 651: 1000ms gap between sessions
- [ ] Task 652: 5000ms max session duration
- [ ] Task 653: Return max session score
- [ ] Task 654: Create `packages/lighthouse-quality/src/inp-calc.ts`
- [ ] Task 655: Implement INP via 98th percentile
- [ ] Task 656: Implement nearest-rank method on EventTiming trace events
- [ ] Task 657: Create `packages/lighthouse-quality/src/loaf-tracker.ts`
- [ ] Task 658: Implement LoAF (Long Animation Frame) detection
- [ ] Task 659: Filter LongAnimationFrame events after FCP
- [ ] Task 660: Track LoAF duration, scripts, style recalc
- [ ] Task 661: Create `packages/lighthouse-quality/src/trace-processor.ts`
- [ ] Task 662: Implement trace parsing
- [ ] Task 663: Implement task tree building
- [ ] Task 664: Implement main thread activity calculation
- [ ] Task 665: Create `packages/lighthouse-quality/src/network-analysis.ts`
- [ ] Task 666: Implement resource loading analysis
- [ ] Task 667: Implement critical resource detection
- [ ] Task 668: Implement render-blocking resource detection
- [ ] Task 669: Implement unused CSS detection
- [ ] Task 670: Implement unused JS detection
- [ ] Task 671: Implement image optimization detection
- [ ] Task 672: Implement font loading analysis
- [ ] Task 673: Implement third-party impact analysis
- [ ] Task 674: Create `packages/lighthouse-quality/src/scoring.ts`
- [ ] Task 675: Implement log-normal scoring for audits
- [ ] Task 676: Parameterize by p10 and median control points
- [ ] Task 677: Implement performance score calculation
- [ ] Task 678: Implement performance budget checking
- [ ] Task 679: Implement historical performance tracking
- [ ] Task 680: Generate performance report with recommendations

---

## Part 8: Safety & Reliability (Tasks 681-760)

### 8.1 Recovery & Loop Detection (Tasks 681-720)

**Goal:** Real recovery executors, enhanced loop detection, fallback chains.

- [ ] Task 681: Implement real recovery executors (no simulation-mode)
- [ ] Task 682: Implement `reScan` recovery — re-scan page for elements
- [ ] Task 683: Implement `refresh` recovery — reload page
- [ ] Task 684: Implement `goBack` recovery — navigate back
- [ ] Task 685: Implement `retryAction` recovery — retry with different selector
- [ ] Task 686: Implement `skipStep` recovery — skip failing step
- [ ] Task 687: Implement `alternativeAction` recovery — try different approach
- [ ] Task 688: Implement `resetState` recovery — reset to known good state
- [ ] Task 689: Implement `compactContext` recovery — reduce context size
- [ ] Task 690: Implement `switchModel` recovery — try different LLM
- [ ] Task 691: Implement `humanHelp` recovery — request human assistance
- [ ] Task 692: Implement `terminate` recovery — stop execution
- [ ] Task 693: Enhance `LoopDetector` with page fingerprinting
- [ ] Task 694: Compute action hash with normalization
- [ ] Task 695: Sort search tokens in action hash
- [ ] Task 696: Strip click indices in action hash
- [ ] Task 697: Track action hash repetition count
- [ ] Task 698: Compute page fingerprint: URL + element count + text hash
- [ ] Task 699: Track page fingerprint changes
- [ ] Task 700: Detect action loop with same page (stagnation)
- [ ] Task 701: Detect action loop with different pages (cycling)
- [ ] Task 702: Implement escalating nudges at 5, 8, 12 repetitions
- [ ] Task 703: Nudge 1: Gentle reminder of goal
- [ ] Task 704: Nudge 2: Suggest different approach
- [ ] Task 705: Nudge 3: Force different action type
- [ ] Task 706: Implement stall detection (no progress for N steps)
- [ ] Task 707: Implement exploration nudge when stuck
- [ ] Task 708: Implement plan replan nudge after stall
- [ ] Task 709: Create `packages/agent-governance/src/fallback-chains.ts`
- [ ] Task 710: Implement Playwright API → JS elementFromPoint → direct JS value
- [ ] Task 711: Implement selector fallback: CSS → XPath → text → role
- [ ] Task 712: Implement click fallback: click → dispatchEvent → set value
- [ ] Task 713: Implement type fallback: type → fill → evaluate
- [ ] Task 714: Implement wait fallback: waitForSelector → waitForTimeout → poll
- [ ] Task 715: Implement extract fallback: textContent → innerHTML → outerHTML
- [ ] Task 716: Track fallback chain usage
- [ ] Task 717: Track fallback chain success rate
- [ ] Task 718: Log fallback chain for debugging
- [ ] Task 719: Implement fallback chain timeout
- [ ] Task 720: Implement fallback chain abort on critical failure

### 8.2 Safety Guards (Tasks 721-760)

**Goal:** Max steps, timeout, resource limits, structured error communication.

- [ ] Task 721: Implement max steps limit
- [ ] Task 722: Implement per-step timeout
- [ ] Task 723: Implement total execution timeout
- [ ] Task 724: Implement token budget limit
- [ ] Task 725: Implement cost budget limit
- [ ] Task 726: Implement memory usage limit
- [ ] Task 727: Implement CPU usage limit
- [ ] Task 728: Implement network request limit
- [ ] Task 729: Implement DOM size limit
- [ ] Task 730: Implement screenshot count limit
- [ ] Task 731: Implement action count limit per step
- [ ] Task 732: Implement retry limit per action
- [ ] Task 733: Implement consecutive failure limit
- [ ] Task 734: Implement budget warning at 75%
- [ ] Task 735: Inject budget warning into agent prompt
- [ ] Task 736: Implement resource cleanup on limit reached
- [ ] Task 737: Implement graceful shutdown on limit reached
- [ ] Task 738: Implement emergency stop via signal
- [ ] Task 739: Create `packages/agent-governance/src/error-classifier.ts`
- [ ] Task 740: Classify errors as transient vs permanent
- [ ] Task 741: Classify errors as recoverable vs unrecoverable
- [ ] Task 742: Classify errors as agent fault vs environment fault
- [ ] Task 743: Implement structured error communication
- [ ] Task 744: `BrowserError` carries `shortTermMemory` (shown once)
- [ ] Task 745: `BrowserError` carries `longTermMemory` (persisted)
- [ ] Task 746: Implement error deduplication
- [ ] Task 747: Implement error aggregation
- [ ] Task 748: Implement error rate tracking
- [ ] Task 749: Implement error alerting
- [ ] Task 750: Implement error recovery suggestions
- [ ] Task 751: Create `packages/agent-governance/src/nudge-system.ts`
- [ ] Task 752: Define nudge types: reminder, suggestion, force
- [ ] Task 753: Implement nudge escalation policy
- [ ] Task 754: Implement nudge cooldown period
- [ ] Task 755: Track nudge effectiveness
- [ ] Task 756: Implement nudge logging
- [ ] Task 757: Implement nudge history in agent state
- [ ] Task 758: Implement nudge injection into prompt
- [ ] Task 759: Implement nudge removal after resolution
- [ ] Task 760: Implement nudge analytics

---

## Part 9: CI Mode & Parallel Execution (Tasks 761-860)

### 9.1 CI Mode (Tasks 761-800)

**Goal:** Headless execution with exit codes, JUnit/XML output, artifact upload, flaky test retry.

- [ ] Task 761: Create `packages/orchestrator/src/ci-mode.ts`
- [ ] Task 762: Implement headless browser configuration
- [ ] Task 763: Implement exit code semantics: 0=pass, 1=fail, 2=partial
- [ ] Task 764: Implement JUnit report output
- [ ] Task 765: Implement XML report output
- [ ] Task 766: Implement JSON report output
- [ ] Task 767: Implement Markdown report output
- [ ] Task 768: Implement HTML report output
- [ ] Task 769: Implement artifact upload (screenshots)
- [ ] Task 770: Implement artifact upload (replay recordings)
- [ ] Task 771: Implement artifact upload (execution logs)
- [ ] Task 772: Implement artifact upload (agent history)
- [ ] Task 773: Implement flaky test retry (N times before failing)
- [ ] Task 774: Implement flaky test detection (inconsistent results)
- [ ] Task 775: Implement flaky test quarantine
- [ ] Task 776: Implement flaky test report
- [ ] Task 777: Implement CI environment detection
- [ ] Task 778: Auto-enable CI mode in CI environments
- [ ] Task 779: Implement CI-specific timeouts
- [ ] Task 780: Implement CI-specific resource limits
- [ ] Task 781: Implement CI-specific logging (structured, machine-readable)
- [ ] Task 782: Implement GitHub Actions integration
- [ ] Task 783: Implement GitLab CI integration
- [ ] Task 784: Implement CircleCI integration
- [ ] Task 785: Implement Jenkins integration
- [ ] Task 786: Implement Azure DevOps integration
- [ ] Task 787: Implement PR comment posting with results
- [ ] Task 788: Implement PR check status update
- [ ] Task 789: Implement PR diff annotation
- [ ] Task 790: Implement commit status update
- [ ] Task 791: Implement Slack notification on failure
- [ ] Task 792: Implement email notification on failure
- [ ] Task 793: Implement webhook notification
- [ ] Task 794: Implement CI dashboard
- [ ] Task 795: Implement CI trend analysis
- [ ] Task 796: Implement CI flakiness trend
- [ ] Task 797: Implement CI cost tracking
- [ ] Task 798: Implement CI duration tracking
- [ ] Task 799: Implement CI success rate tracking
- [ ] Task 800: Implement CI quality score tracking

### 9.2 Parallel Execution (Tasks 801-860)

**Goal:** Massive parallelization for evaluation and testing.

- [ ] Task 801: Create `packages/orchestrator/src/parallel-executor.ts`
- [ ] Task 802: Implement task queue for parallel execution
- [ ] Task 803: Implement worker pool management
- [ ] Task 804: Implement dynamic worker scaling
- [ ] Task 805: Implement worker health checks
- [ ] Task 806: Implement worker recovery on crash
- [ ] Task 807: Implement task distribution across workers
- [ ] Task 808: Implement task result aggregation
- [ ] Task 809: Implement progress tracking across workers
- [ ] Task 810: Implement cancellation across all workers
- [ ] Task 811: Implement timeout per worker
- [ ] Task 812: Implement resource isolation per worker
- [ ] Task 813: Implement browser instance per worker
- [ ] Task 814: Implement cookie isolation per worker
- [ ] Task 815: Implement network isolation per worker
- [ ] Task 816: Implement result merging strategies
- [ ] Task 817: Implement conflict resolution for parallel results
- [ ] Task 818: Implement parallel test execution
- [ ] Task 819: Implement parallel plan generation
- [ ] Task 820: Implement parallel diff analysis
- [ ] Task 821: Implement parallel LLM calls (unbounded concurrency)
- [ ] Task 822: Implement parallel browser operations
- [ ] Task 823: Implement parallel screenshot capture
- [ ] Task 824: Implement parallel DOM collection
- [ ] Task 825: Implement parallel evaluation
- [ ] Task 826: Implement parallel reporting
- [ ] Task 827: Implement parallel artifact upload
- [ ] Task 828: Implement parallel notification sending
- [ ] Task 829: Implement parallel history recording
- [ ] Task 830: Implement parallel trajectory recording
- [ ] Task 831: Implement parallel stability detection
- [ ] Task 832: Implement parallel loop detection
- [ ] Task 833: Implement parallel recovery execution
- [ ] Task 834: Implement parallel checkpoint saving
- [ ] Task 835: Implement parallel cache updates
- [ ] Task 836: Implement parallel pattern store updates
- [ ] Task 837: Implement parallel todo tracking
- [ ] Task 838: Implement parallel compaction
- [ ] Task 839: Implement parallel masking
- [ ] Task 840: Implement parallel observability
- [ ] Task 841: Implement parallel metrics collection
- [ ] Task 842: Implement parallel tracing
- [ ] Task 843: Implement parallel cost tracking
- [ ] Task 844: Implement parallel analytics
- [ ] Task 845: Implement parallel dashboard updates
- [ ] Task 846: Implement parallel session recording
- [ ] Task 847: Implement parallel HAR recording
- [ ] Task 848: Implement parallel video export
- [ ] Task 849: Implement parallel screenshot diffing
- [ ] Task 850: Implement parallel accessibility auditing
- [ ] Task 851: Implement parallel performance auditing
- [ ] Task 852: Implement parallel security scanning
- [ ] Task 853: Implement parallel chaos testing
- [ ] Task 854: Implement parallel mocking
- [ ] Task 855: Implement parallel resilience testing
- [ ] Task 856: Implement parallel workflow execution
- [ ] Task 857: Implement parallel service orchestration
- [ ] Task 858: Implement parallel enterprise operations
- [ ] Task 859: Implement parallel SDK operations
- [ ] Task 860: Implement parallel MCP server handling

---

## Part 10: Session Recording & Replay (Tasks 861-920)

### 10.1 Enhanced Session Recording (Tasks 861-900)

**Goal:** Full session recording with mutation buffer, snapshots, compression, replay.

- [ ] Task 861: Enhance `@inspect/session` with rrweb integration
- [ ] Task 862: Implement MutationBuffer with dedup and ordering
- [ ] Task 863: Implement full snapshot with recursive serialization
- [ ] Task 864: Implement Mirror (bidirectional ID map: id ↔ node)
- [ ] Task 865: Implement freeze/lock mechanism during interactions
- [ ] Task 866: Implement checkout system (periodic full snapshots)
- [ ] Task 867: Implement zlib compression with fflate + base64
- [ ] Task 868: Implement event serialization
- [ ] Task 869: Implement event deserialization
- [ ] Task 870: Implement event streaming to storage
- [ ] Task 871: Implement event batching for efficiency
- [ ] Task 872: Implement event filtering (exclude noise)
- [ ] Task 873: Implement event annotation (add metadata)
- [ ] Task 874: Implement event tagging (categorize events)
- [ ] Task 875: Implement event search
- [ ] Task 876: Implement event indexing
- [ ] Task 877: Implement event compression ratio tracking
- [ ] Task 878: Implement event storage size tracking
- [ ] Task 879: Implement event retention policy
- [ ] Task 880: Implement event archival to cold storage
- [ ] Task 881: Implement replay player with XState
- [ ] Task 882: Implement replay speed control (0.5x, 1x, 2x, 4x)
- [ ] Task 883: Implement replay seek to timestamp
- [ ] Task 884: Implement replay step-by-step navigation
- [ ] Task 885: Implement replay pause/resume
- [ ] Task 886: Implement replay event highlighting
- [ ] Task 887: Implement replay action overlay
- [ ] Task 888: Implement replay error overlay
- [ ] Task 889: Implement replay DOM state inspection
- [ ] Task 890: Implement replay network inspection
- [ ] Task 891: Implement replay console inspection
- [ ] Task 892: Implement replay screenshot comparison
- [ ] Task 893: Implement replay export to video
- [ ] Task 894: Implement replay export to GIF
- [ ] Task 895: Implement replay share via URL
- [ ] Task 896: Implement replay embedding in reports
- [ ] Task 897: Implement replay annotation
- [ ] Task 898: Implement replay commenting
- [ ] Task 899: Implement replay bookmarking
- [ ] Task 900: Implement replay playlist (multiple sessions)

### 10.2 Video & Visual Export (Tasks 901-920)

**Goal:** Video compositions, scenes, visual export.

- [ ] Task 901: Complete `@inspect/video` Remotion integration
- [ ] Task 902: Implement video composition from session recording
- [ ] Task 903: Implement scene definitions
- [ ] Task 904: Implement scene transitions
- [ ] Task 905: Implement title cards
- [ ] Task 906: Implement end cards
- [ ] Task 907: Implement screenshot slideshow
- [ ] Task 908: Implement action annotation overlay
- [ ] Task 909: Implement result annotation overlay
- [ ] Task 910: Implement error annotation overlay
- [ ] Task 911: Implement quality score overlay
- [ ] Task 912: Implement timing overlay
- [ ] Task 913: Implement cost overlay
- [ ] Task 914: Implement video export to MP4
- [ ] Task 915: Implement video export to WebM
- [ ] Task 916: Implement video export to GIF
- [ ] Task 917: Implement video upload to cloud storage
- [ ] Task 918: Implement video share via URL
- [ ] Task 919: Implement video embedding in reports
- [ ] Task 920: Implement video thumbnail generation

---

## Part 11: Self-Improvement Loop (Tasks 921-980)

### 11.1 Automated Self-Improvement (Tasks 921-960)

**Goal:** Agent evaluates itself, finds flaws, writes patches, proves success statistically.

- [ ] Task 921: Create `packages/orchestrator/src/self-improvement.ts`
- [ ] Task 922: Implement automated eval on every PR
- [ ] Task 923: Implement regression detection on PR
- [ ] Task 924: Implement improvement detection on PR
- [ ] Task 925: Implement eval result posting to PR
- [ ] Task 926: Implement eval result posting to Slack
- [ ] Task 927: Implement MCP server for eval triggering
- [ ] Task 928: Implement agent-driven eval orchestration
- [ ] Task 929: Implement eval result querying via SQL
- [ ] Task 930: Implement statistical A/B analysis
- [ ] Task 931: Implement delta explanation
- [ ] Task 932: Implement fix suggestion generation
- [ ] Task 933: Implement automatic patch generation
- [ ] Task 934: Implement patch verification via eval
- [ ] Task 935: Implement closed-loop self-improvement
- [ ] Task 936: Track improvement over time
- [ ] Task 937: Track improvement velocity
- [ ] Task 938: Track improvement success rate
- [ ] Task 939: Implement improvement report generation
- [ ] Task 940: Implement improvement recommendation engine
- [ ] Task 941: Implement pattern-based improvement suggestions
- [ ] Task 942: Implement failure pattern learning
- [ ] Task 943: Implement success pattern replication
- [ ] Task 944: Implement cross-task pattern learning
- [ ] Task 945: Implement cross-model pattern learning
- [ ] Task 946: Implement cross-site pattern learning
- [ ] Task 947: Implement domain-specific optimization
- [ ] Task 948: Implement prompt optimization
- [ ] Task 949: Implement tool optimization
- [ ] Task 950: Implement action optimization
- [ ] Task 951: Implement strategy optimization
- [ ] Task 952: Implement configuration optimization
- [ ] Task 953: Implement model selection optimization
- [ ] Task 954: Implement timeout optimization
- [ ] Task 955: Implement retry policy optimization
- [ ] Task 956: Implement resource allocation optimization
- [ ] Task 957: Implement cost optimization
- [ ] Task 958: Implement speed optimization
- [ ] Task 959: Implement quality optimization
- [ ] Task 960: Implement reliability optimization

### 11.2 Observability at Scale (Tasks 961-980)

**Goal:** Stream every token, prompt, timing metric, cost into queryable dataset.

- [ ] Task 961: Implement token streaming to observability
- [ ] Task 962: Implement prompt streaming to observability
- [ ] Task 963: Implement timing metric streaming
- [ ] Task 964: Implement cost streaming
- [ ] Task 965: Implement browser session recording to observability
- [ ] Task 966: Implement frame saving to observability
- [ ] Task 967: Implement real-time dashboard state sync
- [ ] Task 968: Implement active run tracking
- [ ] Task 969: Implement result tracking
- [ ] Task 970: Implement queryable dataset API
- [ ] Task 971: Implement SQL query interface
- [ ] Task 972: Implement GraphQL query interface
- [ ] Task 973: Implement REST query interface
- [ ] Task 974: Implement dataset export
- [ ] Task 975: Implement dataset import
- [ ] Task 976: Implement dataset versioning
- [ ] Task 977: Implement dataset retention policy
- [ ] Task 978: Implement dataset archival
- [ ] Task 979: Implement dataset analytics
- [ ] Task 980: Implement dataset visualization

---

## Part 12: TUI State Flow & UX (Tasks 981-1020)

### 12.1 TUI Architecture (Tasks 981-1000)

**Goal:** Define TUI state flow, live view, plan review, error display.

- [ ] Task 981: Define TUI state machine
- [ ] Task 982: Define states: idle, planning, reviewing, executing, complete, error
- [ ] Task 983: Define transitions between states
- [ ] Task 984: Define state data requirements
- [ ] Task 985: Implement state persistence
- [ ] Task 986: Implement state restoration
- [ ] Task 987: Implement state validation
- [ ] Task 988: Implement state logging
- [ ] Task 989: Implement state analytics
- [ ] Task 990: Implement orchestrator state publishing via PubSub
- [ ] Task 991: Implement IPC mechanism for CLI ↔ orchestrator
- [ ] Task 992: Implement live view for step progress
- [ ] Task 993: Implement live browser screenshot streaming
- [ ] Task 994: Implement plan review/approval flow
- [ ] Task 995: Implement plan editing in TUI
- [ ] Task 996: Implement plan step reordering
- [ ] Task 997: Implement plan step removal
- [ ] Task 998: Implement plan step addition
- [ ] Task 999: Implement real-time error display with fix guidance
- [ ] Task 1000: Implement error recovery suggestions in TUI

### 12.2 UX Enhancements (Tasks 1001-1020)

**Goal:** World-class user experience.

- [ ] Task 1001: Implement keyboard shortcuts for all actions
- [ ] Task 1002: Implement command palette
- [ ] Task 1003: Implement search across all screens
- [ ] Task 1004: Implement filtering across all screens
- [ ] Task 1005: Implement sorting across all screens
- [ ] Task 1006: Implement pagination for large result sets
- [ ] Task 1007: Implement virtual scrolling for large lists
- [ ] Task 1008: Implement lazy loading for heavy content
- [ ] Task 1009: Implement skeleton loading states
- [ ] Task 1010: Implement error boundaries for all screens
- [ ] Task 1011: Implement retry on error
- [ ] Task 1012: Implement offline mode
- [ ] Task 1013: Implement dark mode
- [ ] Task 1014: Implement light mode
- [ ] Task 1015: Implement theme customization
- [ ] Task 1016: Implement accessibility for TUI (screen reader support)
- [ ] Task 1017: Implement internationalization
- [ ] Task 1018: Implement help system
- [ ] Task 1019: Implement onboarding flow
- [ ] Task 1020: Implement tutorial mode

---

## Part 13: MCP Server & Integrations (Tasks 1021-1080)

### 13.1 MCP Server (Tasks 1021-1050)

**Goal:** Full MCP server for external tool integration.

- [ ] Task 1021: Build full `@inspect/mcp` server
- [ ] Task 1022: Implement `inspect_run` tool — run test plan
- [ ] Task 1023: Implement `inspect_plan` tool — generate test plan
- [ ] Task 1024: Implement `inspect_diff` tool — analyze git diff
- [ ] Task 1025: Implement `inspect_a11y` tool — run accessibility audit
- [ ] Task 1026: Implement `inspect_perf` tool — run performance audit
- [ ] Task 1027: Implement `inspect_visual` tool — run visual regression
- [ ] Task 1028: Implement `inspect_security` tool — run security scan
- [ ] Task 1029: Implement `inspect_chaos` tool — run chaos test
- [ ] Task 1030: Implement `inspect_crawl` tool — crawl website
- [ ] Task 1031: Implement `inspect_extract` tool — extract data from page
- [ ] Task 1032: Implement `inspect_screenshot` tool — take screenshot
- [ ] Task 1033: Implement `inspect_replay` tool — replay session
- [ ] Task 1034: Implement `inspect_compare` tool — compare two runs
- [ ] Task 1035: Implement `inspect_status` tool — get run status
- [ ] Task 1036: Implement `inspect_history` tool — get run history
- [ ] Task 1037: Implement `inspect_results` tool — get run results
- [ ] Task 1038: Implement `inspect_artifacts` tool — get run artifacts
- [ ] Task 1039: Implement `inspect_config` tool — get/set configuration
- [ ] Task 1040: Implement `inspect_models` tool — list available models
- [ ] Task 1041: Implement `inspect_devices` tool — list device presets
- [ ] Task 1042: Implement `inspect_agents` tool — list agent configurations
- [ ] Task 1043: Implement `inspect_workflows` tool — list workflows
- [ ] Task 1044: Implement `inspect_credentials` tool — manage credentials
- [ ] Task 1045: Implement `inspect_proxy` tool — manage proxy settings
- [ ] Task 1046: Implement `inspect_tunnel` tool — manage tunnels
- [ ] Task 1047: Implement `inspect_dashboard` tool — get dashboard data
- [ ] Task 1048: Implement `inspect_report` tool — generate report
- [ ] Task 1049: Implement `inspect_export` tool — export data
- [ ] Task 1050: Implement `inspect_import` tool — import data

### 13.2 External Integrations (Tasks 1051-1080)

**Goal:** Integrate with coding agents, CI/CD, cloud providers.

- [ ] Task 1051: Implement Claude Code ACP integration
- [ ] Task 1052: Implement Codex ACP integration
- [ ] Task 1053: Implement Cursor ACP integration
- [ ] Task 1054: Implement GitHub Copilot integration
- [ ] Task 1055: Implement Zed Claude Agent ACP integration
- [ ] Task 1056: Implement ACP client with SSE streaming
- [ ] Task 1057: Implement ACP authentication
- [ ] Task 1058: Implement ACP session management
- [ ] Task 1059: Implement ACP message routing
- [ ] Task 1060: Implement ACP error handling
- [ ] Task 1061: Implement cloud browser provider (BrowserStack)
- [ ] Task 1062: Implement cloud browser provider (SauceLabs)
- [ ] Task 1063: Implement cloud browser provider (LambdaTest)
- [ ] Task 1064: Implement cloud browser provider (Percy)
- [ ] Task 1065: Implement cloud session pool management
- [ ] Task 1066: Implement cloud session failover
- [ ] Task 1067: Implement cloud session cost tracking
- [ ] Task 1068: Implement cloud session performance tracking
- [ ] Task 1069: Implement iOS simulator integration
- [ ] Task 1070: Implement Android emulator integration
- [ ] Task 1071: Implement Docker container integration
- [ ] Task 1072: Implement Kubernetes integration
- [ ] Task 1073: Implement GitHub Actions integration
- [ ] Task 1074: Implement GitLab CI integration
- [ ] Task 1075: Implement CircleCI integration
- [ ] Task 1076: Implement Jenkins integration
- [ ] Task 1077: Implement Azure DevOps integration
- [ ] Task 1078: Implement Slack integration
- [ ] Task 1079: Implement Discord integration
- [ ] Task 1080: Implement email integration

---

## Part 14: Testing Infrastructure (Tasks 1081-1140)

### 14.1 Unit Tests (Tasks 1081-1100)

**Goal:** Comprehensive unit test coverage for all packages.

- [ ] Task 1081: Add unit tests for `@inspect/shared` schemas
- [ ] Task 1082: Add unit tests for `@inspect/shared` errors
- [ ] Task 1083: Add unit tests for `@inspect/shared` event bus
- [ ] Task 1084: Add unit tests for `@inspect/shared` circuit breaker
- [ ] Task 1085: Add unit tests for `@inspect/shared` assertions
- [ ] Task 1086: Add unit tests for `@inspect/orchestrator` executor
- [ ] Task 1087: Add unit tests for `@inspect/orchestrator` recovery
- [ ] Task 1088: Add unit tests for `@inspect/orchestrator` loop detector
- [ ] Task 1089: Add unit tests for `@inspect/orchestrator` scheduler
- [ ] Task 1090: Add unit tests for `@inspect/orchestrator` planner
- [ ] Task 1091: Add unit tests for `@inspect/browser` browser manager
- [ ] Task 1092: Add unit tests for `@inspect/browser` page manager
- [ ] Task 1093: Add unit tests for `@inspect/browser` DOM capture
- [ ] Task 1094: Add unit tests for `@inspect/browser` screenshot capture
- [ ] Task 1095: Add unit tests for `@inspect/browser` session recorder
- [ ] Task 1096: Add unit tests for `@inspect/llm` providers
- [ ] Task 1097: Add unit tests for `@inspect/llm` router
- [ ] Task 1098: Add unit tests for `@inspect/llm` rate limiter
- [ ] Task 1099: Add unit tests for `@inspect/agent-memory` compactor
- [ ] Task 1100: Add unit tests for `@inspect/agent-tools` registry

### 14.2 Integration Tests (Tasks 1101-1120)

**Goal:** Integration tests for cross-package interactions.

- [ ] Task 1101: Add integration tests for agent loop
- [ ] Task 1102: Add integration tests for browser automation
- [ ] Task 1103: Add integration tests for cookie extraction
- [ ] Task 1104: Add integration tests for LLM routing
- [ ] Task 1105: Add integration tests for diff analysis
- [ ] Task 1106: Add integration tests for test planning
- [ ] Task 1107: Add integration tests for test execution
- [ ] Task 1108: Add integration tests for evaluation
- [ ] Task 1109: Add integration tests for reporting
- [ ] Task 1110: Add integration tests for session recording
- [ ] Task 1111: Add integration tests for accessibility auditing
- [ ] Task 1112: Add integration tests for performance auditing
- [ ] Task 1113: Add integration tests for visual regression
- [ ] Task 1114: Add integration tests for security scanning
- [ ] Task 1115: Add integration tests for chaos testing
- [ ] Task 1116: Add integration tests for workflow execution
- [ ] Task 1117: Add integration tests for API server
- [ ] Task 1118: Add integration tests for MCP server
- [ ] Task 1119: Add integration tests for CLI commands
- [ ] Task 1120: Add integration tests for TUI screens

### 14.3 E2E Tests (Tasks 1121-1140)

**Goal:** End-to-end tests for complete workflows.

- [ ] Task 1121: Add E2E test for full test run (diff → plan → execute → report)
- [ ] Task 1122: Add E2E test for PR testing workflow
- [ ] Task 1123: Add E2E test for branch testing workflow
- [ ] Task 1124: Add E2E test for commit testing workflow
- [ ] Task 1125: Add E2E test for working tree testing workflow
- [ ] Task 1126: Add E2E test for authenticated testing (cookies)
- [ ] Task 1127: Add E2E test for multi-device testing
- [ ] Task 1128: Add E2E test for multi-browser testing
- [ ] Task 1129: Add E2E test for accessibility audit
- [ ] Task 1130: Add E2E test for performance audit
- [ ] Task 1131: Add E2E test for visual regression
- [ ] Task 1132: Add E2E test for security scan
- [ ] Task 1133: Add E2E test for chaos test
- [ ] Task 1134: Add E2E test for workflow execution
- [ ] Task 1135: Add E2E test for CI mode
- [ ] Task 1136: Add E2E test for parallel execution
- [ ] Task 1137: Add E2E test for self-improvement loop
- [ ] Task 1138: Add E2E test for MCP server
- [ ] Task 1139: Add E2E test for API server
- [ ] Task 1140: Add E2E test for dashboard

---

## Part 15: Documentation & Developer Experience (Tasks 1141-1180)

### 15.1 Documentation (Tasks 1141-1160)

**Goal:** Comprehensive documentation for all features.

- [ ] Task 1141: Write architecture documentation
- [ ] Task 1142: Write package documentation for all 36 packages
- [ ] Task 1143: Write API documentation for all public APIs
- [ ] Task 1144: Write CLI documentation for all commands
- [ ] Task 1145: Write TUI documentation
- [ ] Task 1146: Write configuration documentation
- [ ] Task 1147: Write agent configuration documentation
- [ ] Task 1148: Write browser configuration documentation
- [ ] Task 1149: Write LLM configuration documentation
- [ ] Task 1150: Write evaluation configuration documentation
- [ ] Task 1151: Write CI/CD integration documentation
- [ ] Task 1152: Write MCP server documentation
- [ ] Task 1153: Write SDK documentation
- [ ] Task 1154: Write plugin development documentation
- [ ] Task 1155: Write custom evaluator documentation
- [ ] Task 1156: Write custom rule documentation
- [ ] Task 1157: Write custom tool documentation
- [ ] Task 1158: Write custom workflow documentation
- [ ] Task 1159: Write troubleshooting guide
- [ ] Task 1160: Write FAQ

### 15.2 Developer Experience (Tasks 1161-1180)

**Goal:** World-class developer experience.

- [ ] Task 1161: Implement `inspect init` — project setup wizard
- [ ] Task 1162: Implement `inspect doctor` — environment health check
- [ ] Task 1163: Implement `inspect install` — dependency installation
- [ ] Task 1164: Implement `inspect generate` — generate test plans from natural language
- [ ] Task 1165: Implement `inspect audit` — comprehensive code audit
- [ ] Task 1166: Implement `inspect show-report` — view report in browser
- [ ] Task 1167: Implement `inspect show-trace` — view trace in browser
- [ ] Task 1168: Implement `inspect alias` — command aliases
- [ ] Task 1169: Implement `inspect devices` — list device presets
- [ ] Task 1170: Implement `inspect agents` — list agent configurations
- [ ] Task 1171: Implement `inspect models` — list available models
- [ ] Task 1172: Implement `inspect completions` — shell completions
- [ ] Task 1173: Implement `inspect serve` — start API server
- [ ] Task 1174: Implement `inspect dashboard` — start dashboard
- [ ] Task 1175: Implement `inspect cost` — show cost breakdown
- [ ] Task 1176: Implement `inspect tunnel` — create secure tunnel
- [ ] Task 1177: Implement `inspect sessions` — list active sessions
- [ ] Task 1178: Implement `inspect engine` — start workflow engine
- [ ] Task 1179: Implement `inspect trail` — show audit trail
- [ ] Task 1180: Implement `inspect autonomy` — show autonomy level

---

## Part 16: Enterprise & Security (Tasks 1181-1220)

### 16.1 Enterprise Features (Tasks 1181-1200)

**Goal:** Enterprise-grade features for large organizations.

- [ ] Task 1181: Implement RBAC (Role-Based Access Control)
- [ ] Task 1182: Implement SSO (Single Sign-On)
- [ ] Task 1183: Implement tenant management
- [ ] Task 1184: Implement hybrid LLM routing
- [ ] Task 1185: Implement team management
- [ ] Task 1186: Implement project management
- [ ] Task 1187: Implement billing integration
- [ ] Task 1188: Implement usage tracking
- [ ] Task 1189: Implement quota management
- [ ] Task 1190: Implement audit logging
- [ ] Task 1191: Implement compliance reporting
- [ ] Task 1192: Implement data retention policies
- [ ] Task 1193: Implement data export
- [ ] Task 1194: Implement data import
- [ ] Task 1195: Implement data encryption at rest
- [ ] Task 1196: Implement data encryption in transit
- [ ] Task 1197: Implement API key management
- [ ] Task 1198: Implement webhook security
- [ ] Task 1199: Implement rate limiting per tenant
- [ ] Task 1200: Implement SLA monitoring

### 16.2 Security (Tasks 1201-1220)

**Goal:** Comprehensive security scanning and protection.

- [ ] Task 1201: Implement OWASP ZAP scanning
- [ ] Task 1202: Implement Nuclei scanning
- [ ] Task 1203: Implement proxy-based scanning
- [ ] Task 1204: Implement sensitive data masking
- [ ] Task 1205: Implement credential vault
- [ ] Task 1206: Implement TOTP generation
- [ ] Task 1207: Implement email polling for OTP
- [ ] Task 1208: Implement SMS polling for OTP
- [ ] Task 1209: Implement Azure KeyVault integration
- [ ] Task 1210: Implement AWS Secrets Manager integration
- [ ] Task 1211: Implement GCP Secret Manager integration
- [ ] Task 1212: Implement HashiCorp Vault integration
- [ ] Task 1213: Implement network proxy management
- [ ] Task 1214: Implement SOCKS5 proxy
- [ ] Task 1215: Implement security data masking
- [ ] Task 1216: Implement stealth browser mode
- [ ] Task 1217: Implement anti-detection measures
- [ ] Task 1218: Implement captcha solving
- [ ] Task 1219: Implement popup handling
- [ ] Task 1220: Implement dialog handling

---

## Part 17: Performance & Optimization (Tasks 1221-1260)

### 17.1 Performance Optimization (Tasks 1221-1240)

**Goal:** Optimize for speed, cost, and reliability.

- [ ] Task 1221: Implement prompt caching optimization
- [ ] Task 1222: Implement token usage optimization
- [ ] Task 1223: Implement LLM call batching
- [ ] Task 1224: Implement DOM collection optimization
- [ ] Task 1225: Implement screenshot compression optimization
- [ ] Task 1226: Implement network request optimization
- [ ] Task 1227: Implement browser launch optimization
- [ ] Task 1228: Implement context creation optimization
- [ ] Task 1229: Implement cookie injection optimization
- [ ] Task 1230: Implement session recording optimization
- [ ] Task 1231: Implement artifact upload optimization
- [ ] Task 1232: Implement report generation optimization
- [ ] Task 1233: Implement dashboard rendering optimization
- [ ] Task 1234: Implement TUI rendering optimization
- [ ] Task 1235: Implement memory usage optimization
- [ ] Task 1236: Implement CPU usage optimization
- [ ] Task 1237: Implement disk usage optimization
- [ ] Task 1238: Implement network bandwidth optimization
- [ ] Task 1239: Implement startup time optimization
- [ ] Task 1240: Implement shutdown time optimization

### 17.2 Cost Optimization (Tasks 1241-1260)

**Goal:** Minimize cost per test run.

- [ ] Task 1241: Implement cost tracking per test run
- [ ] Task 1242: Implement cost tracking per agent
- [ ] Task 1243: Implement cost tracking per model
- [ ] Task 1244: Implement cost tracking per browser
- [ ] Task 1245: Implement cost tracking per device
- [ ] Task 1246: Implement cost tracking per project
- [ ] Task 1247: Implement cost tracking per team
- [ ] Task 1248: Implement cost tracking per tenant
- [ ] Task 1249: Implement cost budget alerts
- [ ] Task 1250: Implement cost optimization suggestions
- [ ] Task 1251: Implement cheaper model routing for simple tasks
- [ ] Task 1252: Implement flash mode for token savings
- [ ] Task 1253: Implement context compaction for token savings
- [ ] Task 1254: Implement prompt caching for token savings
- [ ] Task 1255: Implement action caching for LLM call savings
- [ ] Task 1256: Implement result caching for test run savings
- [ ] Task 1257: Implement parallel execution for time savings
- [ ] Task 1258: Implement incremental testing for change-based savings
- [ ] Task 1259: Implement test prioritization for risk-based savings
- [ ] Task 1260: Implement test deduplication for redundancy savings

---

## Part 18: Monitoring & Alerting (Tasks 1261-1300)

### 18.1 Observability (Tasks 1261-1280)

**Goal:** Comprehensive monitoring with structured logging, tracing, metrics.

- [ ] Task 1261: Implement structured logging for all packages
- [ ] Task 1262: Implement distributed tracing across packages
- [ ] Task 1263: Implement metrics collection for all operations
- [ ] Task 1264: Implement log aggregation
- [ ] Task 1265: Implement trace aggregation
- [ ] Task 1266: Implement metric aggregation
- [ ] Task 1267: Implement log search
- [ ] Task 1268: Implement trace search
- [ ] Task 1269: Implement metric search
- [ ] Task 1270: Implement log visualization
- [ ] Task 1271: Implement trace visualization
- [ ] Task 1272: Implement metric visualization
- [ ] Task 1273: Implement log export
- [ ] Task 1274: Implement trace export
- [ ] Task 1275: Implement metric export
- [ ] Task 1276: Implement log retention policy
- [ ] Task 1277: Implement trace retention policy
- [ ] Task 1278: Implement metric retention policy
- [ ] Task 1279: Implement log archival
- [ ] Task 1280: Implement trace archival

### 18.2 Alerting (Tasks 1281-1300)

**Goal:** Proactive alerting for failures and anomalies.

- [ ] Task 1281: Implement failure alerting
- [ ] Task 1282: Implement performance alerting
- [ ] Task 1283: Implement cost alerting
- [ ] Task 1284: Implement quality alerting
- [ ] Task 1285: Implement security alerting
- [ ] Task 1286: Implement availability alerting
- [ ] Task 1287: Implement anomaly detection
- [ ] Task 1288: Implement trend detection
- [ ] Task 1289: Implement regression detection
- [ ] Task 1290: Implement improvement detection
- [ ] Task 1291: Implement alert routing
- [ ] Task 1292: Implement alert deduplication
- [ ] Task 1293: Implement alert escalation
- [ ] Task 1294: Implement alert suppression
- [ ] Task 1295: Implement alert scheduling
- [ ] Task 1296: Implement alert templates
- [ ] Task 1297: Implement alert testing
- [ ] Task 1298: Implement alert history
- [ ] Task 1299: Implement alert analytics
- [ ] Task 1300: Implement alert dashboard

---

## Part 19: Deployment & Operations (Tasks 1301-1340)

### 19.1 Deployment (Tasks 1301-1320)

**Goal:** Easy deployment across environments.

- [ ] Task 1301: Implement Docker image build
- [ ] Task 1302: Implement Docker Compose configuration
- [ ] Task 1303: Implement Kubernetes deployment
- [ ] Task 1304: Implement Helm chart
- [ ] Task 1305: Implement Terraform module
- [ ] Task 1306: Implement AWS deployment
- [ ] Task 1307: Implement GCP deployment
- [ ] Task 1308: Implement Azure deployment
- [ ] Task 1309: Implement Vercel deployment
- [ ] Task 1310: Implement Railway deployment
- [ ] Task 1311: Implement Fly.io deployment
- [ ] Task 1312: Implement Cloudflare Workers deployment
- [ ] Task 1313: Implement edge deployment
- [ ] Task 1314: Implement serverless deployment
- [ ] Task 1315: Implement container orchestration
- [ ] Task 1316: Implement auto-scaling
- [ ] Task 1317: Implement load balancing
- [ ] Task 1318: Implement health checks
- [ ] Task 1319: Implement readiness probes
- [ ] Task 1320: Implement liveness probes

### 19.2 Operations (Tasks 1321-1340)

**Goal:** Reliable operations in production.

- [ ] Task 1321: Implement configuration management
- [ ] Task 1322: Implement secret management
- [ ] Task 1323: Implement environment management
- [ ] Task 1324: Implement feature flags
- [ ] Task 1325: Implement canary deployments
- [ ] Task 1326: Implement blue-green deployments
- [ ] Task 1327: Implement rolling deployments
- [ ] Task 1328: Implement zero-downtime deployments
- [ ] Task 1329: Implement rollback procedures
- [ ] Task 1330: Implement disaster recovery
- [ ] Task 1331: Implement backup procedures
- [ ] Task 1332: Implement restore procedures
- [ ] Task 1333: Implement migration procedures
- [ ] Task 1334: Implement upgrade procedures
- [ ] Task 1335: Implement downgrade procedures
- [ ] Task 1336: Implement maintenance mode
- [ ] Task 1337: Implement graceful shutdown
- [ ] Task 1338: Implement graceful startup
- [ ] Task 1339: Implement operational runbooks
- [ ] Task 1340: Implement incident response procedures

---

## Part 20: Success Metrics & Verification (Tasks 1341-1360)

### 20.1 Success Metrics (Tasks 1341-1350)

**Goal:** Measurable success criteria.

- [ ] Task 1341: Define Effect-TS adoption metric: 36/36 packages
- [ ] Task 1342: Define real agent loop metric: full LLM-driven loop
- [ ] Task 1343: Define diff-aware test plan metric: LLM-enhanced AST analysis
- [ ] Task 1344: Define multi-tree DOM metric: DOM + Snapshot + AX
- [ ] Task 1345: Define structured thinking metric: AgentBrain output schema compliance
- [ ] Task 1346: Define accessibility metric: WCAG violations caught
- [ ] Task 1347: Define performance metric: Web Vitals accuracy
- [ ] Task 1348: Define stability detection metric: flaky test reduction rate
- [ ] Task 1349: Define CI mode metric: CI integration tests pass
- [ ] Task 1350: Define token efficiency metric: <$0.50 per test run

### 20.2 Verification (Tasks 1351-1360)

**Goal:** Verify all tasks are complete and working.

- [ ] Task 1351: Run `pnpm check` — format, lint, typecheck
- [ ] Task 1352: Run `pnpm test` — all unit tests pass
- [ ] Task 1353: Run `pnpm test:integration` — all integration tests pass
- [ ] Task 1354: Run `pnpm test:e2e` — all E2E tests pass
- [ ] Task 1355: Run `pnpm build` — all packages build
- [ ] Task 1356: Run `inspect test` on sample project
- [ ] Task 1357: Run `inspect pr` on sample PR
- [ ] Task 1358: Run `inspect a11y` on sample site
- [ ] Task 1359: Run `inspect lighthouse` on sample site
- [ ] Task 1360: Run full autonomous test cycle with zero human intervention

---

## Execution Strategy

### Phase 1: Foundation (Weeks 1-4)

- Tasks 1-120: Effect-TS migration across all packages
- Tasks 121-220: Real agent loop implementation
- **Deliverable:** All packages use Effect-TS, real agent loop replaces simulation-mode

### Phase 2: Browser Understanding (Weeks 5-8)

- Tasks 221-340: Multi-tree DOM, vision-first, stability detection
- Tasks 341-400: Memory and state management
- **Deliverable:** Comprehensive browser understanding with vision + DOM fusion

### Phase 3: Intelligence (Weeks 9-12)

- Tasks 401-480: Diff-aware test planning
- Tasks 481-580: Evaluation and quality scoring
- **Deliverable:** Intelligent test plans with automated evaluation

### Phase 4: Quality & Safety (Weeks 13-16)

- Tasks 581-680: Accessibility and performance auditing
- Tasks 681-760: Safety and reliability
- **Deliverable:** Comprehensive quality audits with safety guardrails

### Phase 5: Scale & Automation (Weeks 17-20)

- Tasks 761-860: CI mode and parallel execution
- Tasks 861-920: Session recording and replay
- **Deliverable:** Parallel execution at scale with full observability

### Phase 6: Self-Improvement (Weeks 21-24)

- Tasks 921-980: Automated self-improvement loop
- Tasks 981-1020: TUI state flow and UX
- **Deliverable:** Self-improving agent with world-class UX

### Phase 7: Integration & Polish (Weeks 25-28)

- Tasks 1021-1080: MCP server and external integrations
- Tasks 1081-1140: Testing infrastructure
- **Deliverable:** Full integration ecosystem with comprehensive tests

### Phase 8: Enterprise & Operations (Weeks 29-32)

- Tasks 1141-1220: Documentation, enterprise, security
- Tasks 1221-1300: Performance, monitoring, alerting
- **Deliverable:** Enterprise-ready with full observability

### Phase 9: Launch (Weeks 33-36)

- Tasks 1301-1360: Deployment, operations, verification
- **Deliverable:** Production-ready world-class testing infrastructure

---

---

## Part 21: OSS Innovations - Vision-First Understanding (Tasks 1361-1420)

**Source**: Skyvern, Stagehand, browser-use, Shortest
**Goal**: Combine screenshots with DOM for richer LLM context, coordinate-based grounding.

### 21.1 Annotated Screenshots (Tasks 1361-1390)

- [ ] Task 1361: Create `packages/browser/src/vision/annotated-screenshot.ts`
- [ ] Task 1362: Implement element bounding box detection
- [ ] Task 1363: Implement bounding box overlay on screenshots
- [ ] Task 1364: Assign numeric IDs to interactive elements
- [ ] Task 1365: Draw numbered labels on screenshot overlay
- [ ] Task 1366: Support different colors for different element types
- [ ] Task 1367: Support transparency for overlay readability
- [ ] Task 1368: Generate element ID → selector mapping
- [ ] Task 1369: Generate element ID → coordinates mapping
- [ ] Task 1370: Handle overlapping elements in annotation
- [ ] Task 1371: Implement z-index aware overlay
- [ ] Task 1372: Implement viewport-aware annotation (only visible elements)
- [ ] Task 1373: Implement scroll-aware annotation (mark off-screen elements)
- [ ] Task 1374: Support hover state screenshots
- [ ] Task 1375: Support focus state screenshots
- [ ] Task 1376: Support click state screenshots
- [ ] Task 1377: Implement before/after action screenshots
- [ ] Task 1378: Implement screenshot diff highlighting
- [ ] Task 1379: Export annotated screenshot for LLM
- [ ] Task 1380: Export annotated screenshot for debugging

### 21.2 Coordinate-Based Interaction (Tasks 1381-1400)

- [ ] Task 1381: Create `packages/browser/src/vision/coordinate-interaction.ts`
- [ ] Task 1382: Implement coordinate extraction from annotated screenshot
- [ ] Task 1383: Implement coordinate → element mapping
- [ ] Task 1384: Implement coordinate-based click
- [ ] Task 1385: Implement coordinate-based double-click
- [ ] Task 1386: Implement coordinate-based right-click
- [ ] Task 1387: Implement coordinate-based drag
- [ ] Task 1388: Implement coordinate-based scroll
- [ ] Task 1389: Implement coordinate-based type
- [ ] Task 1390: Handle device pixel ratio in coordinate mapping
- [ ] Task 1391: Handle iframe coordinate offsets
- [ ] Task 1392: Handle scroll position in coordinate mapping
- [ ] Task 1393: Implement coordinate fallback to selector
- [ ] Task 1394: Implement CUA (Computer Use API) mode for OpenAI
- [ ] Task 1395: Implement CUA mode for Anthropic
- [ ] Task 1396: Support coordinate-only mode (no DOM)
- [ ] Task 1397: Support hybrid mode (coordinates + DOM)
- [ ] Task 1398: Implement coordinate validation
- [ ] Task 1399: Implement coordinate bounds checking
- [ ] Task 1400: Implement coordinate hit testing

### 21.3 Vision-First Page Understanding (Tasks 1401-1420)

- [ ] Task 1401: Create `packages/browser/src/vision/page-understanding.ts`
- [ ] Task 1402: Implement vision-only context mode
- [ ] Task 1403: Implement vision+DOM context mode
- [ ] Task 1404: Implement vision+AX context mode
- [ ] Task 1405: Implement full fusion mode (vision + DOM + AX)
- [ ] Task 1406: Support screenshot-only LLM calls
- [ ] Task 1407: Support dual-modality prompts (image + text)
- [ ] Task 1408: Implement visual element detection fallback
- [ ] Task 1409: Implement visual form field detection
- [ ] Task 1410: Implement visual button detection
- [ ] Task 1411: Implement visual link detection
- [ ] Task 1412: Implement visual image detection
- [ ] Task 1413: Implement visual text detection
- [ ] Task 1414: Implement visual captcha detection
- [ ] Task 1415: Implement visual popup detection
- [ ] Task 1416: Implement visual overlay detection
- [ ] Task 1417: Implement visual loading state detection
- [ ] Task 1418: Implement visual error state detection
- [ ] Task 1419: Implement visual success state detection
- [ ] Task 1420: Implement visual comparison between states

---

## Part 22: OSS Innovations - Speculative Execution (Tasks 1421-1470)

**Source**: Skyvern, browser-use
**Goal**: Pre-compute next actions while current executes for 30-40% speedup.

### 22.1 Speculative Planning Engine (Tasks 1421-1450)

- [ ] Task 1421: Create `packages/agent/src/speculative-planner.ts`
- [ ] Task 1422: Implement speculative plan data structure
- [ ] Task 1423: Implement speculative state tracking
- [ ] Task 1424: Implement parallel action pre-computation
- [ ] Task 1425: Implement parallel LLM calls during execution
- [ ] Task 1426: Implement next-step prediction
- [ ] Task 1427: Implement page state prediction
- [ ] Task 1428: Implement DOM prediction after action
- [ ] Task 1429: Implement screenshot prediction after action
- [ ] Task 1430: Implement action validity checking
- [ ] Task 1431: Implement speculative result caching
- [ ] Task 1432: Implement speculative cache invalidation
- [ ] Task 1433: Implement speculative cache expiration
- [ ] Task 1434: Implement speculative hit rate tracking
- [ ] Task 1435: Implement speculative miss recovery
- [ ] Task 1436: Implement speculative timeout handling
- [ ] Task 1437: Implement speculative cancellation on state change
- [ ] Task 1438: Implement speculative result merging
- [ ] Task 1439: Implement speculative confidence scoring
- [ ] Task 1440: Implement speculative fallback on low confidence

### 22.2 Parallel Execution Pipeline (Tasks 1441-1470)

- [ ] Task 1441: Create `packages/agent/src/parallel-pipeline.ts`
- [ ] Task 1442: Implement concurrent DOM collection
- [ ] Task 1443: Implement concurrent screenshot capture
- [ ] Task 1444: Implement concurrent LLM preparation
- [ ] Task 1445: Implement concurrent LLM calling
- [ ] Task 1446: Implement result streaming
- [ ] Task 1447: Implement partial result handling
- [ ] Task 1448: Implement out-of-order result handling
- [ ] Task 1449: Implement result aggregation
- [ ] Task 1450: Implement result validation
- [ ] Task 1451: Implement result deduplication
- [ ] Task 1452: Implement result prioritization
- [ ] Task 1453: Implement result merging
- [ ] Task 1454: Implement pipeline stage tracking
- [ ] Task 1455: Implement pipeline stage timeout
- [ ] Task 1456: Implement pipeline stage retry
- [ ] Task 1457: Implement pipeline stage failure handling
- [ ] Task 1458: Implement pipeline performance metrics
- [ ] Task 1459: Implement pipeline bottleneck detection
- [ ] Task 1460: Implement pipeline auto-tuning
- [ ] Task 1461: Implement pipeline resource allocation
- [ ] Task 1462: Implement pipeline backpressure
- [ ] Task 1463: Implement pipeline load balancing
- [ ] Task 1464: Implement pipeline queue management
- [ ] Task 1465: Implement pipeline worker pool
- [ ] Task 1466: Implement pipeline worker scaling
- [ ] Task 1467: Implement pipeline worker recovery
- [ ] Task 1468: Implement pipeline observability
- [ ] Task 1469: Implement pipeline tracing
- [ ] Task 1470: Implement pipeline cost tracking

---

## Part 23: OSS Innovations - Watchdog System (Tasks 1471-1530)

**Source**: browser-use
**Goal**: Parallel monitors for captcha, popups, crashes, downloads.

### 23.1 Watchdog Architecture (Tasks 1471-1490)

- [ ] Task 1471: Create `packages/agent-watchdogs/src/watchdog-system.ts`
- [ ] Task 1472: Implement watchdog base class
- [ ] Task 1473: Implement watchdog lifecycle (start, stop, pause)
- [ ] Task 1474: Implement watchdog configuration
- [ ] Task 1475: Implement parallel watchdog execution
- [ ] Task 1476: Implement watchdog result aggregation
- [ ] Task 1477: Implement watchdog event publishing
- [ ] Task 1478: Implement watchdog priority handling
- [ ] Task 1479: Implement watchdog conflict resolution
- [ ] Task 1480: Implement watchdog cooldown periods
- [ ] Task 1481: Implement watchdog rate limiting
- [ ] Task 1482: Implement watchdog health checks
- [ ] Task 1483: Implement watchdog restart on failure
- [ ] Task 1484: Implement watchdog observability
- [ ] Task 1485: Implement watchdog metrics
- [ ] Task 1486: Implement watchdog alerts
- [ ] Task 1487: Implement watchdog logging
- [ ] Task 1488: Implement watchdog tracing
- [ ] Task 1489: Implement watchdog testing utilities
- [ ] Task 1490: Implement watchdog simulation mode

### 23.2 Captcha Detection (Tasks 1491-1505)

- [ ] Task 1491: Create `packages/agent-watchdogs/src/captcha-watchdog.ts`
- [ ] Task 1492: Implement image captcha detection
- [ ] Task 1493: Implement reCAPTCHA detection
- [ ] Task 1494: Implement hCaptcha detection
- [ ] Task 1495: Implement Cloudflare Turnstile detection
- [ ] Task 1496: Implement CAPTCHA provider identification
- [ ] Task 1497: Implement CAPTCHA difficulty estimation
- [ ] Task 1498: Implement CAPTCHA solving integration
- [ ] Task 1499: Implement 2Captcha integration
- [ ] Task 1500: Implement Anti-Captcha integration
- [ ] Task 1501: Implement custom CAPTCHA solver hook
- [ ] Task 1502: Implement CAPTCHA pause and notify
- [ ] Task 1503: Implement CAPTCHA auto-retry
- [ ] Task 1504: Implement CAPTCHA bypass strategies
- [ ] Task 1505: Implement CAPTCHA detection confidence

### 23.3 Popup and Overlay Handling (Tasks 1506-1520)

- [ ] Task 1506: Create `packages/agent-watchdogs/src/popup-watchdog.ts`
- [ ] Task 1507: Implement modal detection
- [ ] Task 1508: Implement alert detection
- [ ] Task 1509: Implement confirm dialog detection
- [ ] Task 1510: Implement prompt dialog detection
- [ ] Task 1511: Implement cookie consent detection
- [ ] Task 1512: Implement newsletter signup detection
- [ ] Task 1513: Implement advertisement popup detection
- [ ] Task 1514: Implement chat widget detection
- [ ] Task 1515: Implement overlay detection
- [ ] Task 1516: Implement popup auto-dismiss
- [ ] Task 1517: Implement popup handling strategies
- [ ] Task 1518: Implement popup priority ordering
- [ ] Task 1519: Implement popup escalation
- [ ] Task 1520: Implement popup logging

### 23.4 Crash and Download Monitoring (Tasks 1521-1530)

- [ ] Task 1521: Create `packages/agent-watchdogs/src/crash-watchdog.ts`
- [ ] Task 1522: Implement page crash detection
- [ ] Task 1523: Implement browser crash detection
- [ ] Task 1524: Implement out-of-memory detection
- [ ] Task 1525: Implement infinite loop detection
- [ ] Task 1526: Implement crash recovery strategies
- [ ] Task 1527: Create `packages/agent-watchdogs/src/download-watchdog.ts`
- [ ] Task 1528: Implement download start detection
- [ ] Task 1529: Implement download progress tracking
- [ ] Task 1530: Implement download completion handling

---

## Part 24: OSS Innovations - Natural Language API (Tasks 1531-1580)

**Source**: Shortest, Stagehand, browser-use
**Goal**: Simple `inspect("Login")` API for natural language testing.

### 24.1 NL Test API (Tasks 1531-1560)

- [ ] Task 1531: Create `packages/sdk/src/natural-language.ts`
- [ ] Task 1532: Implement `inspect.natural()` API
- [ ] Task 1533: Implement intent parsing from natural language
- [ ] Task 1534: Implement goal extraction
- [ ] Task 1535: Implement action inference
- [ ] Task 1536: Implement automatic step generation from NL
- [ ] Task 1537: Implement NL to test plan conversion
- [ ] Task 1538: Implement NL assertion parsing
- [ ] Task 1539: Implement NL expectation extraction
- [ ] Task 1540: Implement NL context understanding
- [ ] Task 1541: Implement NL ambiguity detection
- [ ] Task 1542: Implement NL clarification requests
- [ ] Task 1543: Implement NL confirmation prompts
- [ ] Task 1544: Support conversational test building
- [ ] Task 1545: Support one-shot test definition
- [ ] Task 1546: Support multi-step NL instructions
- [ ] Task 1547: Support conditional NL instructions
- [ ] Task 1548: Support loop NL instructions
- [ ] Task 1549: Support data-driven NL instructions
- [ ] Task 1550: Implement NL test templates
- [ ] Task 1551: Implement NL test reuse
- [ ] Task 1552: Implement NL test composition
- [ ] Task 1553: Implement NL test inheritance
- [ ] Task 1554: Implement NL test parameterization
- [ ] Task 1555: Implement NL test data binding
- [ ] Task 1556: Implement NL test fixtures
- [ ] Task 1557: Implement NL test hooks
- [ ] Task 1558: Implement NL test tagging
- [ ] Task 1559: Implement NL test filtering
- [ ] Task 1560: Implement NL test organization

### 24.2 NL to Code Generation (Tasks 1561-1580)

- [ ] Task 1561: Create `packages/sdk/src/nl-to-code.ts`
- [ ] Task 1562: Implement NL to Playwright code generation
- [ ] Task 1563: Implement NL to Inspect code generation
- [ ] Task 1564: Implement code generation confidence scoring
- [ ] Task 1565: Implement generated code validation
- [ ] Task 1566: Implement generated code execution
- [ ] Task 1567: Implement generated code debugging
- [ ] Task 1568: Implement generated code refinement
- [ ] Task 1569: Implement generated code persistence
- [ ] Task 1570: Implement generated code versioning
- [ ] Task 1571: Implement generated code review
- [ ] Task 1572: Implement human approval for generated code
- [ ] Task 1573: Implement incremental code generation
- [ ] Task 1574: Implement interactive code generation
- [ ] Task 1575: Implement code generation from examples
- [ ] Task 1576: Implement code generation from recordings
- [ ] Task 1577: Implement code generation best practices
- [ ] Task 1578: Implement code generation patterns
- [ ] Task 1579: Implement code generation templates
- [ ] Task 1580: Implement code generation documentation

---

## Part 25: OSS Innovations - Multi-Agent Orchestration (Tasks 1581-1640)

**Source**: OpenAI Agents SDK, AutoGen, Langflow
**Goal**: Agent handoffs, delegation, and multi-agent workflows.

### 25.1 Multi-Agent System (Tasks 1581-1610)

- [ ] Task 1581: Create `packages/agent/src/multi-agent/orchestrator.ts`
- [ ] Task 1582: Implement agent definition DSL
- [ ] Task 1583: Implement agent role definition
- [ ] Task 1584: Implement agent capabilities definition
- [ ] Task 1585: Implement agent constraints definition
- [ ] Task 1586: Implement agent registry
- [ ] Task 1587: Implement agent discovery
- [ ] Task 1588: Implement agent lifecycle management
- [ ] Task 1589: Implement agent communication protocol
- [ ] Task 1590: Implement agent message passing
- [ ] Task 1591: Implement agent shared context
- [ ] Task 1592: Implement agent state sharing
- [ ] Task 1593: Implement agent handoff protocol
- [ ] Task 1594: Implement agent delegation
- [ ] Task 1595: Implement agent collaboration
- [ ] Task 1596: Implement agent competition
- [ ] Task 1597: Implement agent negotiation
- [ ] Task 1598: Implement agent conflict resolution
- [ ] Task 1599: Implement agent priority system
- [ ] Task 1600: Implement agent scheduling
- [ ] Task 1601: Implement agent resource allocation
- [ ] Task 1602: Implement agent load balancing
- [ ] Task 1603: Implement agent failover
- [ ] Task 1604: Implement agent recovery
- [ ] Task 1605: Implement agent observability
- [ ] Task 1606: Implement agent metrics
- [ ] Task 1607: Implement agent tracing
- [ ] Task 1608: Implement agent cost tracking
- [ ] Task 1609: Implement agent testing utilities
- [ ] Task 1610: Implement agent simulation mode

### 25.2 Agent Patterns (Tasks 1611-1640)

- [ ] Task 1611: Implement supervisor agent pattern
- [ ] Task 1612: Implement worker agent pattern
- [ ] Task 1613: Implement specialist agent pattern
- [ ] Task 1614: Implement router agent pattern
- [ ] Task 1615: Implement aggregator agent pattern
- [ ] Task 1616: Implement evaluator agent pattern
- [ ] Task 1617: Implement planner agent pattern
- [ ] Task 1618: Implement executor agent pattern
- [ ] Task 1619: Implement monitor agent pattern
- [ ] Task 1620: Implement human-in-the-loop agent
- [ ] Task 1621: Implement agent-as-tool pattern
- [ ] Task 1622: Implement agent tool calling
- [ ] Task 1623: Implement agent guardrails
- [ ] Task 1624: Implement agent input validation
- [ ] Task 1625: Implement agent output validation
- [ ] Task 1626: Implement agent safety checks
- [ ] Task 1627: Implement agent rate limiting
- [ ] Task 1628: Implement agent quota management
- [ ] Task 1629: Implement agent audit logging
- [ ] Task 1630: Implement agent session management
- [ ] Task 1631: Implement agent conversation history
- [ ] Task 1632: Implement agent context management
- [ ] Task 1633: Implement agent memory sharing
- [ ] Task 1634: Implement agent knowledge base
- [ ] Task 1635: Implement agent learning
- [ ] Task 1636: Implement agent adaptation
- [ ] Task 1637: Implement agent self-improvement
- [ ] Task 1638: Implement agent feedback loops
- [ ] Task 1639: Implement agent A/B testing
- [ ] Task 1640: Implement agent experimentation

---

## Part 26: OSS Innovations - Self-Healing System (Tasks 1641-1700)

**Source**: Stagehand, Skyvern, browser-use
**Goal**: Fresh context + re-plan on failure, not just retry.

### 26.1 Self-Healing Architecture (Tasks 1641-1670)

- [ ] Task 1641: Create `packages/agent/src/self-healing/healer.ts`
- [ ] Task 1642: Implement failure detection
- [ ] Task 1643: Implement failure classification
- [ ] Task 1644: Implement failure severity assessment
- [ ] Task 1645: Implement healing strategy selection
- [ ] Task 1646: Implement healing strategy: fresh snapshot
- [ ] Task 1647: Implement healing strategy: re-plan
- [ ] Task 1648: Implement healing strategy: alternative approach
- [ ] Task 1649: Implement healing strategy: fall back to simpler action
- [ ] Task 1650: Implement healing strategy: escalate to human
- [ ] Task 1651: Implement healing execution
- [ ] Task 1652: Implement healing validation
- [ ] Task 1653: Implement healing success tracking
- [ ] Task 1654: Implement healing failure tracking
- [ ] Task 1655: Implement healing learning
- [ ] Task 1656: Implement healing pattern recognition
- [ ] Task 1657: Implement healing pattern application
- [ ] Task 1658: Implement healing optimization
- [ ] Task 1659: Implement healing cost tracking
- [ ] Task 1660: Implement healing time tracking
- [ ] Task 1661: Implement healing effectiveness metrics
- [ ] Task 1662: Implement healing escalation
- [ ] Task 1663: Implement healing cooldown
- [ ] Task 1664: Implement healing rate limiting
- [ ] Task 1665: Implement healing observability
- [ ] Task 1666: Implement healing tracing
- [ ] Task 1667: Implement healing reporting
- [ ] Task 1668: Implement healing alerting
- [ ] Task 1669: Implement healing testing
- [ ] Task 1670: Implement healing simulation

### 26.2 Action Caching (Tasks 1671-1700)

- [ ] Task 1671: Create `packages/agent/src/self-healing/action-cache.ts`
- [ ] Task 1672: Implement action hash generation
- [ ] Task 1673: Implement instruction+DOM hash key
- [ ] Task 1674: Implement instruction+URL hash key
- [ ] Task 1675: Implement cache storage
- [ ] Task 1676: Implement cache retrieval
- [ ] Task 1677: Implement cache hit detection
- [ ] Task 1678: Implement cache miss handling
- [ ] Task 1679: Implement cache validation
- [ ] Task 1680: Implement cache invalidation on DOM change
- [ ] Task 1681: Implement cache invalidation on URL change
- [ ] Task 1682: Implement cache expiration
- [ ] Task 1683: Implement cache size limits
- [ ] Task 1684: Implement cache LRU eviction
- [ ] Task 1685: Implement cache persistence
- [ ] Task 1686: Implement cache loading
- [ ] Task 1687: Implement cache warming
- [ ] Task 1688: Implement cache statistics
- [ ] Task 1689: Implement cache hit rate tracking
- [ ] Task 1690: Implement cache cost savings tracking
- [ ] Task 1691: Implement cache replay
- [ ] Task 1692: Implement cache fallback
- [ ] Task 1693: Implement cache conflict resolution
- [ ] Task 1694: Implement cache versioning
- [ ] Task 1695: Implement cache migration
- [ ] Task 1696: Implement cache backup
- [ ] Task 1697: Implement cache restore
- [ ] Task 1698: Implement cache testing
- [ ] Task 1699: Implement cache observability
- [ ] Task 1700: Implement cache optimization

---

## OSS Reference Summary

| Repository | Language | Category | Key Pattern |
|------------|----------|----------|-------------|
| browser-use | Python | Agent | 3-phase loop, watchdogs, action caching |
| Skyvern | Python | Agent | Vision+DOM fusion, speculative planning |
| Stagehand | TypeScript | Agent | Hybrid snapshot, self-healing, act/extract/observe |
| OpenAI Agents SDK | Python | Framework | Handoffs, guardrails, human-in-loop |
| AutoGen | Python | Framework | Multi-agent orchestration |
| Langflow | Python | Workflow | Visual builder |
| Playwright MCP | TypeScript | Browser | Accessibility-only mode |
| rrweb | TypeScript | Recording | Session replay |
| Lighthouse | JavaScript | Quality | Performance audits, log-normal scoring |
| E2B | Python/TS | Infrastructure | Sandboxed execution |
| QA Wolf | TypeScript | Testing | Record → Code |
| Shortest | TypeScript | Testing | NL tests, caching |

---

## Updated Task Count: 1,700 tasks across 26 parts, 9 phases

## OSS-Informed Priority Adjustments

### P0 (Critical) - Add from OSS analysis:
- Vision-first understanding (Part 21) - Skyvern pattern
- Speculative execution (Part 22) - Skyvern pattern
- Self-healing system (Part 26) - Stagehand pattern
- Action caching (Part 26) - browser-use pattern

### P1 (High) - Add from OSS analysis:
- Watchdog system (Part 23) - browser-use pattern
- Natural language API (Part 24) - Shortest pattern
- Multi-agent orchestration (Part 25) - OpenAI Agents SDK pattern

### Existing Priorities (unchanged):
- Part 1: Effect-TS migration (P0)
- Part 2: Real agent loop (P0)
- Part 3: Browser understanding (P0)
- Part 4: Memory management (P1)
- Part 5: Diff-aware planning (P1)
- Part 6: Evaluation (P1)
- Part 7: Accessibility/Performance (P1)
- Part 8: Safety (P1)
- Part 9: CI/Parallel (P2)
- Part 10: Session recording (P2)
- Part 11: Self-improvement (P2)
- Part 12-20: UI, integrations, docs (P2-P3)

## Total Task Count: 1,700 tasks across 26 parts, 9 phases

## Key Dependencies & Ordering

- **Phase 1 must complete before Phase 2** — Effect-TS foundation enables all other work
- **Phase 2 must complete before Phase 3** — browser understanding enables intelligent planning
- **Phase 3 must complete before Phase 4** — evaluation requires planning
- **Phase 4 must complete before Phase 5** — safety enables scale
- **Phase 5 must complete before Phase 6** — scale enables self-improvement
- **Phases 7-9 can overlap with Phase 6** — documentation, testing, deployment are parallel tracks

## Risk Mitigation

1. **Effect-TS migration risk:** Migrate package-by-package, run `pnpm check` after each, keep simulation-mode as fallback until real implementation is wired
2. **LLM non-determinism risk:** Use structured output schemas, retry with backoff, deterministic prompts
3. **Token cost risk:** Prompt caching (freeze mask), context compaction, flash mode, cheaper models for extraction
4. **Browser state leak risk:** Fresh context per test, cookie isolation, cleanup finalizers
5. **DOM change risk:** Multi-tree DOM collection, element hashing, fallback locators
6. **Context window risk:** Message compaction, step history summarization, checkpoint system
7. **Timeline risk:** Prioritize P0 components first, defer P2/P3 to post-MVP
