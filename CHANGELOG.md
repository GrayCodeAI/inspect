# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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

- Test suite grew from 986 to 1598 passing tests
- 17 packages total (added `@inspect/mcp` and `@inspect/enterprise`)
- Focused on CLI/REPL-first development

### Removed

- Web dashboard (`apps/web/`) — removed to focus on CLI/REPL
- `docker/Dockerfile.dashboard` — dashboard container removed
- Dashboard service from `docker-compose.yml`
- Web SPA serving from `inspect serve` command

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
