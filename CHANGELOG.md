# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Action Caching Enhancement** - Production-ready with deterministic keys
  - SHA256/MurmurHash key generation for cache consistency
  - DOM state hashing with full and structural variants
  - Validation on replay (URL, element presence, text, screenshot)
  - Smart invalidation on DOM changes
  - LRU eviction and success rate tracking
  - Location: `packages/agent/src/cache/action-cache.ts` (832 lines)

- **Web Dashboard MVP** - Real-time test monitoring
  - WebSocket server with Effect-TS for bidirectional communication
  - Dark-themed HTML/CSS/JS dashboard UI
  - Live test execution updates (test:started, step:completed, etc.)
  - Auto-reconnecting client with backoff
  - Test history and statistics
  - Location: `packages/dashboard/` (1,000+ lines)

- **Natural Language Parser Expansion** - 50+ grammar patterns
  - 50+ action patterns (click, type, navigate, scroll, wait, assert)
  - Entity extraction (URLs, emails, numbers, quoted text)
  - Confidence scoring and fuzzy matching
  - Custom pattern support for domain-specific actions
  - Element descriptor parsing (role, index, text)
  - Location: `packages/agent-tools/src/nl-parser/` (1,200+ lines)

- **Vitest E2E Plugin** - First-class Vitest integration
  - `inspectPlugin()` for Vitest configuration
  - Natural language actions (`act()`, `assert()`, `extract()`)
  - 15+ custom matchers (`toBeVisible`, `toHaveText`, etc.)
  - Automatic screenshots on failure
  - Video recording and trace collection
  - Location: `packages/expect-vitest/` (800+ lines)

- **Jest Adapter** - Jest test environment
  - Jest test environment with Playwright integration
  - Same API as Vitest plugin
  - 15+ custom matchers
  - Auto-cleanup after tests
  - Location: `packages/expect-jest/` (600+ lines)

- **Self-Healing Expansion** - 9 recovery strategies
  - Exact match, semantic match, fuzzy text match
  - CSS similarity, neighbor anchor, vision fallback
  - XPath fallback, text search, AI semantic
  - Recovery playbook with 10+ error patterns
  - Confidence scoring and statistics tracking
  - DOM state validation and timing strategies
  - Location: `packages/self-healing/` (1,500+ lines)

- **Watchdog Expansion** - Common interruption handlers
  - Consent banner detection and auto-accept (30+ selectors)
  - Login redirect detection with auto-login
  - Rate limit detection with exponential backoff
  - Request tracking and prevention
  - Location: `packages/agent-watchdogs/` (1,200+ lines)

- CI/CD pipeline with GitHub Actions (build, test, lint, security scan)
- Release workflow with auto-generated changelog and GitHub releases
- Husky pre-commit hooks with lint-staged for automatic formatting
- PR template with checklist for code quality
- CODEOWNERS file for code review routing
- Agent Governance & Observability system
  - Audit trail with SHA-256 hash chain for tamper detection
  - Autonomy levels (Augmentation → Supervision → Delegation → Autonomy)
  - Permission manager with domain/action restrictions
  - Compliance report generation (EU AI Act, SOC2)
- Multi-Agent Orchestration engine
  - DAG-based agent graph with parallel/fan-out/fan-in patterns
  - Dynamic agent spawning with built-in templates
  - Agent-to-agent communication via MessageBus adapter
  - Graph validation (cycle detection, unreachable nodes)
- Enterprise package (`@inspect/enterprise`)
  - RBAC with 5 roles (Viewer, Tester, Admin, Security, Super Admin)
  - SSO integration (SAML, OIDC, Azure AD, Okta)
  - Multi-tenancy with plan-based quotas
  - Hybrid router for local/cloud LLM routing
- Self-Healing engine (8 strategies)
  - Text match, ARIA role, visual locate, XPath relative
  - CSS similar, neighbor anchor, semantic match, full rescan
  - DOM differ for breaking change detection
  - Learning from successful heals
- Autonomous Test Generation
  - Page type detection (login, signup, checkout, search, etc.)
  - Heuristic test generation from ARIA tree analysis
  - Sitemap-based bulk test generation
  - YAML workflow and instruction export
- Standalone MCP package (`@inspect/mcp`)
  - Re-exports browser MCP server as installable package
  - 14 browser tools + quality tools
  - stdio transport (JSON-RPC)
- Cost Intelligence
  - Cost predictor (pre-run estimation)
  - Cost optimizer (flash model, caching, vision reduction suggestions)
  - Budget manager (session/daily/monthly limits)
  - Per-step cost attribution
- Cloud Browser support
  - Browserbase, Steel, custom CDP provider
  - Session pool with pre-warming and health checks
- Action cache deduplication
  - Merged duplicate `store.ts` into canonical `action-cache.ts`
  - Canonical API: `get()`, `set()`, `heal()`, `invalidate()`, `clear()`
- Executor adapters for real browser execution
  - `createPlanGenerator()` wires LLM planner to TestExecutor
  - `createStepExecutor()` wires real browser actions to TestExecutor
  - `createRecoveryExecutorsFromState()` wires browser recovery strategies

### Changed

- Test suite grew from 986 to 1642 passing tests
- 34 packages total (refactored from 17 into focused sub-packages)
- Focused on CLI/REPL-first development
- Reorganized monorepo: split `agent` into `agent-*` packages, `quality` into sub-packages, `core` into `orchestrator`/`git`/`devices`
- Replaced `any` types with proper Playwright `Page` types across CLI agents

### Removed

- Web dashboard (`apps/web/`) — removed to focus on CLI/REPL
- Dashboard service from `docker-compose.yml`
- Web SPA serving from `inspect serve` command
- Nested repositories (Airtest, LaVague, stagehand, skyvern, etc.)
- Nested repositories (Airtest, LaVague, stagehand, skyvern, etc.)

### Added (original)

- 28-agent autonomous testing system
  - Tier 1 Discovery: Crawler, Analyzer, Planner
  - Tier 2 Execution: Navigator, Tester, FormFiller, Validator
  - Tier 3 Quality: Accessibility, Performance, Security, Responsive, SEO
  - Reporter: HTML, JSON, JUnit XML, GitHub annotations
- CLI flags: `--full`, `--fast`, `--security`, `--performance`, `--responsive`, `--seo`
- LLM response cache with disk-based SHA-256 keyed storage
- LLM retry with exponential backoff (429, 500, 502, 503)
- `safeEvaluate` timeout guards on all page.evaluate calls
- Token budget enforcement with `--token-budget` flag
- SPA form detection for React/Vue/Angular apps
- CDP-based Core Web Vitals fallback for headless Chromium
- robots.txt Disallow enforcement during crawl
- Parallel quality agent execution (a11y + security + SEO concurrent)
- 54 integration tests covering all agent modules
- E2E test fixture site (4 pages) with real browser tests

## [0.1.0] - 2024-01-01

### Added

- Initial release: AI-powered browser testing platform
- 15-package TypeScript monorepo
- CLI with Commander + Ink TUI
- Playwright browser automation
- LLM providers: Claude, GPT, Gemini, DeepSeek, Ollama
- YAML workflow engine with 15 block types
- REST API server with webhooks, SSE, WebSocket
- Credential vault (Bitwarden, 1Password, Azure)
- 566 unit tests
