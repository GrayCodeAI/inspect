# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
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
