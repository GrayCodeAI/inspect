# Inspect — Deep Codebase Analysis Report
### Analyzed: March 28, 2026 | 9 parallel analysis agents | 50+ source files read

---

## Executive Summary

Inspect is a **massively ambitious** AI-powered browser testing platform with **~120,000+ lines of TypeScript** across 17 packages. The codebase is significantly more mature than documentation suggests — many features described as "planned" in ROADMAP-100/200 are already implemented. However, critical gaps exist in **integration wiring**, **test coverage**, and **production readiness**.

### Overall Codebase Statistics

| Metric | Value |
|--------|-------|
| **Total packages** | 17 |
| **Total source files** | ~200+ |
| **Total lines of code** | ~120,000+ |
| **Test files** | ~30 |
| **Test lines** | ~8,000 |
| **Test coverage** | ~6-7% |
| **CLI commands** | 70 |
| **LLM providers** | 5 |
| **Agent capabilities** | 28 |
| **Workflow block types** | 19 |
| **Benchmark suites** | 8 |
| **Dashboard pages** | 14 |
| **Reporter formats** | 7 |
| **Watchdog types** | 14 |
| **Device presets** | 26 |
| **TODO/FIXME markers** | ~12 (mostly placeholders in core executor) |

---

## Package-by-Package Analysis

### 1. `packages/agent/` (13,039 lines)

**Status: MOSTLY COMPLETE — Production quality**

| Module | Lines | Status | Notes |
|--------|-------|--------|-------|
| providers/ | 3,006 | ✅ Complete | 5 providers, router, fallback, rate limiter |
| tools/ | 1,556 | ✅ Complete | 10 built-in tools, judge LLM, NL assertions, token tracker, sensitive data masking |
| watchdogs/ | 1,443 | ✅ Complete | 14 watchdog types (6 implemented, 8 stubbed in manager) |
| memory/ | 1,023 | ✅ Complete | Short/long-term, compaction, pattern store |
| cache/ | 1,018 | ✅ Complete | Dual ActionCache + SelfHealer with 4-strategy cascade |
| prompts/ | 1,057 | ✅ Complete | Builder + 4 specialist prompts (UX, Security, A11y, Performance) |
| loop/ | 620 | ✅ Complete | LoopDetector (4 strategies), ActionLoopDetector, StallDetector |
| otp/ | 592 | ✅ Complete | TOTP + Email polling (5 providers) |
| acp/ | 342 | ⚠️ Basic | Agent Communication Protocol client — streaming SSE only |
| Tests | 1,866 | ⚠️ Thin | 12 test files, ~30% module coverage |

**Critical Issues:**
- **Duplicate ActionCache**: Two separate implementations (`cache/store.ts` and `cache/action-cache.ts`) with overlapping APIs
- **WatchdogManager.check() is sync but CaptchaWatchdog needs async** — won't fire from poll loop
- **IMAP not implemented** — `EmailPoller.checkIMAP()` throws
- **ACP client has no server counterpart** — client-only, no agent hosting

---

### 2. `packages/core/` (9,014 lines)

**Status: ARCHITECTURE COMPLETE — Critical placeholders**

| Module | Lines | Status | Notes |
|--------|-------|--------|-------|
| orchestrator/executor.ts | 520 | ❌ **STUB** | `generatePlan()` returns hardcoded 6-step plan. `runStep()` records fake tool calls. Recovery executors are no-ops. |
| orchestrator/scheduler.ts | 313 | ✅ Complete | Parallel/sequential execution, concurrency limits |
| orchestrator/checkpoint.ts | 215 | ✅ Complete | Crash recovery with JSON persistence |
| orchestrator/speculative.ts | 166 | ✅ Complete | Pre-compute next step, URL path matching |
| orchestrator/recovery.ts | 325 | ✅ Complete | 11 failure types, 12 recovery strategies |
| orchestrator/dashboard.ts | 471 | ✅ Complete | Event-driven, SSE support, 8 event types |
| testing/ | 2,373 | ✅ Complete | Flakiness, error classification, retry, tags, prioritizer, cross-browser, generator |
| git/ | 699 | ✅ Complete | GitManager, fingerprint, context builder |
| github/ | 522 | ✅ Complete | PR integration, comments, commit status |
| devices/ | 536 | ✅ Complete | 26 device presets, pool with concurrency |
| visual/ | 449 | ✅ Complete | Visual regression with GitHub posting |
| export/ | 526 | ⚠️ Partial | Playwright export has TODO assertions |
| plugins/ | 269 | ✅ Complete | Plugin system with lifecycle hooks |

**CRITICAL: TestExecutor has 6 placeholder implementations**
```
Line 256: generatePlan() — "placeholder implementation"
Line 263: Runtime warning log
Line 398: scrollIntoView recovery — "placeholder"  
Line 402: dismissOverlay recovery — "placeholder"
Line 406: refreshPage recovery — "placeholder"
Line 415: runStep() — "records tool calls without executing real browser actions"
```

This means the **core test execution pipeline is not wired to real browser actions**. The 28-agent system in `apps/cli/agents/` is the real implementation.

---

### 3. `apps/cli/` (41,201 lines)

**Status: SUBSTANTIALLY COMPLETE — The real implementation**

| Directory | Lines | Status |
|-----------|-------|--------|
| agents/ (28-agent system) | 24,207 | ✅ Substantially complete |
| commands/ (37 commands) | 8,869 | ✅ Complete |
| tui/ (Ink + React) | 5,306 | ✅ Complete |
| utils/ | 2,431 | ✅ Complete |

**Agent System Inventory (28 capabilities):**
- **Tier 1 Discovery** (4): Crawler, Analyzer, SPA, Navigator
- **Tier 2 Execution** (7): Planner, Agent Loop, Tester, Validator, Form Filler, Auth, Recorder
- **Tier 3 Quality** (13): Accessibility, Security, Advanced Security, Performance, Responsive, SEO, Visual Regression, API Testing, API Scanning, Logic Testing, Cross-Browser, Load Testing
- **Post-Processing** (4): Reporter, Failure Analysis, Flake Detection, CI Integration
- **Utilities** (4): Smart Masking, Monitoring, Advanced, Cache

**Gaps:**
- `drag` action is a no-op in `tester.ts`
- Multi-device parallelism is stubbed (returns `{passed: 0, failed: 0}`)
- `cua` (vision) snapshot mode referenced but not implemented
- Test coverage: 4 test files for 41K lines (1.7%)

---

### 4. `packages/services/` (4,175 lines)

**Status: SERVICES IMPLEMENTED — Infrastructure NOT wired**

| Component | Lines | Status |
|-----------|-------|--------|
| ServiceRegistry | 210 | ✅ Complete |
| ApiGateway | 148 | ✅ Complete (zero tests) |
| MessageBus | 220 | ✅ Complete |
| 9 service implementations | 2,646 | ✅ Complete |

**CRITICAL: Services are disconnected from infrastructure**
- None of the 9 services register with `ServiceRegistry`
- None subscribe to `MessageBus`
- None expose routes through `ApiGateway`
- No composition root / bootstrap wiring exists

**Service Placeholders:**
- `LightpandaManager.ensureInstalled()` — writes shell echo script
- `ZAPDeepService.getMarketplace()` — hardcoded addon list
- `CaptchaSwarmService.executeSwarm()` — hardcoded empty results
- `NucleiMultiService.probeTcp()` — falls back to HTTP GET

---

### 5. `packages/workflow/` (6,809 lines)

**Status: ENGINE COMPLETE — Block classes disconnected**

| Component | Lines | Status |
|-----------|-------|--------|
| Engine (executor, scheduler, context) | 2,537 | ✅ Complete |
| 19 block implementations | 3,691 | ⚠️ Duplicate code |
| Copilot (generator, observer) | 922 | ✅ Complete |
| Tests | 1,050 | ⚠️ 20% coverage |

**CRITICAL: Executor duplicates all block logic inline**
- Block classes (`TaskBlock`, `CodeBlock`, etc.) are exported but **never used by the executor**
- The executor has its own inline implementations for all 15 block types
- Block class methods like `setAgentExecutor()`, `setLLMExtractor()` are never called

**Other gaps:**
- 4 "world-class" blocks (crawl, track, proxy, benchmark) not in executor dispatch
- No workflow persistence (definitions exist only in memory)
- Benchmark block returns random numbers
- PDF parser is minimal (regex-based BT/ET extraction)

---

### 6. `packages/browser/` (8,774 lines)

**Status: MOSTLY COMPLETE — Strong abstraction**

| Module | Lines | Status |
|--------|-------|--------|
| Playwright (BrowserManager, PageManager, CrossBrowser) | 1,025 | ✅ Complete |
| ARIA (snapshot, tree, refs) | 650 | ✅ Complete |
| DOM (capture, hybrid, frames, shadow, diff, settler, markdown) | 1,668 | ✅ Complete |
| Vision (screenshot, detector, annotated) | 569 | ⚠️ No Anthropic client |
| Cookies (extract, browsers) | 906 | ✅ Partial (Safari stub, Chromium encrypted) |
| Session (recorder, HAR, video) | 707 | ✅ Complete |
| Profiles (manager) | 439 | ✅ Complete |
| Backends (Lightpanda, Chromium) | 317 | ⚠️ Disconnected from BrowserManager |
| MCP (server, tools) | 966 | ✅ Complete (13 tools, single-page) |
| Mobile (gestures) | 269 | ✅ Complete |
| Actions (file-upload, drag-drop) | 259 | ✅ Complete |
| Network (interceptor) | 148 | ✅ Complete |
| Watchdog | 172 | ✅ Complete |

**Gaps:**
- Backend abstraction (`LightpandaBackend`) not wired to `BrowserManager`
- Safari cookie extraction is a stub
- Chromium cookie decryption not implemented
- MCP server is single-page (no multi-tab)
- No Anthropic vision client
- Duplicated DOM serialization logic across 3 files

---

### 7. `packages/quality/` + `packages/visual/` (9,108 lines)

**Status: IMPLEMENTED — Low test coverage**

| Module | Lines | Status |
|--------|-------|--------|
| Accessibility (axe-core 4.9.1, 105 rules) | 762 | ✅ Complete |
| Lighthouse (Core Web Vitals, budgets, history) | 877 | ✅ Complete |
| Security (ZAP, Nuclei, Proxy) | 1,132 | ✅ Complete |
| Chaos (5 gremlin species, 3 monitors) | 938 | ✅ Complete |
| Mocking (REST, GraphQL, WebSocket, HAR, OpenAPI, Faker) | 2,214 | ✅ Complete |
| Resilience (7 toxic types, proxy server) | 1,313 | ✅ Complete |
| Visual Diff (pixel comparison, slider report) | 1,751 | ✅ Complete |

**Test coverage:** 8 of 27 modules tested (30%)

---

### 8. `evals/` (2,533 lines)

**Status: FRAMEWORK COMPLETE — No real data**

| Component | Lines | Status |
|-----------|-------|--------|
| EvalRunner | 269 | ✅ Complete |
| BenchmarkRunner + 8 suites | 1,541 | ⚠️ Placeholder URLs |
| Reward shaping (6 functions) | 419 | ✅ Complete |
| Tests | 450 | ✅ Complete |

**Gaps:**
- MiniWoB/WebArena/WorkArena use `about:blank` URLs
- No actual benchmark data files loaded
- No HuggingFace dataset integration

---

### 9. Supporting Packages

| Package | Lines | Status |
|---------|-------|--------|
| `packages/shared/` (types, utils, constants) | 3,147 | ✅ Complete — 160+ types, 24 utils, 60+ constants |
| `packages/sdk/` (9 public methods) | 2,750 | ✅ Complete — act, extract, observe, agent, navigate, screenshot, crawl, track, close |
| `packages/data/` (crawler, parsers, storage) | 3,681 | ✅ Complete — S3, Azure Blob, PDF/CSV/JSON/DOCX/XLSX parsers |
| `packages/network/` (stealth, proxy, security) | 1,834 | ✅ Complete — StealthEngine, SOCKS5, DomainGuard, Cloudflare tunnels |
| `packages/credentials/` (vault, providers, OTP) | 2,370 | ✅ Complete — AES-256-GCM, Bitwarden, 1Password, Azure KeyVault |
| `packages/observability/` (logging, tracing, metrics) | 1,814 | ✅ Complete — PostHog, OpenTelemetry, Slack/Discord notifications |
| `packages/reporter/` (7 formats) | 2,421 | ✅ Complete — Markdown, HTML, JSON, GitHub Actions, Visual Diff, AI Analysis |

---

### 10. `apps/web/` (4,138 lines)

**Status: MIXED — 2 production pages, several stubs**

| Page | Lines | Status |
|------|-------|--------|
| Live Dashboard | 610 | ✅ Production-ready (SSE + WebSocket) |
| Tasks | 607 | ✅ Production-ready (CRUD + polling) |
| Dashboard | 290 | ✅ Mature |
| Visual Diff | 270 | ⚠️ Client-side only, 2/3 tabs stubbed |
| A11y | 92 | ✅ Mature |
| Performance | 86 | ✅ Mature |
| Reports | 159 | ⚠️ File upload only, no server listing |
| Workflows | 75 | ⚠️ Basic — no detail/edit/delete |
| Credentials | 34 | ❌ Read-only list |
| Sessions | 35 | ❌ Read-only list |
| Devices | 35 | ✅ Complete (display only) |
| Models | 61 | ✅ Complete |
| Settings | 52 | ❌ Informational only |
| Landing | 184 | ✅ Complete (static) |

**Issues:**
- `@inspect/shared` declared but never imported
- `escapeHtml()` duplicated in 8 files
- Window globals used for interactivity
- Security score hardcoded to 0
- No error boundaries

---

## Critical Path: What Blocks Production

### Blocker 1: Core Executor Not Wired (packages/core)
`TestExecutor.generatePlan()` and `runStep()` are stubs. The **real execution** happens in `apps/cli/agents/orchestrator.ts` which has its own 28-agent pipeline. The core package's executor is dead code.

**Fix:** Either wire the core executor to the CLI agents or deprecate it.

### Blocker 2: Services Not Connected (packages/services)
The 9 service implementations and 3 infrastructure components (registry, gateway, bus) exist in isolation. No wiring, no bootstrap, no composition root.

**Fix:** Create a service bootstrap that wires services to the message bus and API gateway.

### Blocker 3: Workflow Executor Duplicates Block Classes (packages/workflow)
The executor has inline implementations for all block types, duplicating the standalone block classes. The 4 "world-class" blocks aren't even registered.

**Fix:** Refactor executor to delegate to block classes.

### Blocker 4: Test Coverage is ~6-7%
With ~120K lines and ~8K test lines, most modules have zero tests. The CLI agents (24K lines) have 3 test files.

**Fix:** Prioritize testing critical paths (agent loop, orchestrator, providers).

### Blocker 5: Backend Abstraction Disconnected (packages/browser)
`LightpandaBackend` exists but `BrowserManager` only supports Chromium via Playwright. No adapter bridge.

**Fix:** Create a `BrowserBackend` adapter that wraps `LightpandaBackend` for `BrowserManager`.

---

## Updated Build Plan (Based on Deep Analysis)

### Phase 0: Integration Wiring (2 weeks) — NEW, CRITICAL
Before building new features, wire what exists:

1. **Wire core executor to CLI agents** — Make `TestExecutor` delegate to the real 28-agent system
2. **Wire services to infrastructure** — Bootstrap services with `ServiceRegistry` + `MessageBus`
3. **Wire workflow executor to block classes** — Delegate to `TaskBlock`, `CodeBlock`, etc.
4. **Wire Lightpanda backend to BrowserManager** — Create adapter bridge
5. **Fix duplicate ActionCache** — Merge into single implementation

### Phase 1: Agent Governance & Observability (4 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 2: True Multi-Agent Orchestration (5 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 3: Enterprise Local-First (4 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 4: Self-Healing & Test Generation (4 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 5: Cost Intelligence (3 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 6: Cloud Browser (3 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 7: MCP Expansion (2 weeks)
*(Same as BUILD-PLAN.md)*

### Phase 8: Test Coverage Sprint (ongoing)
Target: 80% coverage across all packages.
Priority: agent loop, orchestrator, providers, tools, watchdogs.

---

## Comparison: Documented vs Actual State

| Feature | ROADMAP Status | Actual Status |
|---------|---------------|---------------|
| Act caching | Planned (#1-6) | ✅ Done |
| Loop detection | Planned (#7-11) | ✅ Done |
| Two-step actions | Planned (#12-15) | ✅ Done (DOM diff) |
| Fallback LLM | Planned (#16-20) | ✅ Done |
| Annotated screenshots | Planned (#21-25) | ✅ Done |
| Hybrid DOM+ARIA | Planned (#26-30) | ✅ Done |
| Speculative planning | Planned (#31-35) | ✅ Done |
| Run caching | Planned (#36-41) | ✅ Done |
| Session resume | Planned (#42-46) | ✅ Done |
| Token budget | Planned (#47-51) | ✅ Done |
| Structured output | Planned (#52-55) | ⚠️ Partial |
| Better prompts | Planned (#56-60) | ✅ Done |
| Watchdog integration | Planned (#66-70) | ✅ Done |
| Clean output | Planned (#71-75) | ⚠️ Partial |
| Sensitive data masking | Planned (#101-103) | ✅ Done |
| Judge LLM | Planned (#104-106) | ✅ Done |
| Message compaction | Planned (#110-112) | ✅ Done |
| Custom tools | Planned (#113-116) | ✅ Done |
| Replan on stall | Planned (#117-119) | ✅ Done |
| CAPTCHA solving | Planned (#120-122) | ✅ Done |
| OTP/2FA | Planned (#123-125) | ✅ Done |
| Domain restriction | Planned (#129-131) | ✅ Done (DomainGuard) |
| Cloud browser | Planned (#141-143) | ⚠️ Partial (backend exists, not wired) |
| Agent memory | Planned (#147-149) | ✅ Done |

**~85% of ROADMAP-100/200 items are already implemented.**

---

## Summary

Inspect is a **genuinely impressive codebase** — far more complete than the roadmaps indicate. The main challenges are:

1. **Integration wiring** — components exist in isolation, need connecting
2. **Test coverage** — ~6-7% is dangerously low for production
3. **Core executor placeholders** — the documented execution path is stubbed
4. **Dashboard maturity** — only 2-3 pages are production-ready
5. **Documentation lag** — roadmaps don't reflect actual implementation state

The **competitive moat** is real: 28-agent system, 70 CLI commands, 19 workflow block types, 8 benchmark suites, 14 watchdog types, 5 LLM providers, MCP server, credential vault, stealth browsing, and more. No competitor comes close to this breadth.

The **path to production** is integration wiring + test coverage, not new features.
