# Inspect - AI-Powered Browser Testing Platform

**Date**: March 25, 2026
**POC**: Lakshman Patel
**Status**: Implementation Complete (Phase 1-18) — All 15 packages build clean
**Reference Repos**: Expect, Skyvern, Stagehand, Browser Use + 12 additional OSS projects

---

## TL;DR

Inspect combines the best features from 4 leading AI browser automation projects + integrates capabilities from 12 additional specialized OSS tools:

**Core 4 Repos:**
- **From Expect**: Git-aware testing, ARIA snapshots, MCP/ACP protocols, adversarial mindset
- **From Skyvern**: Computer vision, no-selector automation, OTP handling, auto-recovery
- **From Stagehand**: Natural language actions, caching, self-healing selectors, multi-frame support
- **From Browser Use**: Multi-model agents, loop detection, memory management, watchdogs

**Additional OSS Integrations:**
- **From axe-core**: Zero-false-positive WCAG accessibility auditing (90+ rules)
- **From Lighthouse**: Performance scoring, SEO audit, PWA check, Core Web Vitals
- **From Gremlins.js**: Chaos/monkey testing — random user interactions to find edge cases
- **From MSW**: Network-level API mocking for deterministic, reproducible tests
- **From Nuclei**: 12,000+ YAML vulnerability templates for security scanning
- **From Lightpanda**: Ultra-fast headless browser (11x faster, 9x less memory)
- **From Firecrawl**: Website→LLM-ready markdown/structured data conversion
- **From BackstopJS**: Visual regression with slider reports + responsive breakpoints
- **From Toxiproxy**: Network fault injection (latency, drops, bandwidth limits)
- **From ZAP**: Full DAST security scanner, OWASP Top 10 detection
- **From Maestro**: YAML-based cross-platform test definitions
- **From BrowserGym**: Standardized web agent benchmarking

---

## Feature Matrix from Reference Repos

### Features Extracted from Each Repo

| Feature | Expect | Skyvern | Stagehand | Browser Use | **Inspect** |
|---------|--------|---------|-----------|-------------|-------------|
| **Browser Automation** |
| Playwright wrapper | ✅ | ✅ | ✅ (CDP) | ✅ (CDP) | ✅ |
| ARIA/Accessibility tree | ✅ | ❌ | ✅ Hybrid | ✅ | ✅ |
| Computer vision | ❌ | ✅ | ❌ | ✅ | ✅ |
| Element reference IDs | ✅ `ref=e1` | ✅ `skyvern_id` | ✅ XPath | ✅ `[42]` | ✅ |
| Multi-frame support | ❌ | ❌ | ✅ | ❌ | ✅ |
| Cookie extraction | ✅ (20+ browsers) | ❌ | ✅ | ✅ | ✅ |
| Session recording | ✅ rrweb | ✅ Video | ❌ | ✅ | ✅ |
| Shadow DOM / OOPIF | ❌ | ❌ | ✅ Deep Locator | ❌ | ✅ |
| Drag and drop | ❌ | ✅ | ✅ | ✅ | ✅ |
| Double/right-click, hover | ❌ | ✅ | ✅ | ✅ | ✅ |
| Scroll to text | ❌ | ❌ | ❌ | ✅ | ✅ |
| Click by coordinates (x,y) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Keyboard combinations | ❌ | ✅ | ✅ | ✅ | ✅ |
| File upload | ❌ | ✅ | ✅ | ✅ | ✅ |
| Form filling (AI-powered) | ❌ | ✅ | ✅ fillForm | ❌ | ✅ |
| Dropdown/select handling | ❌ | ✅ | ✅ | ✅ | ✅ |
| Browser extensions loading | ❌ | ✅ | ❌ | ✅ | ✅ |
| Persistent browser sessions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Browser profile reuse | ❌ | ❌ | ❌ | ✅ Chrome profiles | ✅ |
| Stealth/anti-detection mode | ❌ | ✅ | ✅ Browserbase | ✅ | ✅ |
| Network interception | ❌ | ❌ | ✅ | ❌ | ✅ |
| Page readiness detection | ❌ | ✅ (network idle, DOM stability) | ❌ | ❌ | ✅ |
| HAR file recording | ❌ | ✅ | ❌ | ✅ | ✅ |
| Storage state import/export | ❌ | ❌ | ✅ | ✅ | ✅ |
| Geolocation simulation | ❌ | ❌ | ✅ | ✅ | ✅ |
| Permission management | ❌ | ❌ | ❌ | ✅ | ✅ |
| Init scripts injection | ❌ | ❌ | ✅ | ✅ | ✅ |
| Custom HTTP headers | ❌ | ❌ | ✅ | ✅ | ✅ |
| VNC/CDP viewport streaming | ❌ | ✅ | ❌ | ❌ | ✅ |
| Pagination detection | ❌ | ❌ | ❌ | ✅ | ✅ |
| **AI Integration** |
| Multi-model support | ❌ (Claude/Codex) | ✅ (12+ providers) | ✅ (10+ providers) | ✅ (15+ providers) | ✅ |
| Agent protocol | ✅ ACP | Custom | Custom | Custom | ✅ ACP |
| MCP server | ✅ | ✅ | ✅ | ✅ | ✅ |
| Natural language to actions | ❌ | ✅ | ✅ act() | ✅ | ✅ |
| Adversarial prompts | ✅ | ❌ | ❌ | ❌ | ✅ |
| CUA (Computer Use Agent) | ❌ | ❌ | ✅ (Anthropic/Google/MS/OpenAI) | ❌ | ✅ |
| Agent tool modes (dom/hybrid/cua) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Observe/suggest actions | ❌ | ❌ | ✅ observe() | ❌ | ✅ |
| Multi-step autonomous agent | ❌ | ✅ run_task | ✅ agent() | ✅ | ✅ |
| Zod schema extraction | ❌ | ❌ | ✅ extract() | ❌ | ✅ |
| JSON Schema extraction | ❌ | ✅ | ❌ | ✅ Pydantic | ✅ |
| Vision mode (on/off/auto) | ❌ | ✅ | ❌ | ✅ | ✅ |
| Thinking/reasoning mode | ❌ | ❌ | ✅ | ✅ | ✅ |
| Judge mode (task validation) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Fallback LLM auto-switch | ❌ | ❌ | ❌ | ✅ | ✅ |
| Custom LLM clients (AISDK, LangChain) | ❌ | ❌ | ✅ | ✅ | ✅ |
| LLM prompt caching | ❌ | ✅ (24h) | ✅ | ❌ | ✅ |
| Brave/Browserbase search tools | ❌ | ❌ | ✅ | ❌ | ✅ |
| Variables in prompts | ❌ | ❌ | ✅ (rich w/ descriptions) | ❌ | ✅ |
| Safety confirmation handlers | ❌ | ❌ | ✅ | ❌ | ✅ |
| URL shortening in prompts | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Execution** |
| Action caching | ❌ | ✅ | ✅ (local + server) | ❌ | ✅ |
| Self-healing selectors | ❌ | ✅ | ✅ | ❌ | ✅ |
| Auto-recovery | ❌ | ✅ | ❌ | ✅ | ✅ |
| OTP/2FA handling | ❌ | ✅ (TOTP/SMS/email/QR) | ❌ | ❌ | ✅ |
| Loop detection | ❌ | ❌ | ❌ | ✅ (rolling window) | ✅ |
| Parallel verification | ❌ | ✅ | ❌ | ✅ | ✅ |
| Workflow system (YAML) | ❌ | ✅ (15+ block types) | ❌ | ❌ | ✅ |
| Workflow scheduling (cron) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Workflow copilot / observer | ❌ | ✅ | ❌ | ❌ | ✅ |
| Flow system (save/reuse) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Test planning (AI-driven) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Task system (CRUD + status) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Sandboxed code execution | ❌ | ✅ Python | ❌ | ❌ | ✅ |
| Custom tools (@tools.action) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Skills system (cloud-loaded) | ❌ | ✅ | ❌ | ✅ | ✅ |
| Planning toggle + replan nudges | ❌ | ❌ | ❌ | ✅ | ✅ |
| Max steps / max actions per step | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Data & File Processing** |
| File parsing (CSV/Excel/PDF/Word) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Markdown extraction (HTML→MD) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Save as PDF | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cloud storage (S3/Azure Blob) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Presigned URLs | ❌ | ✅ (24h) | ❌ | ❌ | ✅ |
| Download management (size limits) | ❌ | ✅ (500MB) | ✅ | ✅ | ✅ |
| **Credential Management** |
| Bitwarden integration | ❌ | ✅ | ❌ | ❌ | ✅ |
| 1Password integration | ❌ | ✅ | ❌ | ❌ | ✅ |
| Azure Key Vault | ❌ | ✅ | ❌ | ❌ | ✅ |
| Custom credential HTTP API | ❌ | ✅ | ❌ | ❌ | ✅ |
| Credential CRUD + testing | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Networking & Security** |
| Proxy pool + SOCKS5 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Proxy auth + rotation | ❌ | ✅ | ✅ | ✅ | ✅ |
| Blocked/allowed hosts | ❌ | ✅ | ❌ | ✅ | ✅ |
| Sensitive data masking | ❌ | ✅ | ❌ | ✅ | ✅ |
| CAPTCHA auto-solving | ❌ | ✅ | ✅ Browserbase | ✅ | ✅ |
| Cloudflare tunneling | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Developer Experience** |
| Git integration | ✅ | ❌ | ❌ | ❌ | ✅ |
| CLI (TUI) | ✅ Ink | Web UI + CLI | ✅ Browse CLI | ✅ CLI | ✅ |
| PR integration | ❌ | ❌ | ❌ | ❌ | ✅ |
| Test coverage analysis | ✅ | ❌ | ❌ | ❌ | ✅ |
| Code audit (lint/type/format) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Package manager detection | ✅ | ❌ | ❌ | ❌ | ✅ |
| Template/project generation | ❌ | ❌ | ❌ | ✅ init | ✅ |
| Doctor/install commands | ❌ | ✅ | ❌ | ✅ | ✅ |
| Evaluation/benchmark suite | ❌ | ✅ WebBench | ✅ (GAIA, Mind2Web, etc.) | ❌ | ✅ |
| **Observability** |
| Event tracking (PostHog) | ✅ | ✅ | ❌ | ❌ | ✅ |
| OpenTelemetry | ❌ | ✅ | ❌ | ❌ | ✅ |
| Token usage tracking | ✅ | ✅ | ✅ | ✅ | ✅ |
| Structured logging | ❌ | ✅ structlog | ✅ Pino | ✅ | ✅ |
| Telemetry opt-out | ❌ | ✅ | ❌ | ✅ | ✅ |
| Performance metrics (Web Vitals) | ✅ (FCP/LCP/CLS/INP) | ❌ | ❌ | ❌ | ✅ |
| Per-function metrics | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Memory & State** |
| Short-term memory | ❌ | ❌ | ❌ | ✅ | ✅ |
| Long-term memory | ❌ | ❌ | ❌ | ✅ | ✅ |
| Message compaction | ❌ | ❌ | ❌ | ✅ (thresholds) | ✅ |
| Conversation saving | ❌ | ❌ | ❌ | ✅ | ✅ |
| Instruction history | ✅ (20 items) | ❌ | ❌ | ❌ | ✅ |
| Preferences per project | ✅ | ❌ | ❌ | ❌ | ✅ |
| Execution history tracking | ❌ | ❌ | ✅ | ✅ | ✅ |
| **API & Integrations** |
| REST API endpoints | ❌ | ✅ (full CRUD) | ✅ | ❌ | ✅ |
| Webhook support + retries | ❌ | ✅ | ❌ | ❌ | ✅ |
| SSE (Server-Sent Events) | ❌ | ✅ | ❌ | ❌ | ✅ |
| WebSocket real-time | ✅ | ✅ | ❌ | ❌ | ✅ |
| Zapier/Make/N8N integrations | ❌ | ✅ | ❌ | ❌ | ✅ |
| LangChain/LlamaIndex | ❌ | ✅ | ✅ | ✅ | ✅ |
| Gmail/AgentMail integration | ❌ | ❌ | ❌ | ✅ | ✅ |
| Python SDK | ❌ | ✅ | ❌ | ✅ | ✅ |
| TypeScript SDK | ❌ | ✅ | ✅ | ❌ | ✅ |
| Claude Desktop MCP | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Deployment & Infra** |
| Docker support | ❌ | ✅ | ❌ | ✅ | ✅ |
| PostgreSQL persistence | ❌ | ✅ | ❌ | ❌ | ✅ |
| Redis caching | ❌ | ✅ | ❌ | ❌ | ✅ |
| Multi-tenancy / organizations | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cloud browser (Browserbase) | ❌ | ❌ | ✅ | ✅ Cloud | ✅ |
| Sandbox decorator | ❌ | ❌ | ❌ | ✅ @sandbox | ✅ |
| SEA builds | ❌ | ❌ | ✅ | ❌ | ✅ |
| GIF/video generation | ❌ | ✅ Video | ❌ | ✅ GIF+MP4 | ✅ |
| **Smaller but Important** |
| Snapshot annotation modes | ✅ (screenshot/snapshot/annotated) | ❌ | ❌ | ❌ | ✅ |
| Tool annotations (readOnlyHint/destructiveHint) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Text CAPTCHA solving | ❌ | ✅ | ❌ | ❌ | ✅ |
| Date/time picker handling | ❌ | ✅ | ❌ | ❌ | ✅ |
| Custom dropdown NL selection | ❌ | ✅ | ❌ | ❌ | ✅ |
| Browser timezone/locale config | ❌ | ✅ | ✅ | ❌ | ✅ |
| CBOR encoding for snapshots | ❌ | ❌ | ✅ | ❌ | ✅ |
| Event bus with wildcard support | ❌ | ❌ | ✅ | ❌ | ✅ |
| Frame tree introspection | ❌ | ❌ | ✅ (getFullFrameTree) | ❌ | ✅ |
| Graceful shutdown (SIGINT/SIGTERM) | ❌ | ❌ | ✅ (supervisor) | ❌ | ✅ |
| Keep-alive session management | ❌ | ✅ | ✅ | ❌ | ✅ |
| DOM attribute customization | ❌ | ❌ | ❌ | ✅ | ✅ |
| Page fingerprinting (URL+elements+hash) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Deterministic rendering mode | ❌ | ❌ | ❌ | ✅ | ✅ |
| Demo mode with event logging | ❌ | ❌ | ❌ | ✅ | ✅ |
| CORS/CSP bypass options | ❌ | ❌ | ❌ | ✅ | ✅ |
| SVG element handling | ❌ | ✅ | ❌ | ❌ | ✅ |
| Chromium policies from JSON | ❌ | ✅ | ❌ | ❌ | ✅ |
| **New: Quality & Testing (from additional OSS)** |  |  |  |  |  |
| Accessibility audit (WCAG 2.0/2.1/2.2) | ❌ | ❌ | ❌ | ❌ | ✅ (axe-core) |
| 90+ a11y rules (contrast, ARIA, keyboard, labels) | ❌ | ❌ | ❌ | ❌ | ✅ (axe-core) |
| Performance scoring (5 categories) | ❌ | ❌ | ❌ | ❌ | ✅ (Lighthouse) |
| SEO audit | ❌ | ❌ | ❌ | ❌ | ✅ (Lighthouse) |
| PWA check | ❌ | ❌ | ❌ | ❌ | ✅ (Lighthouse) |
| JS bundle treemap / unused bytes | ❌ | ❌ | ❌ | ❌ | ✅ (Lighthouse) |
| Performance budgets & assertions | ❌ | ❌ | ❌ | ❌ | ✅ (Lighthouse CI) |
| Chaos/monkey testing (random clicks/scrolls/typing) | ❌ | ❌ | ❌ | ❌ | ✅ (Gremlins.js) |
| Gremlin species (clicker, form filler, scroller, typer, toucher) | ❌ | ❌ | ❌ | ❌ | ✅ (Gremlins.js) |
| FPS drop / console error monitoring during chaos | ❌ | ❌ | ❌ | ❌ | ✅ (Gremlins.js) |
| Network-level API mocking (no code changes) | ❌ | ❌ | ❌ | ❌ | ✅ (MSW) |
| HAR/OpenAPI → mock handlers auto-generation | ❌ | ❌ | ❌ | ❌ | ✅ (MSW) |
| Selective passthrough (mock some APIs, real for others) | ❌ | ❌ | ❌ | ❌ | ✅ (MSW) |
| **New: Security Testing (from additional OSS)** |  |  |  |  |  |
| YAML vulnerability templates (12,000+) | ❌ | ❌ | ❌ | ❌ | ✅ (Nuclei) |
| Multi-protocol scanning (HTTP/DNS/TCP/SSL/WebSocket) | ❌ | ❌ | ❌ | ❌ | ✅ (Nuclei) |
| OWASP Top 10 detection (XSS, SQLi, CSRF, etc.) | ❌ | ❌ | ❌ | ❌ | ✅ (ZAP) |
| DAST scanning (spider + active + passive scan) | ❌ | ❌ | ❌ | ❌ | ✅ (ZAP) |
| Intercepting proxy (inspect/modify traffic) | ❌ | ❌ | ❌ | ❌ | ✅ (ZAP) |
| **New: Resilience Testing (from additional OSS)** |  |  |  |  |  |
| Network fault injection (latency, drops, bandwidth) | ❌ | ❌ | ❌ | ❌ | ✅ (Toxiproxy) |
| Randomized chaos with toxicity % | ❌ | ❌ | ❌ | ❌ | ✅ (Toxiproxy) |
| **New: Visual Regression (from additional OSS)** |  |  |  |  |  |
| Pixel-diff with slider HTML reports | ❌ | ❌ | ❌ | ❌ | ✅ (BackstopJS) |
| Multi-viewport responsive breakpoint capture | ❌ | ❌ | ❌ | ❌ | ✅ (BackstopJS) |
| Element masking (exclude dynamic content from diffs) | ❌ | ❌ | ❌ | ❌ | ✅ (Lost Pixel) |
| Storybook/component auto-capture | ❌ | ❌ | ❌ | ❌ | ✅ (Lost Pixel) |
| **New: Infrastructure (from additional OSS)** |  |  |  |  |  |
| Ultra-fast headless browser (11x faster) | ❌ | ❌ | ❌ | ❌ | ✅ (Lightpanda) |
| Website → LLM-ready markdown conversion | ❌ | ❌ | ❌ | ❌ | ✅ (Firecrawl) |
| YAML-based test definitions (no code) | ❌ | ❌ | ❌ | ❌ | ✅ (Maestro) |
| Web agent benchmark env (BrowserGym) | ❌ | ❌ | ❌ | ❌ | ✅ (BrowserGym) |
| **Architecture** |
| TypeScript | ✅ | ❌ | ✅ | ❌ | ✅ |
| Python | ❌ | ✅ | ❌ | ✅ | ✅ (SDK) |
| Effect framework | ✅ | ❌ | ❌ | ❌ | ✅ |
| Monorepo | ✅ Turbo | ✅ | ✅ Turborepo | ❌ | ✅ |

---

## Combined Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INSPECT CLI (Ink/React)                          │
│  Commands: test, pr, compare, devices, agents, record, replay               │
├─────────────────────────────────────────────────────────────────────────────┤
│                          ORCHESTRATOR LAYER                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Git Manager    │  │  Agent Router   │  │  Device Pool    │             │
│  │ (from Expect)   │  │ (from Browser   │  │ (multi-viewport)│             │
│  │                 │  │     Use)        │  │                 │             │
│  │ • Change detect │  │ • Multi-model   │  │ • Device presets│             │
│  │ • Fingerprint   │  │ • Fallback      │  │ • Emulation     │             │
│  │ • Context build │  │ • Specialists   │  │ • Touch/mouse   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          AI/AGENT LAYER                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   MCP Server    │  │  Prompt Engine  │  │  Cache Manager  │             │
│  │ (from Expect)   │  │ (from all)      │  │ (from Stagehand)│             │
│  │                 │  │                 │  │                 │             │
│  │ • Tools expose  │  │ • Adversarial   │  │ • Action cache  │             │
│  │ • Playwright    │  │ • Natural lang  │  │ • Self-healing  │             │
│  │ • ARIA          │  │ • Specialist    │  │ • SHA256 keys   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  ACP Client     │  │  Memory Manager │  │    Watchdogs    │             │
│  │ (from Expect)   │  │ (from Browser   │  │ (from Browser   │             │
│  │                 │  │     Use)        │  │     Use)        │             │
│  │ • Claude/Codex  │  │ • Short-term    │  │ • Captcha       │             │
│  │ • Streaming     │  │ • Long-term     │  │ • Downloads     │             │
│  │ • Auth check    │  │ • Compaction    │  │ • Crashes       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          BROWSER LAYER                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Playwright/CDP  │  │  Vision Engine  │  │  State Capture  │             │
│  │ (from all)      │  │ (from Skyvern)  │  │ (from Stagehand)│             │
│  │                 │  │                 │  │                 │             │
│  │ • Browser ctrl  │  │ • GPT-4V        │  │ • DOM snapshot  │             │
│  │ • CDP direct    │  │ • Gemini Vision │  │ • AX tree       │             │
│  │ • Multi-frame   │  │ • Coord detect  │  │ • Hybrid tree   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Element Tree   │  │ Cookie Manager  │  │ Session Record  │             │
│  │ (from Skyvern)  │  │ (from Expect)   │  │ (from Expect +  │             │
│  │                 │  │                 │  │   Browser Use)  │             │
│  │ • Skyvern IDs   │  │ • Chrome/Safari │  │ • rrweb         │             │
│  │ • Selector map  │  │ • Firefox/Edge  │  │ • Video         │             │
│  │ • Visibility    │  │ • Decryption    │  │ • HAR/Network   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          REPORT LAYER                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Markdown/HTML  │  │  GitHub PR      │  │  Visual Diff    │             │
│  │  Reports        │  │  Integration    │  │  Engine         │             │
│  │                 │  │                 │  │                 │             │
│  │ • Test results  │  │ • PR comments   │  │ • Baseline      │             │
│  │ • Screenshots   │  │ • Status checks │  │ • Pixel diff    │             │
│  │ • Recordings    │  │ • Artifacts     │  │ • AI analysis   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Features (Combined from All 4 Repos)

### 1. Browser Automation Core

#### 1.1 Hybrid DOM + ARIA Snapshot System
**From**: Expect (ARIA), Stagehand (Hybrid), Browser Use (Indexed DOM)

```typescript
// Combine approaches:
// 1. Build ARIA tree (Expect pattern)
// 2. Merge with DOM for completeness (Stagehand pattern)
// 3. Assign stable reference IDs (all repos pattern)

interface ElementSnapshot {
  ref: string;           // "e1", "e2" (Expect style)
  role: string;          // ARIA role
  name: string;          // Accessible name
  xpath: string;         // Fallback XPath (Stagehand)
  skyvern_id?: string;   // Vision fallback ID (Skyvern)
  bounds: { x, y, w, h }; // For coordinate clicking
  visible: boolean;
  interactable: boolean;
}
```

#### 1.2 Computer Vision Fallback
**From**: Skyvern

```typescript
// When DOM/ARIA fails:
// 1. Take screenshot
// 2. Send to GPT-4V / Gemini Vision
// 3. Get coordinate-based click targets
// 4. Execute with coordinate resolver

interface VisionAction {
  type: 'click' | 'type' | 'scroll';
  coordinates: { x: number; y: number };
  confidence: number;
  description: string;
}
```

#### 1.3 Multi-Frame Support
**From**: Stagehand

```typescript
// Handle nested iframes and cross-origin frames
interface FrameRegistry {
  frames: Map<string, FrameInfo>;
  stitchXPath(frameId: string, localPath: string): string;
  captureAllFrames(): Promise<FrameSnapshot[]>;
}
```

#### 1.4 Cookie Extraction & Injection
**From**: Expect

```typescript
// Support all major browsers
const BROWSER_CONFIGS = {
  chrome: { paths: [...], encryption: 'dpapi' },
  safari: { paths: [...], encryption: 'keychain' },
  firefox: { paths: [...], encryption: 'nss' },
  edge: { paths: [...], encryption: 'dpapi' },
  brave: { paths: [...], encryption: 'dpapi' },
  arc: { paths: [...], encryption: 'dpapi' },
};
```

---

### 2. AI Agent Integration

#### 2.1 Multi-Model Support
**From**: Browser Use

```typescript
interface AgentConfig {
  primary: 'claude' | 'gpt' | 'gemini' | 'deepseek';
  fallback?: LLMProvider;  // Auto-switch on rate limits
  specialists?: {
    ux?: LLMProvider;
    security?: LLMProvider;
    a11y?: LLMProvider;
    performance?: LLMProvider;
  };
}
```

#### 2.2 MCP Server (Model Context Protocol)
**From**: Expect

```typescript
// Expose browser tools to AI agents
const MCP_TOOLS = {
  // Navigation
  open: { url: string },
  navigate: { url: string },
  
  // Observation
  screenshot: { mode: 'snapshot' | 'full' },
  console_logs: {},
  network_logs: {},
  
  // Interaction
  playwright: { code: string },  // Execute arbitrary Playwright
  click: { ref: string },
  type: { ref: string, text: string },
  
  // State
  cookies: { action: 'get' | 'set' | 'sync' },
  storage: { key: string },
};
```

#### 2.3 ACP Client (Agent Connection Protocol)
**From**: Expect

```typescript
// Communicate with Claude Code, Codex, etc.
interface ACPClient {
  // Authentication
  checkAuth(): Promise<boolean>;
  promptLogin(): void;
  
  // Streaming
  stream(prompt: string, tools: MCPTools): AsyncGenerator<AgentEvent>;
  
  // Events
  onThought: (thought: string) => void;
  onToolCall: (tool: string, args: any) => void;
  onResult: (result: string) => void;
}
```

#### 2.4 Prompt Engine
**From**: All repos

```typescript
// Combine adversarial (Expect) + natural language (Stagehand/Skyvern)
const SYSTEM_PROMPT = `
You are an adversarial browser testing agent. Your goal is to FIND BUGS, not confirm features work.

PRINCIPLES:
1. Think like a user trying to break the feature
2. Test edge cases: empty inputs, invalid data, special characters
3. Check console errors after every interaction
4. Verify state changes (URL, UI, storage)
5. Try to break navigation (back, refresh, direct URL)

TOOLS:
${MCP_TOOLS_DESCRIPTION}

ELEMENT FORMAT:
- Elements are shown with [ref=eN] identifiers
- Use these refs in your actions
- Example: click({ ref: "e3" })
`;
```

---

### 3. Execution Engine

#### 3.1 Action Caching
**From**: Stagehand

```typescript
interface ActionCache {
  // Cache key: SHA256(instruction + pageUrl + variables)
  getKey(instruction: string, url: string, vars: string[]): string;
  
  // Get cached action
  get(key: string): CachedAction | null;
  
  // Store successful action
  set(key: string, action: Action, selector: string): void;
  
  // Self-healing: if selector fails, try to find by description
  heal(key: string, newSelector: string): void;
}
```

#### 3.2 Self-Healing Selectors
**From**: Skyvern, Stagehand

```typescript
// When a selector fails:
// 1. Check cache for alternative selectors
// 2. Re-scan page for similar elements (by role, name, text)
// 3. Use vision to find element by appearance
// 4. Update cache with new working selector

async function healSelector(
  failedRef: string,
  description: string,
  snapshot: PageSnapshot
): Promise<string | null> {
  // Try semantic matching
  const match = findByRoleAndName(snapshot, description);
  if (match) return match.ref;
  
  // Try vision
  const visionMatch = await visionFindElement(description);
  if (visionMatch) return visionMatch.ref;
  
  return null;
}
```

#### 3.3 Auto-Recovery
**From**: Skyvern, Browser Use

```typescript
interface RecoveryStrategy {
  // Detect what went wrong
  diagnose(error: Error): FailureType;
  
  // Recovery actions
  strategies: {
    'element_not_found': () => reScan | useVision | healSelector,
    'navigation_failed': () => waitForLoad | retry | useFallback,
    'rate_limited': () => switchModel | wait,
    'page_crashed': () => restart | restoreSnapshot,
    'timeout': () => extendTimeout | skip | fail,
  };
}
```

#### 3.4 Loop Detection
**From**: Browser Use

```typescript
interface LoopDetector {
  // Track recent actions
  history: Action[];
  
  // Detect repetition
  detectLoop(): LoopInfo | null;
  
  // Inject "nudge" to break loop
  getNudge(): string;
}

// Example nudge: "You've clicked 'Submit' 3 times without success. Try a different approach."
```

#### 3.5 OTP/2FA Handling
**From**: Skyvern

```typescript
interface OTPHandler {
  // Poll for magic links
  pollEmail(timeout: number): Promise<string>;
  
  // TOTP generation
  generateTOTP(secret: string): string;
  
  // SMS polling (via integration)
  pollSMS(service: string): Promise<string>;
}
```

---

### 4. Memory & State Management

#### 4.1 Short-Term Memory
**From**: Browser Use

```typescript
interface MessageManager {
  // Conversation history
  messages: Message[];
  
  // Compaction when approaching token limits
  compact(): void;
  
  // Summarize old messages
  summarize(): string;
}
```

#### 4.2 Long-Term Memory
**From**: Browser Use

```typescript
interface LongTermMemory {
  // Store across sessions
  store(key: string, value: any): void;
  retrieve(key: string): any;
  
  // Pattern learning
  learnPattern(action: Action, result: Result): void;
  getPatterns(): Pattern[];
}
```

#### 4.3 Watchdogs (Background Monitors)
**From**: Browser Use

```typescript
interface WatchdogManager {
  watchdogs: {
    captcha: CaptchaWatchdog,
    download: DownloadWatchdog,
    popup: PopupWatchdog,
    crash: CrashWatchdog,
  };
  
  // Run in background during agent execution
  startAll(): void;
  stopAll(): void;
}
```

---

### 5. Git Integration

#### 5.1 Change Detection
**From**: Expect

```typescript
interface GitManager {
  // Scope detection
  getScope(target: 'unstaged' | 'branch' | 'commit'): GitScope;
  
  // Fingerprinting (prevent redundant tests)
  getFingerprint(): string;
  saveFingerprint(hash: string): void;
  
  // Context gathering
  getChangedFiles(): string[];
  getDiff(): string;
  getRecentCommits(count: number): Commit[];
}
```

#### 5.2 GitHub PR Integration
**New Feature**

```typescript
interface GitHubIntegration {
  // PR detection
  parsePRUrl(url: string): PRInfo;
  
  // Get PR details
  getPRDiff(pr: PRInfo): string;
  getPRFiles(pr: PRInfo): string[];
  
  // Report results
  postComment(pr: PRInfo, report: TestReport): void;
  setStatus(pr: PRInfo, status: 'pending' | 'success' | 'failure'): void;
  
  // Preview deployment
  getPreviewUrl(pr: PRInfo): string;
}
```

---

### 6. Device & Responsive Testing

#### 6.1 Device Emulation
**New Feature (partially from Playwright)**

```typescript
const DEVICE_PRESETS = {
  // Apple
  'iphone-15': { width: 393, height: 852, dpr: 3, ua: '...' },
  'iphone-15-pro-max': { width: 430, height: 932, dpr: 3, ua: '...' },
  'ipad-pro-12': { width: 1024, height: 1366, dpr: 2, ua: '...' },
  
  // Android
  'pixel-8': { width: 412, height: 915, dpr: 2.625, ua: '...' },
  'samsung-s24': { width: 412, height: 915, dpr: 3, ua: '...' },
  
  // Desktop
  'desktop-1080': { width: 1920, height: 1080, dpr: 1, ua: '...' },
  'desktop-4k': { width: 3840, height: 2160, dpr: 1, ua: '...' },
};

interface DevicePool {
  // Run tests on multiple devices in parallel
  runOnDevices(devices: string[], test: TestFn): Promise<Map<string, Result>>;
  
  // Compare results across devices
  compareResults(results: Map<string, Result>): ComparisonReport;
}
```

---

### 7. Visual Regression

#### 7.1 Screenshot Comparison
**New Feature**

```typescript
interface VisualRegression {
  // Baseline management
  saveBaseline(name: string, screenshot: Buffer): void;
  getBaseline(name: string): Buffer | null;
  
  // Comparison
  compare(actual: Buffer, baseline: Buffer): DiffResult;
  
  // AI analysis
  analyzeDiff(diff: DiffResult): AIAnalysis;
}
```

---

### 8. Workflow & Task System

#### 8.1 YAML Workflow Engine
**From**: Skyvern

```typescript
interface WorkflowEngine {
  // Define workflows in YAML
  parse(yaml: string): WorkflowDefinition;

  // Execute with run tracking
  execute(workflow: WorkflowDefinition, params: Record<string, any>): Promise<WorkflowRun>;

  // Schedule with cron
  schedule(workflowId: string, cron: string): void;

  // Track runs
  getRun(runId: string): WorkflowRun;
  cancelRun(runId: string): void;
  continueRun(runId: string): void; // Resume after human interaction
}

// 15+ block types
type WorkflowBlock =
  | TaskBlock           // Browser task with NL prompt
  | ForLoopBlock        // Loop over data
  | CodeBlock           // Sandboxed JS/TS execution
  | TextPromptBlock     // Send prompt to LLM
  | DataExtractionBlock // Extract with schema
  | ValidationBlock     // Validate page state
  | FileDownloadBlock   // Download files to storage
  | FileUploadBlock     // Upload files
  | FileParserBlock     // Parse CSV/Excel/PDF/Word/JSON
  | SendEmailBlock      // SMTP email sending
  | HTTPRequestBlock    // Make HTTP requests
  | WaitBlock           // Wait for duration/condition
  | HumanInteractionBlock // Pause for manual input
  | ConditionalBlock    // If/else branching
  | PDFParserBlock;     // Extract from PDFs

interface WorkflowContext {
  parameters: Map<string, any>;  // Pass data between blocks
  templateEngine: 'handlebars';  // Template rendering
  strictMode: boolean;           // Template strictness
}
```

#### 8.2 Workflow Copilot & Observer
**From**: Skyvern

```typescript
interface WorkflowCopilot {
  // AI-assisted workflow generation
  generateFromDescription(description: string): WorkflowDefinition;
  suggestNextBlock(current: WorkflowDefinition): BlockSuggestion;
}

interface ObserverMode {
  // Auto-record actions into workflow while browsing
  startRecording(): void;
  stopRecording(): WorkflowDefinition;

  // Convert recorded actions to workflow blocks
  actionsToBlocks(actions: RecordedAction[]): WorkflowBlock[];
}
```

#### 8.3 Flow System (Reusable Test Flows)
**From**: Expect

```typescript
interface FlowManager {
  // Save test flows with slugified names
  save(flow: TestFlow): void;

  // Load by slug
  load(slug: string): TestFlow;

  // List all saved flows
  list(): TestFlow[];

  // Flow metadata
  interface TestFlow {
    slug: string;           // Normalized name
    title: string;
    description: string;    // Max 256 chars
    version: number;
    targetScope: 'unstaged' | 'branch' | 'changes';
    environment: {
      baseUrl: string;
      cookiesRequired: boolean;
    };
    steps: FlowStep[];     // Multi-step with expected outcomes
  }
}
```

#### 8.4 Task System
**From**: Skyvern

```typescript
interface TaskManager {
  create(task: TaskDefinition): Promise<Task>;
  get(taskId: string): Task;
  cancel(taskId: string): void;
  getHistory(): Task[];

  interface TaskDefinition {
    prompt: string;
    url: string;
    maxSteps: number;        // Default 25
    maxIterations: number;   // Default 10
    errorCodes: Record<string, string>; // Custom failure codes
    extractionSchema?: JSONSchema;      // Expected output format
  }
}
```

---

### 9. AI Agent Advanced Features

#### 9.1 Agent Modes & Settings
**From**: Stagehand, Browser Use

```typescript
interface AgentSettings {
  // Tool/interaction mode
  toolMode: 'dom' | 'hybrid' | 'cua';  // From Stagehand

  // Vision settings
  vision: 'enabled' | 'disabled' | 'auto';  // From Browser Use
  visionDetail: 'auto' | 'low' | 'high';

  // Execution settings
  thinkingMode: boolean;        // Enable reasoning/chain-of-thought
  flashMode: boolean;           // Speed-optimized with reduced features
  maxSteps: number;             // Max steps per agent run
  maxActionsPerStep: number;    // Default 5
  stepTimeout: number;          // Per-step timeout

  // Planning
  planningEnabled: boolean;
  replanOnStall: boolean;       // Nudge replanning on loops
  explorationLimit: number;     // Limit exploration steps

  // Failure handling
  maxFailures: number;          // Default 5
  finalRecoveryAttempt: boolean;
}
```

#### 9.2 CUA (Computer Use Agent)
**From**: Stagehand

```typescript
interface CUAAgent {
  // Supported CUA providers
  providers: {
    anthropic: 'claude-computer-use';      // Anthropic Computer Use
    google: 'gemini-computer-control';     // Gemini with computer control
    microsoft: 'fara-agent';              // Microsoft FARA
    openai: 'gpt-vision-computer';        // OpenAI vision + control
  };

  // CUA environments
  environments: 'mac' | 'windows' | 'ubuntu' | 'browser';

  // Vision-based screenshot analysis + coordinate control
  analyzeScreen(screenshot: Buffer): Promise<CUAAction[]>;
  executeAction(action: CUAAction): Promise<void>;
}
```

#### 9.3 Observe Method (Action Suggestions)
**From**: Stagehand

```typescript
interface ObserveResult {
  // Generate candidate actions from current page state
  observe(instruction: string, options?: {
    model?: string;
    variables?: Record<string, string>;
    selector?: string;
    useCache?: boolean;
  }): Promise<ActionSuggestion[]>;

  interface ActionSuggestion {
    selector: string;
    description: string;
    action: 'click' | 'type' | 'scroll' | 'select';
    arguments?: Record<string, any>;
  }
}
```

#### 9.4 Judge Mode (Task Validation)
**From**: Browser Use

```typescript
interface JudgeMode {
  // Validate task completion
  validateCompletion(task: string, trace: AgentTrace): Promise<JudgeResult>;

  // Ground truth checking
  checkGroundTruth(result: any, expected: any): boolean;

  // Separate LLM for judging
  judgeLLM: LLMProvider;
}
```

#### 9.5 Custom Tools & Skills
**From**: Browser Use, Stagehand, Skyvern

```typescript
// Custom tool registration (Browser Use pattern)
interface CustomTools {
  // Decorator-style registration
  action(name: string, description: string, handler: Function): void;

  // With parameter validation
  action(name: string, schema: ZodSchema, handler: Function): void;
}

// Skills system (cloud-loaded)
interface SkillsManager {
  register(skill: Skill): void;
  loadFromCloud(skillId: string): Promise<Skill>;
  execute(skillId: string, params: any): Promise<any>;
  listAvailable(): Skill[];
}
```

#### 9.6 Safety & Confirmation Handlers
**From**: Stagehand

```typescript
interface SafetyHandlers {
  // Callback before dangerous actions
  onConfirmation: (action: AgentAction) => Promise<boolean>;

  // Action filtering
  excludeActions?: string[];  // Actions to never allow

  // Domain restrictions
  allowedDomains?: string[];
  blockedDomains?: string[];
}
```

---

### 10. Credential Management

#### 10.1 Credential Vault
**From**: Skyvern

```typescript
interface CredentialManager {
  // CRUD operations
  create(credential: Credential): Promise<string>;
  get(credentialId: string): Credential;
  update(credentialId: string, data: Partial<Credential>): void;
  delete(credentialId: string): void;
  test(credentialId: string): Promise<boolean>;

  // Provider integrations
  providers: {
    native: NativeCredentialStore;      // Encrypted local storage
    bitwarden: BitwardenIntegration;    // Bitwarden vault
    onePassword: OnePasswordIntegration; // 1Password service accounts
    azureKeyVault: AzureKeyVaultIntegration;
    custom: CustomHTTPCredentialAPI;    // HTTP API-based providers
  };

  // 2FA support
  generateTOTP(credentialId: string): string;
  verifyOTP(credentialId: string, code: string): boolean;

  // Browser profile association
  associateProfile(credentialId: string, profileId: string): void;
}
```

---

### 11. Data Extraction & File Processing

#### 11.1 Structured Data Extraction
**From**: Skyvern, Stagehand, Browser Use

```typescript
interface DataExtractor {
  // Zod schema-based (Stagehand)
  extractWithZod<T>(instruction: string, schema: ZodSchema<T>): Promise<T>;

  // JSON Schema-based (Skyvern)
  extractWithJSONSchema(instruction: string, schema: JSONSchema): Promise<any>;

  // Pydantic-style with Zod (Browser Use)
  extractStructured<T>(instruction: string, model: ZodSchema<T>): Promise<T>;

  // Unstructured (free-form)
  extractText(instruction: string): Promise<string>;

  // Markdown from page (Browser Use)
  extractMarkdown(): Promise<string>;

  // Page content with dedicated LLM
  extractWithLLM(instruction: string, llm?: LLMProvider): Promise<any>;
}
```

#### 11.2 File Parsing
**From**: Skyvern

```typescript
interface FileParser {
  parseCSV(file: Buffer): Promise<Record<string, any>[]>;
  parseExcel(file: Buffer, sheet?: string): Promise<Record<string, any>[]>;
  parsePDF(file: Buffer): Promise<{ text: string; images: Buffer[] }>;
  parseWord(file: Buffer): Promise<string>;
  parseJSON(file: Buffer): Promise<any>;
  parseText(file: Buffer, encoding?: string): Promise<string>;
}
```

#### 11.3 Cloud Storage
**From**: Skyvern

```typescript
interface CloudStorage {
  // S3
  uploadToS3(bucket: string, key: string, data: Buffer): Promise<string>;
  downloadFromS3(bucket: string, key: string): Promise<Buffer>;

  // Azure Blob
  uploadToAzure(container: string, blob: string, data: Buffer): Promise<string>;
  downloadFromAzure(container: string, blob: string): Promise<Buffer>;

  // Presigned URLs (24h expiration)
  getPresignedUrl(storageRef: string): Promise<string>;

  // Download management
  downloadFile(url: string, options?: { maxSize?: number }): Promise<Buffer>; // Default 500MB limit
}
```

---

### 12. Networking & Proxy

#### 12.1 Proxy Management
**From**: Skyvern, Stagehand, Browser Use

```typescript
interface ProxyManager {
  // Proxy pool
  getProxy(location?: string): ProxyConfig;

  // Proxy types
  config: {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
    type: 'http' | 'https' | 'socks5';
  };

  // Proxy rotation
  rotateProxy(): ProxyConfig;

  // Location-based routing
  routeViaLocation(location: string): void;
}
```

#### 12.2 Domain Security
**From**: Skyvern, Browser Use

```typescript
interface DomainSecurity {
  allowedHosts: string[];      // Whitelist (supports wildcards)
  blockedHosts: string[];      // Blacklist

  // Sensitive data masking
  maskingRules: {
    patterns: RegExp[];        // e.g., SSN, credit card
    domains: Record<string, string[]>; // Domain-keyed masking
    maskInScreenshots: boolean; // Blur/redact in captures
    maskInLogs: boolean;
  };
}
```

#### 12.3 Tunneling
**From**: Browser Use

```typescript
interface TunnelManager {
  // Cloudflare tunnel for remote access
  createTunnel(port: number): Promise<string>; // Returns public URL
  listTunnels(): TunnelInfo[];
  stopTunnel(port: number): void;
}
```

---

### 13. API & Web Server

#### 13.1 REST API
**From**: Skyvern

```typescript
// Full CRUD API for programmatic access
const API_ROUTES = {
  // Tasks
  'POST /api/tasks': 'Create and run task',
  'GET /api/tasks/:id': 'Get task status/results',
  'POST /api/tasks/:id/cancel': 'Cancel running task',
  'GET /api/tasks/:id/artifacts': 'Get task artifacts',

  // Workflows
  'POST /api/workflows': 'Create workflow',
  'GET /api/workflows': 'List workflows',
  'PUT /api/workflows/:id': 'Update workflow',
  'DELETE /api/workflows/:id': 'Delete workflow',
  'POST /api/workflows/:id/run': 'Run workflow',
  'GET /api/workflows/runs/:id': 'Get run status',

  // Credentials
  'POST /api/credentials': 'Create credential',
  'GET /api/credentials': 'List credentials',
  'PUT /api/credentials/:id': 'Update credential',
  'DELETE /api/credentials/:id': 'Delete credential',
  'POST /api/credentials/:id/test': 'Test credential',

  // Browser Sessions
  'POST /api/sessions': 'Create persistent session',
  'GET /api/sessions': 'List sessions',
  'DELETE /api/sessions/:id': 'Close session',

  // System
  'GET /api/health': 'Health check',
  'GET /api/version': 'Version info',
  'GET /api/models': 'Available LLM models',
};
```

#### 13.2 Webhooks & Events
**From**: Skyvern, Browser Use

```typescript
interface WebhookManager {
  // Register webhook endpoints
  register(url: string, events: string[]): void;

  // Retry failed webhooks
  retryPolicy: { maxRetries: 3, backoff: 'exponential' };

  // SSE streaming
  streamEvents(client: SSEClient, filter?: string[]): void;

  // WebSocket real-time
  wsConnect(client: WSClient): void;
}
```

---

### 14. Observability & Analytics

#### 14.1 Event Tracking
**From**: Expect, Skyvern

```typescript
interface Analytics {
  // Event categories
  track(event: AnalyticsEvent): void;

  events: {
    session: 'started' | 'ended';
    plan: 'draft_created' | 'generated' | 'approved' | 'rejected';
    run: 'started' | 'completed' | 'failed' | 'cancelled';
    step: 'started' | 'completed' | 'failed';
    browser: 'launched' | 'closed' | 'cookies_injected';
    agent: 'session_created' | 'tool_called';
    flow: 'saved' | 'reused';
    error: 'unexpected' | 'expected';
  };

  // Providers
  provider: 'posthog' | 'custom';

  // Opt-out
  telemetryEnabled: boolean;  // INSPECT_TELEMETRY env var
}
```

#### 14.2 OpenTelemetry
**From**: Skyvern

```typescript
interface Tracing {
  // OTEL integration
  traceLLMCalls: boolean;
  traceDatabaseQueries: boolean;
  traceHTTPRequests: boolean;

  // Custom spans
  startSpan(name: string, metadata?: any): Span;
  endSpan(span: Span): void;
}
```

#### 14.3 Performance Metrics
**From**: Expect

```typescript
interface PerformanceMetrics {
  // Core Web Vitals
  measure(): Promise<{
    FCP: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    LCP: { value: number; rating: string };
    CLS: { value: number; rating: string };
    INP: { value: number; rating: string };
  }>;
}
```

#### 14.4 Token & Execution Metrics
**From**: Stagehand, Browser Use

```typescript
interface Metrics {
  // Per-function tracking
  perFunction: {
    act: TokenMetrics;
    extract: TokenMetrics;
    observe: TokenMetrics;
    agent: TokenMetrics;
  };

  // Token details
  interface TokenMetrics {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    inferenceTimeMs: number;
    cost: number;
  };

  // Aggregation
  getTotal(): TokenMetrics;
}
```

---

### 15. Advanced Browser Features

#### 15.1 Deep Locator (Shadow DOM / OOPIF)
**From**: Stagehand

```typescript
interface DeepLocator {
  // Pierce shadow DOM boundaries
  piercesShadowDOM: boolean;

  // Out-of-process iframe support
  oopifSupport: boolean;

  // Frame registry
  frames: Map<string, FrameInfo>;
  frameOwnership: Map<string, string>;

  // Deep selector resolution
  resolve(selector: string): Promise<ElementHandle>;

  // Nth element selection
  nth(selector: string, index: number): Promise<ElementHandle>;
}
```

#### 15.2 Extended Interaction Actions
**From**: Skyvern, Stagehand, Browser Use

```typescript
interface ExtendedActions {
  // Click variants
  click(ref: string): Promise<void>;
  clickCoordinates(x: number, y: number): Promise<void>;
  doubleClick(ref: string): Promise<void>;
  rightClick(ref: string): Promise<void>;
  clickAndHold(ref: string, duration: number): Promise<void>;

  // Drag and drop
  dragAndDrop(from: string, to: string): Promise<void>;
  dragAndDropCoords(fromX: number, fromY: number, toX: number, toY: number): Promise<void>;

  // Scroll variants
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  scrollToText(text: string): Promise<void>;
  scrollContainer(ref: string, direction: string, amount: number): Promise<void>;

  // Form interactions
  fillForm(fields: Record<string, string>): Promise<void>;  // AI-powered
  selectDropdown(ref: string, value: string): Promise<void>;
  getDropdownOptions(ref: string): Promise<string[]>;
  uploadFile(ref: string, filePath: string): Promise<void>;

  // Keyboard
  keyPress(key: string): Promise<void>;
  keyCombination(keys: string[]): Promise<void>;  // e.g., ['Ctrl', 'A']
  type(text: string, options?: { delay?: number }): Promise<void>;

  // Hover
  hover(ref: string): Promise<void>;
  hoverCoordinates(x: number, y: number): Promise<void>;

  // Viewport
  setViewportSize(width: number, height: number): Promise<void>;

  // Save
  saveAsPDF(options?: PDFOptions): Promise<Buffer>;
}
```

#### 15.3 Persistent Sessions & Profiles
**From**: Skyvern, Browser Use

```typescript
interface SessionManager {
  // Persistent browser sessions
  createSession(options?: SessionOptions): Promise<BrowserSession>;
  resumeSession(sessionId: string): Promise<BrowserSession>;
  closeSession(sessionId: string): void;
  listSessions(): BrowserSession[];

  // Chrome profile reuse
  useProfile(profilePath: string): void;

  // Storage state management
  exportState(): Promise<StorageState>;  // cookies, localStorage, sessionStorage
  importState(state: StorageState): void;

  // Browser extensions
  loadExtensions(paths: string[]): void;

  // Chromium policies from JSON
  loadPolicies(policiesPath: string): void;
}
```

#### 15.4 Page Readiness Detection
**From**: Skyvern

```typescript
interface PageReadiness {
  // Network idle detection
  waitForNetworkIdle(timeout?: number): Promise<void>;  // Default 3s

  // Loading indicator detection
  waitForLoadingDone(timeout?: number): Promise<void>;  // Default 5s

  // DOM stability (mutation observer)
  waitForDOMStable(threshold?: number): Promise<void>;  // Default 300ms
}
```

#### 15.5 Browser Stealth & Anti-Detection
**From**: Skyvern, Stagehand (Browserbase), Browser Use

```typescript
interface StealthMode {
  enabled: boolean;

  // Anti-fingerprinting
  spoofWebGL: boolean;
  spoofCanvas: boolean;
  spoofAudioContext: boolean;

  // Chrome flags
  disableAutomationFlags: boolean;

  // User agent rotation
  rotateUserAgent: boolean;

  // Chrome channel selection
  channel: 'stable' | 'dev' | 'canary' | 'beta';
}
```

---

### 16. Watchdogs (Background Monitors)

#### 16.1 Full Watchdog Suite
**From**: Browser Use (expanded from existing)

```typescript
interface WatchdogManager {
  watchdogs: {
    // Existing (from PLAN)
    captcha: CaptchaWatchdog;
    download: DownloadWatchdog;
    popup: PopupWatchdog;
    crash: CrashWatchdog;

    // NEW: Additional watchdogs from Browser Use
    defaultAction: DefaultActionWatchdog;  // Prevents infinite action loops
    dom: DOMWatchdog;                      // Detects page structure changes
    harRecording: HARRecordingWatchdog;    // Records HTTP traffic
    recording: RecordingWatchdog;          // Video recording management
    screenshot: ScreenshotWatchdog;        // Screenshot capture management
    permissions: PermissionsWatchdog;      // Browser permission prompts
    security: SecurityWatchdog;            // Security-related monitoring
    localStorage: LocalBrowserWatchdog;    // Local Chrome-specific
    storageState: StorageStateWatchdog;    // Save/load browser storage
    aboutBlank: AboutBlankWatchdog;        // Handle about:blank pages
  };
}
```

---

### 17. Cloud & Deployment

#### 17.1 Browserbase / Cloud Browsers
**From**: Stagehand, Browser Use

```typescript
interface CloudBrowserProvider {
  // Browserbase integration
  browserbase: {
    createSession(options: BrowserbaseOptions): Promise<CloudSession>;
    getDebugUrl(sessionId: string): string;
    keepAlive: boolean;
    multiRegion: boolean;
    stealthMode: boolean;
    captchaAutoSolve: boolean;
  };

  // Browser Use Cloud
  browserUseCloud: {
    provision(): Promise<CloudBrowser>;
    stealthMode: boolean;
    proxyRotation: boolean;
    parallelExecution: boolean;
  };
}
```

#### 17.2 Docker Support
**From**: Skyvern, Browser Use

```typescript
interface DockerConfig {
  // Docker detection
  isDocker: boolean;       // IN_DOCKER env var

  // GPU support
  gpuEnabled: boolean;

  // DevShm configuration
  devShmSize: string;

  // Container-optimized Chrome flags
  chromeFlags: string[];
}
```

#### 17.3 Database Persistence
**From**: Skyvern

```typescript
interface DatabaseConfig {
  // PostgreSQL
  connectionString: string;
  poolSize: number;          // Default 5
  maxOverflow: number;       // Default 10
  statementTimeout: number;  // Default 60s

  // Read replica
  replicaUrl?: string;

  // Migrations
  runMigrations(): Promise<void>;  // Alembic-style
}
```

#### 17.4 Redis Caching
**From**: Skyvern

```typescript
interface CacheConfig {
  // Local in-process
  localCache: Map<string, CacheEntry>;

  // Redis distributed
  redisUrl?: string;

  // Cache types
  cacheTypes: {
    actions: boolean;        // Browser action results
    llmResponses: boolean;   // LLM response cache
    pageContent: boolean;    // Scraped page content
    prompts: boolean;        // Prompt cache (24h window)
  };

  // TTL configuration
  defaultTTL: number;

  // Invalidation
  invalidate(pattern: string): void;
}
```

#### 17.5 Multi-Tenancy
**From**: Skyvern

```typescript
interface MultiTenancy {
  organizations: {
    create(org: Organization): Promise<string>;
    get(orgId: string): Organization;

    // Data isolation
    isolationLevel: 'row' | 'schema' | 'database';

    // RBAC
    roles: 'admin' | 'member' | 'viewer';
    assignRole(userId: string, orgId: string, role: string): void;
  };
}
```

---

### 18. Third-Party Integrations

#### 18.1 Automation Platform Connectors
**From**: Skyvern

```typescript
interface PlatformIntegrations {
  zapier: { triggerWebhook(event: string, data: any): void };
  make: { triggerScenario(scenarioId: string, data: any): void };
  n8n: { triggerWorkflow(workflowId: string, data: any): void };
}
```

#### 18.2 AI Framework Integrations
**From**: Stagehand, Skyvern, Browser Use

```typescript
interface AIFrameworkIntegrations {
  langchain: { asTool(): LangChainTool };
  llamaindex: { asTool(): LlamaIndexTool };
  vercelAI: { asAISDKProvider(): AISDKProvider };
}
```

#### 18.3 Communication Integrations
**From**: Browser Use, Skyvern

```typescript
interface CommunicationIntegrations {
  // Email
  email: {
    send(to: string, subject: string, body: string): Promise<void>;  // SMTP
    pollInbox(timeout: number): Promise<Email[]>;  // For OTP
  };

  // Temporary email (for testing)
  agentMail: {
    createTempAccount(): Promise<TempEmail>;
    getMessages(accountId: string): Promise<Email[]>;
  };

  // Gmail
  gmail: {
    readMessages(query: string): Promise<GmailMessage[]>;
    getAttachments(messageId: string): Promise<Buffer[]>;
  };
}
```

---

### 19. SDK & Programmatic Access

#### 19.1 TypeScript SDK
**From**: Stagehand, Skyvern

```typescript
// Primary SDK (TypeScript)
import { Inspect } from '@inspect/sdk';

const inspect = new Inspect({
  model: 'claude',
  headless: true,
});

// Act
await inspect.act('Click the login button');

// Extract
const data = await inspect.extract('Get all product prices', z.object({
  products: z.array(z.object({ name: z.string(), price: z.number() }))
}));

// Observe
const suggestions = await inspect.observe('What can I do on this page?');

// Agent (multi-step)
const result = await inspect.agent('Complete the checkout flow', {
  maxSteps: 20,
  streaming: true,
  onStep: (step) => console.log(step),
});
```

#### 19.2 Python SDK
**From**: Skyvern, Browser Use

```python
# Python SDK for non-TypeScript users
from inspect_sdk import Inspect

inspect = Inspect(api_key="...", model="claude")

# Same API as TypeScript
result = await inspect.act("Click the login button")
data = await inspect.extract("Get product prices", schema={...})
```

---

### 20. Evaluation & Benchmarks

#### 20.1 Benchmark Suite
**From**: Stagehand, Skyvern

```typescript
interface EvaluationSuite {
  benchmarks: {
    gaia: GAIABenchmark;           // General AI assistant tasks
    mind2web: Mind2WebBenchmark;   // Web navigation tasks
    webvoyager: WebVoyagerBenchmark; // Web browsing tasks
    webtailbench: WebTailBenchmark; // Web interaction tasks
    webbench: WebBenchBenchmark;   // Skyvern's benchmark (64.4%)
  };

  // Model comparison
  compareModels(models: string[], benchmark: string): Promise<ComparisonReport>;

  // Scoring
  score(taskId: string, result: any, expected: any): number;

  // Custom evaluation tasks
  addCustomTask(task: EvalTask): void;
}
```

---

### 21. Recording & Playback

#### 21.1 Video/GIF Generation
**From**: Browser Use, Expect

```typescript
interface RecordingEngine {
  // rrweb recording (Expect)
  rrweb: {
    startRecording(interval?: number): void;  // Default 100ms
    stopRecording(): RRWebEvent[];
    generateHTMLViewer(events: RRWebEvent[]): string;
    saveReplay(planId: string): void;  // .expect/replays/{planId}.ndjson
  };

  // Video recording
  video: {
    startRecording(options?: { fps?: number; codec?: string }): void;
    stopRecording(): Promise<Buffer>;  // MP4
  };

  // GIF generation (Browser Use)
  gif: {
    fromHistory(history: AgentHistory, options?: {
      showGoals: boolean;
      showActions: boolean;
      fontCustomization: FontOptions;
      duration: number;
    }): Promise<Buffer>;
  };

  // HAR recording
  har: {
    startCapture(): void;
    stopCapture(): HARArchive;
    save(path: string): void;
  };

  // Live view server (Expect)
  liveView: {
    startServer(port: number): void;
    broadcastState(state: BrowserState): void;  // WebSocket
  };

  // Replay proxy server (Expect)
  replayProxy: {
    serve(replayId: string, port: number): void;
  };
}
```

---

### 22. Accessibility Testing
**From**: axe-core (7k stars, 105 rules), Pa11y

```typescript
interface AccessibilityAuditor {
  // Run WCAG audit on current page (axe-core engine)
  audit(options?: {
    standard: 'wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21aa' | 'wcag22aa';
    rules?: string[];        // Specific rules to run
    tags?: string[];         // Filter by tag (cat.aria, cat.color, cat.forms, etc.)
    exclude?: string[];      // Selectors to exclude
    resultTypes?: ('violations' | 'passes' | 'incomplete' | 'inapplicable')[];
    iframes?: boolean;       // Test iframe content (default: true)
    ancestry?: boolean;      // Include ancestor chain in results
    xpath?: boolean;         // Include XPath expressions
    reporter?: 'v1' | 'v2' | 'raw' | 'no-passes' | string; // Output format
  }): Promise<A11yReport>;

  // Partial run for multi-frame testing (axe-core pattern)
  auditPartial(context: string): Promise<PartialResult>;
  finishAudit(partials: PartialResult[]): Promise<A11yReport>;

  interface A11yReport {
    violations: A11yViolation[];   // Failing rules (21 critical, 52 serious, 18 moderate, 14 minor)
    passes: A11yRule[];            // Passing rules
    incomplete: A11yRule[];        // Needs manual review
    inapplicable: A11yRule[];     // Rules not applicable to this page
    score: number;                 // 0-100 accessibility score
    testEnvironment: { userAgent, windowWidth, windowHeight, orientation };
  }

  interface A11yViolation {
    id: string;                    // e.g., 'color-contrast'
    impact: 'critical' | 'serious' | 'moderate' | 'minor';
    description: string;           // What failed
    help: string;                  // How to fix
    helpUrl: string;               // axe-core docs link
    tags: string[];                // WCAG criteria tags (e.g., 'wcag2aa', 'wcag143')
    nodes: {
      html: string;               // Failing element HTML
      target: string[];           // Selector path (supports frames/shadow DOM)
      xpath: string;              // XPath expression
      ancestry: string[];         // Ancestor selector chain
      failureSummary: string;     // Why it failed
      any: CheckResult[];         // At least one must pass
      all: CheckResult[];         // All must pass
      none: CheckResult[];        // None must pass
    }[];
  }

  // 105 rules organized by category:
  // cat.aria (31 rules) - ARIA attributes, roles, naming
  // cat.color (3 rules) - Contrast ratios (4.5:1 AA, 7:1 AAA)
  // cat.forms (8 rules) - Labels, controls, autocomplete
  // cat.keyboard (5 rules) - Focus traps, tabindex, navigation
  // cat.language (4 rules) - HTML lang, valid-lang
  // cat.name-role-value (12 rules) - Accessible names
  // cat.structure (8 rules) - Headings, landmarks, lists
  // cat.tables (6 rules) - Data tables, headers, cells
  // cat.text-alternatives (6 rules) - Image alt, SVG, object
  // cat.time-and-media (4 rules) - Captions, autoplay, blink
  // cat.sensory-and-visual-cues (3 rules) - Target size, orientation

  // Additional standards:
  // - Section 508 compliance
  // - EN-301-549 (European accessibility standard)
  // - RGAA (French accessibility standard)

  // Color contrast utilities (from axe-core commons)
  colorContrast: {
    getContrast(fg: Color, bg: Color): number;         // Calculate ratio
    getBackgroundColor(element: Element): Color;        // Handles stacking contexts
    getForegroundColor(element: Element): Color;
    hasValidContrastRatio(fg: Color, bg: Color, size: 'normal' | 'large'): boolean;
  };

  // Custom rule creation (axe-core pattern)
  addCustomRule(rule: {
    id: string;
    selector: string;
    impact: string;
    tags: string[];
    checks: { id: string; evaluate: Function; messages: { pass: string; fail: string } }[];
  }): void;

  // 15+ language support for reports
  locale: 'en' | 'de' | 'fr' | 'es' | 'ja' | 'ko' | 'zh' | 'pt-BR' | string;

  // Run after every agent step (optional)
  auditAfterEachStep: boolean;

  // Sitemap-wide audit (Pa11y-CI pattern)
  auditSitemap(urls: string[]): Promise<Map<string, A11yReport>>;

  // Track scores over time
  getScoreHistory(): A11yScoreHistory[];

  // Shadow DOM + iframe support
  shadowDomSupport: boolean;   // V1 Open Shadow DOM traversal
  crossFrameSupport: boolean;  // Multi-level iframe testing
}
```

---

### 23. Performance & SEO Auditing
**From**: Lighthouse (30k stars, 8 metrics, 65+ audits per category)

```typescript
interface PerformanceAuditor {
  // Lighthouse integration - 5 category audit
  runLighthouse(url: string, options?: {
    categories: ('performance' | 'accessibility' | 'best-practices' | 'seo' | 'pwa')[];
    device: 'mobile' | 'desktop';
    preset: 'desktop' | 'perf' | 'experimental';
    throttling: {
      method: 'simulated' | 'devtools' | 'provided';
      rttMs: number;               // Default: 150ms (Slow 4G)
      downloadKbps: number;        // Default: 1600
      uploadKbps: number;          // Default: 750
      cpuSlowdown: number;         // Default: 4x
    };
    blockedUrlPatterns?: string[];  // Block specific URLs
    extraHeaders?: Record<string, string>;  // Custom HTTP headers
    disableStorageReset?: boolean;  // Preserve cookies/storage
  }): Promise<LighthouseReport>;

  interface LighthouseReport {
    scores: {
      performance: number;         // 0-100 (weighted: FCP 10%, LCP 25%, TBT 30%, CLS 25%, SI 10%)
      accessibility: number;       // 65+ accessibility audits
      bestPractices: number;       // 22 best practice audits
      seo: number;                 // 11 SEO audits
      pwa: number;                 // PWA criteria
    };
    metrics: {
      FCP: { value: number; rating: string };   // First Contentful Paint
      LCP: { value: number; rating: string };   // Largest Contentful Paint
      CLS: { value: number; rating: string };   // Cumulative Layout Shift
      TBT: { value: number; rating: string };   // Total Blocking Time
      SI: { value: number; rating: string };    // Speed Index
      TTI: { value: number; rating: string };   // Time to Interactive
      INP: { value: number; rating: string };   // Interaction to Next Paint
      TTFB: { value: number; rating: string };  // Time to First Byte
    };
    opportunities: Opportunity[];   // Actionable improvements with estimated savings
    diagnostics: Diagnostic[];      // JS bundle, unused CSS/JS, long tasks
    treemap: TreemapData;          // JS bundle breakdown by package
    filmstrip: Screenshot[];       // Timeline screenshot thumbnails
    stackPacks: StackPackAdvice[]; // Framework-specific advice (React, Vue, Angular, Next.js, etc.)
  }

  // User Flows (Lighthouse pattern) - multi-step measurement
  startFlow(page: Page): LighthouseFlow;
  interface LighthouseFlow {
    navigate(url: string): Promise<void>;         // Page load measurement
    startTimespan(): void;                         // Start interaction period
    endTimespan(): void;                           // End interaction period
    snapshot(): Promise<void>;                     // Current state analysis
    generateReport(): Promise<string>;             // Multi-step HTML report
  }

  // Performance budgets (Lighthouse CI pattern)
  setBudgets(budgets: {
    metric: string;               // e.g., 'largest-contentful-paint'
    budget: number;               // e.g., 2500 (ms)
  }[]): void;

  // Assert budgets pass (for CI)
  assertBudgets(): Promise<{ passed: boolean; failures: BudgetFailure[] }>;

  // Output formats
  outputFormats: 'html' | 'json' | 'csv';

  // Historical tracking
  trackScores(url: string): void;
  getScoreHistory(url: string): ScoreHistory[];

  // Stack Packs - framework-specific advice for 15+ frameworks:
  // React, Vue, Angular, Next.js, Nuxt, Gatsby, WordPress, Drupal,
  // Wix, Magento, Joomla, AMP, NitroPack, WP-Rocket, Ezoic
}
```

---

### 24. Chaos & Resilience Testing
**From**: Gremlins.js, Toxiproxy

```typescript
interface ChaosEngine {
  // Gremlins.js - Random UI chaos testing
  gremlins: {
    // Unleash random user interactions
    unleash(options?: {
      species: ('clicker' | 'formFiller' | 'scroller' | 'typer' | 'toucher')[];
      count: number;              // Number of random interactions (default: 1000)
      delay: number;              // ms between interactions (default: 10)
      targetArea?: { x, y, w, h }; // Restrict to area
      excludeSelectors?: string[];  // Don't touch these elements
    }): Promise<ChaosReport>;

    // Mogwai monitors (run during chaos)
    monitors: {
      consoleErrors: boolean;     // Watch for console.error
      fpsDrop: boolean;           // Watch for FPS drops
      alerts: boolean;            // Watch for alert() dialogs
      unhandledExceptions: boolean;
    };

    // Auto-stop after N errors
    maxErrors: number;            // Default: 10

    interface ChaosReport {
      interactions: number;
      errors: Error[];
      fpsDrops: FPSDrop[];
      consoleErrors: string[];
      duration: number;
    }
  };

  // Toxiproxy - Network fault injection
  network: {
    // Inject faults into network traffic
    addFault(fault: NetworkFault): void;

    // 7 toxic types from Toxiproxy (11.9k stars)
    type NetworkFault =
      | { type: 'latency'; delay: number; jitter?: number }      // Per-packet delay
      | { type: 'bandwidth'; rate: number }                       // Limit KB/s (100ms chunking)
      | { type: 'timeout'; timeout: number }                      // Block data after timeout, close
      | { type: 'reset_peer'; timeout: number }                   // TCP RST (cable unplug simulation)
      | { type: 'slow_close'; delay: number }                     // Delay connection closure
      | { type: 'slicer'; avgSize: number; sizeVariation: number; delay: number } // Split packets
      | { type: 'limit_data'; bytes: number };                    // Close after N bytes

    // Stream direction (upstream = client→server, downstream = server→client)
    stream: 'upstream' | 'downstream';

    // Toxicity percentage (0-100) - what % of connections are affected
    toxicity: number;

    // Toggle faults during test
    enable(faultId: string): void;
    disable(faultId: string): void;

    // Clear all faults
    reset(): void;
  };
}
```

---

### 25. Security Scanning
**From**: Nuclei (27.6k stars, 14 protocols, 12k+ templates), ZAP (14.9k stars, 37+ extensions)

```typescript
interface SecurityScanner {
  // Nuclei - Template-based vulnerability scanning
  nuclei: {
    // Scan with YAML templates
    scan(url: string, options?: {
      templates: string[];        // Template paths or categories
      severity: ('info' | 'low' | 'medium' | 'high' | 'critical')[];
      protocols: ('http' | 'dns' | 'tcp' | 'ssl' | 'websocket' | 'whois' |
                  'headless' | 'javascript' | 'code' | 'file' | 'flow' | 'workflow')[];
      rateLimit: number;          // Requests per second
      tags?: string[];            // Filter by tag
      author?: string[];          // Filter by author
      inputMode?: 'list' | 'burp' | 'jsonl' | 'yaml' | 'openapi' | 'swagger';
      proxy?: string;             // Proxy URL
      headless?: boolean;         // Use Chrome for headless scanning
    }): Promise<SecurityReport>;

    // DAST fuzzing (from Nuclei)
    fuzz(url: string, options?: {
      type: 'replace' | 'prefix' | 'postfix' | 'infix';
      aggression: 'low' | 'medium' | 'high';
    }): Promise<SecurityReport>;

    // AI-powered template generation
    generateTemplate(prompt: string): Promise<string>;  // -ai flag

    // 12,000+ community templates
    categories: {
      cves: 'Known CVEs';
      misconfigurations: 'Server misconfigs';
      exposures: 'Sensitive data exposure';
      defaultCredentials: 'Default logins';
      technologies: 'Tech stack detection';
    };

    // Output formats
    exportFormats: 'jsonl' | 'json' | 'markdown' | 'sarif' | 'pdf';

    // Issue tracker integration
    trackers: {
      github: { createIssue(finding: Finding): void };
      gitlab: { createIssue(finding: Finding): void };
      jira: { createIssue(finding: Finding): void };
      linear: { createIssue(finding: Finding): void };
    };

    // 100+ DSL functions for template matching
    dslFunctions: 'string manipulation, URL encoding, base64, hashing, regex, math';
  };

  // ZAP - DAST scanning (37+ built-in extensions)
  zap: {
    // Spider the site (discover all pages)
    spider(url: string, maxDepth?: number): Promise<string[]>;

    // Passive scan (50+ scanner rules, analyze traffic without attacking)
    passiveScan(url: string): Promise<SecurityAlert[]>;

    // Active scan (actively test for vulnerabilities)
    activeScan(url: string, options?: {
      policy?: string;            // Custom scan policy
      strength: 'LOW' | 'MEDIUM' | 'HIGH';
      threshold: 'LOW' | 'MEDIUM' | 'HIGH';
      contextId?: string;         // Scoped scan
      asUser?: string;            // Authenticated scan
    }): Promise<SecurityAlert[]>;

    // Fuzzer module
    fuzz(url: string, payloads: string[]): Promise<SecurityAlert[]>;

    // Authentication
    authenticate(options: {
      method: 'form' | 'script' | 'cookie' | 'manual';
      loginUrl: string;
      credentials: { username: string; password: string };
      loggedInIndicator?: string;   // Regex pattern
      loggedOutIndicator?: string;  // Regex pattern
    }): void;

    // Script types for custom scanning
    scripts: {
      active: 'Custom active scanner plugins';
      passive: 'Custom passive analyzer plugins';
      httpSender: 'Modify requests/responses in transit';
      proxy: 'Intercept and modify proxied traffic';
      authentication: 'Custom auth logic';
      standalone: 'Independent script execution';
    };

    // REST API (XML, JSON, HTML, JSONP response formats)
    api: {
      baseUrl: string;             // http://zap/ when proxied
      apiKey: string;
      // Full CRUD for scans, policies, users, contexts
    };

    // OWASP Top 10 coverage (full)

    interface SecurityAlert {
      risk: 'high' | 'medium' | 'low' | 'informational';
      name: string;               // e.g., 'SQL Injection'
      description: string;
      solution: string;           // How to fix
      url: string;                // Affected URL
      evidence: string;           // What was found
      cweid: number;              // CWE ID
      wascid: number;             // WASC ID
    };
  };

  // Proxy mode - route browser through scanner
  useAsProxy(port: number): void;
}
```

---

### 26. API Mocking (Deterministic Tests)
**From**: MSW (Mock Service Worker)

```typescript
interface APIMocking {
  // Network-level request interception (no code changes needed)
  mock: {
    // REST API mocking
    rest: {
      get(path: string, handler: MockHandler): void;
      post(path: string, handler: MockHandler): void;
      put(path: string, handler: MockHandler): void;
      delete(path: string, handler: MockHandler): void;
    };

    // GraphQL mocking
    graphql: {
      query(operationName: string, handler: MockHandler): void;
      mutation(operationName: string, handler: MockHandler): void;
    };

    // Auto-generate from specs
    fromHAR(harFile: string): void;        // Record real traffic → mocks
    fromOpenAPI(specFile: string): void;    // OpenAPI spec → mocks

    // Selective passthrough
    passthrough(urlPattern: string): void;  // Let some APIs hit real servers

    // Dynamic mock data (Faker.js patterns)
    faker: {
      name(): string;
      email(): string;
      phone(): string;
      address(): string;
      lorem(sentences: number): string;
    };

    // Conditional responses
    when(condition: (req: Request) => boolean): {
      respond(status: number, body: any): void;
    };

    // Start/stop mocking
    start(): void;
    stop(): void;
    reset(): void;
  };
}
```

---

### 27. Enhanced Visual Regression
**From**: BackstopJS, Lost Pixel

```typescript
interface EnhancedVisualRegression {
  // BackstopJS-style pixel diffing
  compare(options: {
    testUrl: string;
    referenceUrl?: string;          // Or use saved baseline
    viewports: { width: number; height: number; label: string }[];
    scenarios: {
      label: string;
      selectors?: string[];        // Capture specific elements
      clickSelector?: string;      // Click before capture
      hoverSelector?: string;      // Hover before capture
      scrollToSelector?: string;   // Scroll before capture
      delay?: number;              // Wait before capture
    }[];
    mismatchThreshold: number;     // % allowed difference (default: 0.1)
  }): Promise<VisualReport>;

  // Interactive HTML report with slider
  generateReport(results: VisualReport): string;  // HTML file

  // Element masking (Lost Pixel pattern)
  mask: {
    // Exclude dynamic content from diffs
    selectors: string[];           // e.g., ['.timestamp', '.ad-banner']
    regions: { x, y, w, h }[];    // Pixel regions to ignore
    maskColor: string;             // Default: '#FF00FF'
  };

  // Storybook auto-capture (Lost Pixel pattern)
  captureStorybook(storybookUrl: string): Promise<Map<string, Buffer>>;

  // Approve/reject workflow
  approve(testId: string): void;
  reject(testId: string): void;
}
```

---

### 28. Fast Headless Browser Option
**From**: Lightpanda

```typescript
interface BrowserBackend {
  // Choose browser backend
  backend: 'chromium' | 'lightpanda';

  // Lightpanda: 11x faster, 9x less memory
  // - Skips CSS rendering, image loading, layout, GPU compositing
  // - CDP compatible (works with existing Playwright code)
  // - 140 concurrent instances per server (vs 15 for Chrome)
  // - Ideal for AI agent workloads (don't need visual rendering)
  lightpanda?: {
    maxInstances: number;          // Default: 140
    memoryLimit: string;           // e.g., '512MB'
  };

  // Firecrawl: Website → LLM-ready data
  firecrawl?: {
    // Convert page to clean markdown for LLM context
    toMarkdown(url: string): Promise<string>;

    // Structured extraction with schema
    extract(url: string, schema: JSONSchema): Promise<any>;

    // Crawl entire site
    crawlSite(url: string, options?: {
      maxPages: number;
      includePatterns?: string[];
      excludePatterns?: string[];
    }): Promise<CrawlResult[]>;
  };
}
```

---

### 29. YAML Test Definitions
**From**: Maestro

```yaml
# inspect-test.yaml - No-code test definition
name: "Login Flow Test"
device: "iphone-15"

steps:
  - navigate: "https://example.com/login"
  - type:
      selector: "#email"
      text: "user@example.com"
  - type:
      selector: "#password"
      text: "password123"
  - click: "Login"
  - assertVisible: "Welcome back"
  - assertUrl: "*/dashboard"
  - screenshot: "login-success"
  - lighthouse:
      performance: ">= 80"
      accessibility: ">= 90"
  - a11y:
      standard: "wcag2aa"
      maxViolations: 0
```

```typescript
interface YAMLTestRunner {
  // Parse and execute YAML test files
  runYAML(filePath: string): Promise<TestResult>;

  // Batch run all YAML tests in directory
  runAll(directory: string): Promise<Map<string, TestResult>>;

  // AI-generate YAML from natural language
  generateYAML(instruction: string): Promise<string>;
}
```

---

### 30. Web Agent Benchmarking
**From**: BrowserGym

```typescript
interface AgentBenchmark {
  // BrowserGym-style standardized environments
  environments: {
    workArena: WorkArenaBenchmark;    // 19,912 ServiceNow tasks
    workArenaPP: WorkArenaPPBenchmark; // 682 complex composed tasks
    webarena: WebArenaBenchmark;       // Open-ended web tasks
    visualWebArena: VisualWebArenaBenchmark; // Vision-based tasks
  };

  // Run agent against benchmark
  evaluate(agent: AgentConfig, benchmark: string): Promise<BenchmarkResult>;

  // Leaderboard
  getLeaderboard(benchmark: string): LeaderboardEntry[];

  // Compare models
  compareModels(models: string[], benchmark: string): ComparisonChart;
}
```

---

### 31. Micro-Features (Small but Essential)

#### 22.1 Snapshot Annotation Modes
**From**: Expect

```typescript
// Three capture modes for screenshot tool
type SnapshotMode =
  | 'screenshot'   // Plain PNG image
  | 'snapshot'     // ARIA accessibility tree with element refs
  | 'annotated';   // Screenshot with numbered element labels overlaid

// Tool annotations for agent parallel execution
interface ToolAnnotation {
  readOnlyHint: boolean;    // Safe for parallel calls
  destructiveHint: boolean; // Marks actions that change state
}
```

#### 22.2 Text CAPTCHA & Date Picker Handling
**From**: Skyvern

```typescript
interface SpecialElementHandlers {
  // Text CAPTCHA solving
  solveTextCaptcha(screenshot: Buffer): Promise<string>;

  // Date/time picker handling (react-datetime, native, custom)
  handleDatePicker(ref: string, date: string, format?: string): Promise<void>;

  // NL-powered custom dropdown selection (non-standard selects)
  selectCustomDropdown(ref: string, instruction: string): Promise<void>;

  // SVG element interaction
  handleSVGElement(ref: string, action: string): Promise<void>;
}
```

#### 22.3 Browser Fine-Tuning
**From**: Skyvern, Stagehand, Browser Use

```typescript
interface BrowserFineTuning {
  // Timezone & locale
  timezone: string;            // e.g., 'America/New_York'
  locale: string;              // e.g., 'en-US'

  // Chromium policies from JSON
  chromiumPolicies: Record<string, any>;

  // CORS/CSP bypass (for testing)
  disableCORS: boolean;
  disableCSP: boolean;

  // Deterministic rendering (for reproducible screenshots)
  deterministicRendering: boolean;

  // Chrome sandbox control
  disableSandbox: boolean;

  // DOM attribute customization
  includedDomAttributes: string[];  // Which attrs to capture
  clickableTextLengthLimit: number; // Limit text in element descriptions
}
```

#### 22.4 Page Fingerprinting
**From**: Browser Use

```typescript
interface PageFingerprint {
  // Deterministic page identity
  generate(page: Page): string;  // Hash of URL + element count + text content hash

  // Change detection between steps
  hasChanged(prev: string, current: string): boolean;
}
```

#### 22.5 CBOR Encoding & Frame Introspection
**From**: Stagehand

```typescript
interface SnapshotOptimizations {
  // CBOR encoding for efficient snapshot transfer
  encodeSnapshot(tree: AXTree): Buffer;    // Compact binary
  decodeSnapshot(data: Buffer): AXTree;

  // Stack limit detection and retry for deep DOMs
  cborStackRetry: boolean;

  // Frame tree introspection
  getFullFrameTree(): Promise<FrameTree>;
  listAllFrameIds(): Promise<string[]>;
}
```

#### 22.6 Event System & Process Management
**From**: Stagehand, Browser Use

```typescript
interface EventSystem {
  // Event bus with wildcard support
  on(pattern: string, handler: Function): void;    // e.g., 'agent.*'
  emit(event: string, data: any): void;

  // FlowLogger for CDP/LLM event capture
  flowLogger: {
    logCDPEvent(event: CDPEvent): void;
    logLLMEvent(event: LLMEvent): void;
    getEvents(): StoredEvent[];
  };

  // Demo mode (logs all actions for visibility)
  demoMode: boolean;
}

interface ProcessManagement {
  // Graceful shutdown (SIGINT/SIGTERM)
  onShutdown(handler: () => Promise<void>): void;

  // Supervisor process for cleanup
  supervisorPid?: number;

  // Keep-alive session management
  keepAlive: boolean;
  keepAliveInterval: number;
}
```

---

## CLI Commands

```bash
# Basic testing
inspect test -m "test login flow"                    # Test with instruction
inspect test -m "test checkout" --url https://...    # Test remote URL
inspect test -m "test forms" --devices all           # Multi-device
inspect test -f "login-flow"                         # Reuse saved flow
inspect test -m "test login" -y                      # Skip plan review, run immediately
inspect test -m "test login" --verbose               # Verbose logging
inspect test -m "test login" --headed                # Show browser window

# Git-aware testing
inspect test --target unstaged                       # Test unstaged changes
inspect test --target branch                         # Test branch diff
inspect test --target commit abc123                  # Test specific commit

# GitHub PR testing
inspect pr https://github.com/user/repo/pull/123     # Test a PR
inspect pr 123 --repo user/repo                      # Shorthand

# Visual regression
inspect visual --baseline main --branch feature/ui   # Compare branches
inspect visual --threshold 0.1                       # Set diff threshold

# Multi-agent testing
inspect test -m "test security" --agents all         # All agents
inspect test -m "test a11y" --specialist a11y        # Specialist agent
inspect test -m "test login" --agent claude          # Specific agent
inspect test -m "test login" --agent gpt             # Different agent

# Agent modes
inspect test -m "test form" --mode dom               # DOM-only mode
inspect test -m "test form" --mode hybrid            # DOM + Vision hybrid
inspect test -m "test form" --mode cua               # Computer Use Agent mode

# Workflows
inspect workflow run my-workflow.yaml                 # Run YAML workflow
inspect workflow create                               # AI-assisted workflow creation
inspect workflow observe                              # Record actions into workflow
inspect workflow schedule my-workflow --cron "0 * * *" # Schedule workflow
inspect workflow list                                 # List all workflows

# Data extraction
inspect extract --url https://... --schema schema.json # Extract structured data
inspect extract --url https://... -m "get all prices" # NL extraction

# Credentials
inspect credentials add --provider bitwarden          # Add Bitwarden
inspect credentials add --provider 1password          # Add 1Password
inspect credentials list                              # List credentials
inspect credentials test my-credential                # Test credential

# Setup & Utilities
inspect init                                          # Project setup
inspect init --template basic                         # From template
inspect install                                       # Install Chromium
inspect doctor                                        # Validate installation
inspect audit                                         # Lint/type/format audit
inspect devices                                       # List device presets
inspect agents                                        # List AI providers
inspect models                                        # List available LLM models
inspect replay <session-id>                           # Replay recorded session
inspect compare <session-1> <session-2>               # Compare sessions

# Sessions & Profiles
inspect sessions                                      # List active browser sessions
inspect sessions create --persist                     # Create persistent session
inspect sessions close <session-id>                   # Close session
inspect profile sync --browser chrome                 # Sync Chrome profile

# Tunnel (for remote access)
inspect tunnel <port>                                 # Create Cloudflare tunnel
inspect tunnel list                                   # List tunnels
inspect tunnel stop <port>                            # Stop tunnel

# API server
inspect serve                                         # Start REST API server
inspect serve --port 8080                             # Custom port

# MCP server
inspect mcp                                           # Start MCP server for Claude Desktop

# Accessibility testing (axe-core)
inspect a11y --url https://...                        # Run WCAG audit
inspect a11y --url https://... --standard wcag2aaa    # Strict standard
inspect test -m "test login" --a11y                   # A11y audit after each step
inspect a11y --sitemap sitemap.xml                    # Audit entire site

# Performance testing (Lighthouse)
inspect lighthouse --url https://...                  # Full 5-category audit
inspect lighthouse --url https://... --device mobile  # Mobile throttled
inspect lighthouse --budget budgets.json              # Assert performance budgets
inspect test -m "test checkout" --lighthouse          # With perf scoring

# Chaos testing (Gremlins.js)
inspect chaos --url https://...                       # Random monkey testing
inspect chaos --url https://... --species clicker,typer --count 500
inspect chaos --url https://... --monitor fps,errors  # With monitoring

# Security scanning
inspect security --url https://... --scan nuclei      # Nuclei vulnerability scan
inspect security --url https://... --scan zap         # ZAP DAST scan
inspect security --url https://... --templates cves   # Scan for known CVEs
inspect security --url https://... --owasp-top10      # OWASP Top 10 check

# Network mocking (MSW)
inspect test -m "test API" --mock api-mocks.har       # Mock from HAR recording
inspect test -m "test API" --mock openapi.yaml        # Mock from OpenAPI spec
inspect mock record --url https://...                 # Record HAR for mocking

# Network fault injection
inspect test -m "test checkout" --fault latency=500   # Add 500ms latency
inspect test -m "test checkout" --fault disconnect=10 # 10% random disconnects

# Visual regression (enhanced)
inspect visual --slider-report                        # Interactive HTML diff
inspect visual --mask ".timestamp,.ad-banner"         # Exclude dynamic content
inspect visual --capture-storybook http://localhost:6006 # Auto-capture components
inspect visual --viewports 375x667,768x1024,1920x1080   # Multi-viewport

# YAML test definitions (no-code)
inspect run tests/login.yaml                          # Run YAML test file
inspect run tests/                                    # Run all YAML tests
inspect generate -m "test login flow" --yaml          # AI → YAML test

# Fast browser option
inspect test -m "test login" --browser lightpanda     # 11x faster headless
inspect test -m "test login" --browser chromium       # Default Chromium
```

---

## Project Structure

```
inspect/
├── apps/
│   ├── cli/                          # CLI application (from Expect)
│   │   ├── src/
│   │   │   ├── index.tsx             # Entry point
│   │   │   ├── commands/             # Command handlers
│   │   │   │   ├── test.ts           # Main test command
│   │   │   │   ├── pr.ts             # PR testing
│   │   │   │   ├── visual.ts         # Visual regression
│   │   │   │   └── replay.ts         # Session replay
│   │   │   ├── tui/                  # Terminal UI (Ink)
│   │   │   │   ├── screens/
│   │   │   │   │   ├── MainMenu.tsx
│   │   │   │   │   ├── TestingScreen.tsx
│   │   │   │   │   ├── ResultsScreen.tsx
│   │   │   │   │   └── DevicePicker.tsx
│   │   │   │   └── components/
│   │   │   ├── hooks/                # React hooks
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── web/                          # Optional web dashboard
│       ├── src/
│       └── package.json
│
├── packages/
│   ├── core/                         # Core orchestration
│   │   ├── src/
│   │   │   ├── orchestrator/         # Test orchestration
│   │   │   │   ├── executor.ts       # Main executor
│   │   │   │   ├── scheduler.ts      # Parallel execution
│   │   │   │   └── recovery.ts       # Auto-recovery
│   │   │   ├── git/                  # Git operations (from Expect)
│   │   │   │   ├── git.ts            # Git service
│   │   │   │   ├── fingerprint.ts    # Change fingerprinting
│   │   │   │   └── context.ts        # Context building
│   │   │   ├── github/               # GitHub integration
│   │   │   │   ├── pr.ts             # PR handling
│   │   │   │   ├── comments.ts       # PR comments
│   │   │   │   └── preview.ts        # Preview deployment
│   │   │   └── devices/              # Device emulation
│   │   │       ├── presets.ts        # Device configs
│   │   │       └── pool.ts           # Device pool manager
│   │   └── package.json
│   │
│   ├── browser/                      # Browser automation
│   │   ├── src/
│   │   │   ├── playwright/           # Playwright wrapper
│   │   │   │   ├── browser.ts        # Browser launch
│   │   │   │   ├── page.ts           # Page management
│   │   │   │   └── cdp.ts            # CDP direct (from Stagehand)
│   │   │   ├── aria/                 # ARIA tree (from Expect)
│   │   │   │   ├── snapshot.ts       # Snapshot generation
│   │   │   │   ├── tree.ts           # Tree builder
│   │   │   │   └── refs.ts           # Reference mapping
│   │   │   ├── dom/                  # DOM processing (from Stagehand/Browser Use)
│   │   │   │   ├── capture.ts        # DOM capture
│   │   │   │   ├── hybrid.ts         # Hybrid DOM+AX tree
│   │   │   │   └── frames.ts         # Multi-frame support
│   │   │   ├── vision/               # Computer vision (from Skyvern)
│   │   │   │   ├── screenshot.ts     # Screenshot capture
│   │   │   │   ├── detector.ts       # Element detection
│   │   │   │   └── coordinates.ts    # Coordinate resolver
│   │   │   ├── cookies/              # Cookie extraction (from Expect)
│   │   │   │   ├── browsers.ts       # Browser configs
│   │   │   │   ├── decrypt.ts        # Decryption
│   │   │   │   └── inject.ts         # Cookie injection
│   │   │   ├── session/              # Session recording (from Expect/Browser Use)
│   │   │   │   ├── recorder.ts       # rrweb recording
│   │   │   │   ├── video.ts          # Video recording
│   │   │   │   └── har.ts            # Network capture
│   │   │   └── mcp/                  # MCP server (from Expect)
│   │   │       ├── server.ts         # MCP implementation
│   │   │       └── tools.ts          # Tool definitions
│   │   └── package.json
│   │
│   ├── agent/                        # AI agent integration
│   │   ├── src/
│   │   │   ├── providers/            # LLM providers (from Browser Use)
│   │   │   │   ├── claude.ts         # Claude/Claude Code
│   │   │   │   ├── openai.ts         # GPT/Codex
│   │   │   │   ├── gemini.ts         # Gemini
│   │   │   │   └── deepseek.ts       # DeepSeek
│   │   │   ├── acp/                  # ACP client (from Expect)
│   │   │   │   ├── client.ts         # ACP implementation
│   │   │   │   └── auth.ts           # Authentication
│   │   │   ├── prompts/              # System prompts
│   │   │   │   ├── adversarial.ts    # Adversarial testing
│   │   │   │   ├── specialists/      # Specialist prompts
│   │   │   │   │   ├── ux.ts
│   │   │   │   │   ├── security.ts
│   │   │   │   │   ├── a11y.ts
│   │   │   │   │   └── performance.ts
│   │   │   │   └── builder.ts        # Prompt builder
│   │   │   ├── memory/               # Memory (from Browser Use)
│   │   │   │   ├── short-term.ts     # Message management
│   │   │   │   ├── long-term.ts      # Persistent memory
│   │   │   │   └── compaction.ts     # Context compaction
│   │   │   ├── cache/                # Action cache (from Stagehand)
│   │   │   │   ├── store.ts          # Cache storage
│   │   │   │   └── healing.ts        # Self-healing
│   │   │   ├── watchdogs/            # Background monitors (from Browser Use)
│   │   │   │   ├── captcha.ts
│   │   │   │   ├── downloads.ts
│   │   │   │   ├── popups.ts
│   │   │   │   └── crashes.ts
│   │   │   ├── otp/                  # OTP handling (from Skyvern)
│   │   │   │   ├── totp.ts
│   │   │   │   └── email-poll.ts
│   │   │   └── loop/                 # Loop detection (from Browser Use)
│   │   │       └── detector.ts
│   │   └── package.json
│   │
│   ├── reporter/                     # Report generation
│   │   ├── src/
│   │   │   ├── formats/
│   │   │   │   ├── markdown.ts       # Markdown reports
│   │   │   │   ├── html.ts           # HTML reports
│   │   │   │   └── json.ts           # JSON output
│   │   │   ├── github/               # GitHub integration
│   │   │   │   ├── comment.ts        # PR comments
│   │   │   │   └── status.ts         # Status checks
│   │   │   └── visual/               # Visual regression
│   │   │       ├── diff.ts           # Screenshot diff
│   │   │       └── analysis.ts       # AI analysis
│   │   └── package.json
│   │
│   ├── shared/                       # Shared utilities
│   │   ├── src/
│   │   │   ├── utils/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   └── effect/               # Effect patterns (from Expect)
│   │   └── package.json
│   │
│   ├── workflow/                     # Workflow engine (from Skyvern)
│   │   ├── src/
│   │   │   ├── engine/               # Workflow execution
│   │   │   │   ├── executor.ts       # Block executor
│   │   │   │   ├── scheduler.ts      # Cron scheduling
│   │   │   │   └── context.ts        # Parameter passing
│   │   │   ├── blocks/               # Block types (15+)
│   │   │   │   ├── task.ts           # Browser task block
│   │   │   │   ├── loop.ts           # For-loop block
│   │   │   │   ├── code.ts           # Sandboxed code block
│   │   │   │   ├── extract.ts        # Data extraction block
│   │   │   │   ├── validate.ts       # Validation block
│   │   │   │   ├── http.ts           # HTTP request block
│   │   │   │   ├── email.ts          # Email sending block
│   │   │   │   ├── file-parser.ts    # File parsing block
│   │   │   │   ├── wait.ts           # Wait block
│   │   │   │   └── human.ts          # Human interaction block
│   │   │   ├── copilot/              # AI-assisted generation
│   │   │   │   ├── generator.ts      # Workflow generation
│   │   │   │   └── observer.ts       # Action recording
│   │   │   └── templates/            # Handlebars templates
│   │   └── package.json
│   │
│   ├── credentials/                  # Credential management (from Skyvern)
│   │   ├── src/
│   │   │   ├── vault.ts              # Credential CRUD
│   │   │   ├── providers/
│   │   │   │   ├── native.ts         # Encrypted local storage
│   │   │   │   ├── bitwarden.ts      # Bitwarden integration
│   │   │   │   ├── onepassword.ts    # 1Password integration
│   │   │   │   ├── azure-keyvault.ts # Azure Key Vault
│   │   │   │   └── custom-http.ts    # Custom HTTP API
│   │   │   └── otp/                  # 2FA support
│   │   │       ├── totp.ts
│   │   │       ├── email-poll.ts
│   │   │       └── sms-poll.ts
│   │   └── package.json
│   │
│   ├── data/                         # Data extraction & processing
│   │   ├── src/
│   │   │   ├── extractors/
│   │   │   │   ├── zod.ts            # Zod schema extraction (Stagehand)
│   │   │   │   ├── json-schema.ts    # JSON Schema extraction (Skyvern)
│   │   │   │   ├── markdown.ts       # HTML→Markdown (Browser Use)
│   │   │   │   └── llm.ts           # LLM-powered extraction
│   │   │   ├── parsers/
│   │   │   │   ├── csv.ts            # CSV parser
│   │   │   │   ├── excel.ts          # Excel parser
│   │   │   │   ├── pdf.ts            # PDF parser
│   │   │   │   ├── word.ts           # Word parser
│   │   │   │   └── json.ts           # JSON parser
│   │   │   └── storage/
│   │   │       ├── s3.ts             # AWS S3
│   │   │       ├── azure-blob.ts     # Azure Blob
│   │   │       └── local.ts          # Local storage
│   │   └── package.json
│   │
│   ├── api/                          # REST API server
│   │   ├── src/
│   │   │   ├── server.ts             # Express/Fastify server
│   │   │   ├── routes/
│   │   │   │   ├── tasks.ts          # Task endpoints
│   │   │   │   ├── workflows.ts      # Workflow endpoints
│   │   │   │   ├── credentials.ts    # Credential endpoints
│   │   │   │   ├── sessions.ts       # Browser session endpoints
│   │   │   │   └── system.ts         # Health/version/models
│   │   │   ├── webhooks/             # Webhook management
│   │   │   │   ├── manager.ts        # Webhook registration
│   │   │   │   └── retry.ts          # Retry logic
│   │   │   └── streaming/
│   │   │       ├── sse.ts            # Server-Sent Events
│   │   │       └── websocket.ts      # WebSocket
│   │   └── package.json
│   │
│   ├── network/                      # Networking & proxy
│   │   ├── src/
│   │   │   ├── proxy/
│   │   │   │   ├── manager.ts        # Proxy pool & rotation
│   │   │   │   └── socks5.ts         # SOCKS5 support
│   │   │   ├── security/
│   │   │   │   ├── domains.ts        # Allowed/blocked hosts
│   │   │   │   └── masking.ts        # Sensitive data masking
│   │   │   └── tunnel/
│   │   │       └── cloudflare.ts     # Cloudflare tunneling
│   │   └── package.json
│   │
│   ├── observability/                # Analytics & monitoring
│   │   ├── src/
│   │   │   ├── analytics.ts          # Event tracking (PostHog)
│   │   │   ├── tracing.ts            # OpenTelemetry integration
│   │   │   ├── metrics.ts            # Token/execution metrics
│   │   │   ├── performance.ts        # Web Vitals (FCP/LCP/CLS/INP)
│   │   │   └── logging.ts            # Structured logging (Pino)
│   │   └── package.json
│   │
│   └── sdk/                          # Public SDK
│       ├── src/
│       │   ├── typescript/           # TypeScript SDK
│       │   │   ├── index.ts          # Main Inspect class
│       │   │   ├── act.ts            # act() method
│       │   │   ├── extract.ts        # extract() method
│       │   │   ├── observe.ts        # observe() method
│       │   │   └── agent.ts          # agent() method
│       │   └── python/               # Python SDK bindings
│       │       ├── inspect_sdk/
│       │       └── pyproject.toml
│       └── package.json
│
├── evals/                            # Evaluation & benchmarks
│   ├── benchmarks/
│   │   ├── gaia.ts                   # GAIA benchmark
│   │   ├── mind2web.ts               # Mind2Web
│   │   ├── webvoyager.ts             # WebVoyager
│   │   ├── webtailbench.ts           # WebTailBench
│   │   ├── webbench.ts              # WebBench
│   │   └── browsergym.ts            # BrowserGym (WorkArena)
│   ├── tasks/                        # Custom eval tasks
│   └── runner.ts                     # Evaluation runner
│
├── packages/
│   ├── quality/                      # Quality testing suite
│   │   ├── src/
│   │   │   ├── a11y/                 # Accessibility (axe-core)
│   │   │   │   ├── auditor.ts        # WCAG audit runner
│   │   │   │   ├── rules.ts          # 90+ a11y rules config
│   │   │   │   └── sitemap.ts        # Sitemap-wide scanning
│   │   │   ├── lighthouse/           # Performance (Lighthouse)
│   │   │   │   ├── auditor.ts        # 5-category audit
│   │   │   │   ├── budgets.ts        # Performance budgets
│   │   │   │   └── history.ts        # Score tracking
│   │   │   ├── chaos/                # Chaos testing (Gremlins.js)
│   │   │   │   ├── gremlins.ts       # Random UI interactions
│   │   │   │   ├── species.ts        # Clicker, typer, scroller, etc.
│   │   │   │   └── monitors.ts       # FPS, errors, alerts
│   │   │   ├── security/             # Security scanning
│   │   │   │   ├── nuclei.ts         # Nuclei template scanner
│   │   │   │   ├── zap.ts            # ZAP DAST scanner
│   │   │   │   └── proxy.ts          # Intercepting proxy
│   │   │   ├── mocking/              # API mocking (MSW)
│   │   │   │   ├── interceptor.ts    # Network interception
│   │   │   │   ├── handlers.ts       # REST/GraphQL handlers
│   │   │   │   ├── generators.ts     # HAR/OpenAPI → mocks
│   │   │   │   └── faker.ts          # Dynamic mock data
│   │   │   └── resilience/           # Network faults (Toxiproxy)
│   │   │       ├── faults.ts         # Fault injection
│   │   │       └── toxics.ts         # Latency, drops, bandwidth
│   │   └── package.json
│   │
│   └── visual/                       # Enhanced visual regression
│       ├── src/
│       │   ├── diff.ts               # Pixel diff engine (pixelmatch)
│       │   ├── slider-report.ts      # Interactive HTML slider
│       │   ├── masking.ts            # Element/region masking
│       │   ├── storybook.ts          # Storybook auto-capture
│       │   ├── viewports.ts          # Multi-viewport capture
│       │   └── approval.ts           # Approve/reject workflow
│       └── package.json
│
├── skill/                            # AI agent skill
│   └── SKILL.md                      # Agent instructions
│
├── yaml/                             # YAML test definitions
│   ├── parser.ts                     # YAML test parser
│   ├── runner.ts                     # YAML test executor
│   └── generator.ts                  # NL → YAML generation
│
├── docker/                           # Docker support
│   ├── Dockerfile
│   └── Dockerfile.fast
│
├── package.json                      # Root package
├── pnpm-workspace.yaml               # Workspace config
├── turbo.json                        # Turborepo config
├── tsconfig.json                     # TypeScript config
├── vite.config.ts                    # Vite config
└── README.md
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2) ✅ COMPLETE

**Goal**: Basic browser testing with single agent

| Task | Source | Files to Study |
|------|--------|----------------|
| Project setup (pnpm + Turbo) | Expect | `package.json`, `turbo.json` |
| CLI with Ink | Expect | `apps/cli/src/` |
| Playwright wrapper | All | `browser/playwright/` |
| ARIA snapshot system | Expect | `packages/browser/src/mcp/server.ts` |
| Hybrid DOM tree | Stagehand | `packages/core/lib/v3/understudy/a11y/` |
| Basic test execution | Expect | `packages/supervisor/src/executor.ts` |

**Deliverables**:
```bash
inspect test -m "test login"  # Works!
```

---

### Phase 2: Agent Integration (Week 3) ✅ COMPLETE

**Goal**: Multi-model support with caching

| Task | Source | Files to Study |
|------|--------|----------------|
| ACP client | Expect | `packages/agent/src/acp-client.ts` |
| Multi-provider support | Browser Use | `browser_use/llm/` |
| MCP server | Expect | `packages/browser/src/mcp/` |
| Action caching | Stagehand | `packages/core/lib/v3/cache/` |
| Self-healing selectors | Skyvern + Stagehand | `webeye/actions/`, `actHandler.ts` |

**Deliverables**:
```bash
inspect test -m "test login" --agent claude   # Works
inspect test -m "test login" --agent gpt      # Works
# Caching works, replay is faster
```

---

### Phase 3: Git Integration (Week 4) ✅ COMPLETE

**Goal**: Git-aware testing

| Task | Source | Files to Study |
|------|--------|----------------|
| Git change detection | Expect | `packages/supervisor/src/git/` |
| Context building | Expect | `packages/supervisor/src/executor.ts` |
| Adversarial prompts | Expect | `packages/shared/src/prompts.ts` |

**Deliverables**:
```bash
inspect test --target unstaged
inspect test --target branch
```

---

### Phase 4: Advanced Execution (Week 5) ✅ COMPLETE

**Goal**: Robust execution with recovery

| Task | Source | Files to Study |
|------|--------|----------------|
| Auto-recovery | Skyvern | `forge/agent.py` |
| Loop detection | Browser Use | `browser_use/agent/service.py` |
| OTP handling | Skyvern | `webeye/actions/handler.py` |
| Watchdogs | Browser Use | `browser_use/browser/` |

**Deliverables**:
```bash
# Handles complex flows, OTP, captchas
inspect test -m "test login with 2FA"
```

---

### Phase 5: GitHub Integration (Week 6) ✅ COMPLETE

**Goal**: PR testing and reporting

| Task | Source | New Implementation |
|------|--------|-------------------|
| GitHub API | - | Octokit |
| PR comments | - | GitHub API |
| Preview deployment | - | Vercel/Netlify API |

**Deliverables**:
```bash
inspect pr https://github.com/user/repo/pull/123
# Posts comment with results
```

---

### Phase 6: Multi-Device (Week 7) ✅ COMPLETE

**Goal**: Device emulation and responsive testing

| Task | Source | Files to Study |
|------|--------|----------------|
| Device presets | Playwright | Device descriptors |
| Parallel execution | - | Device pool |
| Cross-device comparison | - | New |

**Deliverables**:
```bash
inspect test -m "test login" --devices iphone,android,desktop
```

---

### Phase 7: Visual Regression (Week 8) ✅ COMPLETE

**Goal**: Screenshot comparison

| Task | Source | Files to Study |
|------|--------|----------------|
| Screenshot capture | All | Browser implementations |
| Pixel diff | - | pixelmatch |
| AI analysis | Skyvern | Vision approach |

**Deliverables**:
```bash
inspect visual --baseline main --branch feature/ui
```

---

### Phase 8: Multi-Agent & Specialists (Week 9) ✅ COMPLETE

**Goal**: Parallel agent execution

| Task | Source | Files to Study |
|------|--------|----------------|
| Agent router | Browser Use | `browser_use/agent/service.py` |
| Specialists | - | New prompts |
| Consensus | - | New |

**Deliverables**:
```bash
inspect test -m "test checkout" --agents all
inspect test -m "test security" --specialist security
```

---

### Phase 9: Workflow Engine & Task System (Week 10) ✅ COMPLETE

**Goal**: YAML workflow execution with scheduling

| Task | Source | Files to Study |
|------|--------|----------------|
| Workflow YAML parser | Skyvern | `forge/sdk/workflow/` |
| Block executor (15+ types) | Skyvern | `forge/sdk/workflow/blocks/` |
| Cron scheduling | Skyvern | `forge/sdk/workflow/scheduler.py` |
| Workflow Copilot | Skyvern | AI-assisted generation |
| Observer mode | Skyvern | Action recording |
| Context parameters + templating | Skyvern | `forge/sdk/workflow/context.py` |
| Task CRUD + status tracking | Skyvern | `forge/sdk/routes/` |
| Flow save/reuse system | Expect | `packages/shared/src/flows/` |

**Deliverables**:
```bash
inspect workflow run checkout-flow.yaml
inspect workflow create                    # AI-assisted
inspect workflow observe                   # Record into workflow
inspect workflow schedule my-flow --cron "0 9 * * *"
```

---

### Phase 10: Credential Management & Security (Week 11) ✅ COMPLETE

**Goal**: Vault integrations and security features

| Task | Source | Files to Study |
|------|--------|----------------|
| Credential vault (CRUD) | Skyvern | `forge/sdk/routes/credentials.py` |
| Bitwarden integration | Skyvern | `forge/credential/bitwarden.py` |
| 1Password integration | Skyvern | `forge/credential/onepassword.py` |
| Azure Key Vault | Skyvern | `forge/credential/azure.py` |
| Sensitive data masking | Skyvern + Browser Use | Masking in logs/screenshots |
| Domain security (allow/block) | Skyvern + Browser Use | Domain restrictions |
| Proxy pool + SOCKS5 | Skyvern + Browser Use | Proxy management |

**Deliverables**:
```bash
inspect credentials add --provider bitwarden
inspect credentials test my-credential
inspect test -m "test login" --credential my-credential
```

---

### Phase 11: Data Extraction & File Processing (Week 12) ✅ COMPLETE

**Goal**: Structured extraction with schema validation

| Task | Source | Files to Study |
|------|--------|----------------|
| Zod schema extraction | Stagehand | `lib/v3/handlers/extract.ts` |
| JSON Schema extraction | Skyvern | `forge/sdk/schemas/` |
| Markdown extraction (HTML→MD) | Browser Use | `browser_use/dom/` |
| File parsers (CSV/Excel/PDF/Word) | Skyvern | `forge/sdk/workflow/blocks/file_parser.py` |
| Cloud storage (S3/Azure Blob) | Skyvern | `forge/sdk/artifact/` |
| Download management | All | File handling |

**Deliverables**:
```bash
inspect extract --url https://... --schema schema.json
inspect extract --url https://... -m "get all product prices"
```

---

### Phase 12: REST API & Webhooks (Week 13) ✅ COMPLETE

**Goal**: Full API server for programmatic access

| Task | Source | Files to Study |
|------|--------|----------------|
| API server (Fastify) | Skyvern | `forge/sdk/routes/` |
| Task/workflow/credential endpoints | Skyvern | Route handlers |
| SSE + WebSocket streaming | Skyvern + Expect | Event streaming |
| Webhook manager + retries | Skyvern | Webhook handlers |
| MCP server for Claude Desktop | All | MCP implementations |
| Authentication (JWT) | Skyvern | Auth middleware |

**Deliverables**:
```bash
inspect serve --port 8080
inspect mcp  # Claude Desktop integration
curl -X POST localhost:8080/api/tasks -d '{"prompt": "test login"}'
```

---

### Phase 13: SDK & Integrations (Week 14) ✅ COMPLETE

**Goal**: Public SDK + third-party integrations

| Task | Source | Files to Study |
|------|--------|----------------|
| TypeScript SDK (@inspect/sdk) | Stagehand | Core API |
| Python SDK (inspect_sdk) | Skyvern + Browser Use | Python bindings |
| LangChain/LlamaIndex integration | All | Framework adapters |
| Vercel AI SDK integration | Stagehand | AISDK provider |
| Zapier/Make/N8N connectors | Skyvern | Webhook integrations |
| Gmail/AgentMail integration | Browser Use | Email integrations |

**Deliverables**:
```typescript
import { Inspect } from '@inspect/sdk';
const result = await inspect.act('Click the login button');
```

---

### Phase 14: Observability & Evaluation (Week 15) ✅ COMPLETE

**Goal**: Full monitoring + benchmark suite

| Task | Source | Files to Study |
|------|--------|----------------|
| PostHog analytics | Expect | Event tracking |
| OpenTelemetry tracing | Skyvern | OTEL integration |
| Web Vitals (FCP/LCP/CLS/INP) | Expect | Performance metrics |
| Token/cost tracking | Stagehand + Browser Use | Per-function metrics |
| Benchmark suite (GAIA, Mind2Web, etc.) | Stagehand + Skyvern | Eval frameworks |
| Structured logging (Pino) | Stagehand | Logger setup |

**Deliverables**:
```bash
inspect eval --benchmark webbench
inspect eval --benchmark mind2web --model claude
inspect metrics                            # Show token usage/costs
```

---

### Phase 15: Cloud, Docker & Deployment (Week 16) ✅ COMPLETE

**Goal**: Production deployment options

| Task | Source | Files to Study |
|------|--------|----------------|
| Docker + Dockerfile | Skyvern + Browser Use | Container configs |
| PostgreSQL persistence | Skyvern | Database setup |
| Redis caching | Skyvern | Cache layer |
| Browserbase integration | Stagehand | Cloud browser hosting |
| Browser Use Cloud | Browser Use | Cloud provisioning |
| Multi-tenancy (organizations) | Skyvern | Org isolation |
| Cloudflare tunneling | Browser Use | Tunnel management |
| SEA builds | Stagehand | Single executable |

**Deliverables**:
```bash
docker run -d inspect-server
inspect tunnel 3000
inspect serve --org my-org
```

---

### Phase 16: Quality Testing Suite (Week 17-18) ✅ COMPLETE

**Goal**: Accessibility, performance, chaos, and security testing

| Task | Source | Integration |
|------|--------|-------------|
| axe-core a11y audit (90+ rules, WCAG 2.2) | axe-core | Inject into page, run after steps |
| Lighthouse performance/SEO/PWA scoring | Lighthouse | Node API, 5 category audit |
| Performance budgets & CI assertions | Lighthouse CI | Budget config, pass/fail |
| Gremlins.js chaos testing (5 species) | Gremlins.js | Random UI interactions + monitors |
| Network fault injection | Toxiproxy patterns | Latency, drops, bandwidth limits |
| MSW network mocking (REST + GraphQL) | MSW | Deterministic tests, HAR→mocks |
| Nuclei vulnerability scanning (12k+ templates) | Nuclei | YAML template runner |
| ZAP DAST scanning (OWASP Top 10) | ZAP | Proxy mode with Playwright |

**Deliverables**:
```bash
inspect test -m "test login" --a11y                  # With accessibility audit
inspect test -m "test checkout" --lighthouse          # With performance scoring
inspect chaos --url https://...                       # Monkey testing
inspect security --url https://... --scan nuclei      # Vulnerability scan
inspect test -m "test API" --mock api-mocks.har       # With API mocking
```

---

### Phase 17: Visual Regression & YAML Tests (Week 19) ✅ COMPLETE

**Goal**: Advanced visual testing + no-code test definitions

| Task | Source | Integration |
|------|--------|-------------|
| BackstopJS pixel-diff with slider reports | BackstopJS | Screenshot comparison |
| Element masking for dynamic content | Lost Pixel | Exclude timestamps, ads |
| Multi-viewport responsive breakpoint capture | BackstopJS | Device presets integration |
| Storybook auto-capture | Lost Pixel | Component visual testing |
| YAML test definitions (no-code) | Maestro | Parse & execute YAML files |
| AI → YAML generation | New | NL instruction → YAML |
| Lightpanda fast browser option | Lightpanda | 11x faster headless |
| Firecrawl page→markdown conversion | Firecrawl | LLM context preparation |

**Deliverables**:
```bash
inspect visual --slider-report                       # Interactive HTML diff
inspect visual --capture-storybook http://...        # Auto-capture components
inspect run tests/login.yaml                         # Run YAML test
inspect test -m "test login" --browser lightpanda    # Fast browser
```

---

### Phase 18: Polish & Documentation (Week 20) ✅ COMPLETE

**Goal**: Production-ready

- [ ] Error messages & recovery
- [ ] Documentation site
- [ ] Examples & templates
- [ ] NPM package
- [ ] Python PyPI package
- [ ] GitHub Action
- [ ] Docker Hub image
- [ ] Telemetry opt-out
- [ ] Init templates (`inspect init --template basic`)
- [ ] Doctor command (`inspect doctor`)
- [ ] Changesets versioning

---

## Tech Stack

### Core
| Component | Technology | Source |
|-----------|------------|--------|
| Language | TypeScript | All except Skyvern/Browser Use |
| Runtime | Node.js 22 | All |
| Package Manager | pnpm | Expect, Stagehand |
| Build | Turborepo | Expect, Stagehand |
| Bundler | Vite | Expect |
| Framework | Effect | Expect |
| Versioning | Changesets | Expect |
| Python SDK | Python 3.11+ | Skyvern, Browser Use |

### Browser
| Component | Technology | Source |
|-----------|------------|--------|
| Automation | Playwright + Patchright | All + Stagehand |
| Protocol | CDP | Stagehand, Browser Use |
| Recording | rrweb + Video + GIF | Expect, Skyvern, Browser Use |
| Vision | GPT-4V / Gemini Vision | Skyvern, Browser Use |
| HAR Capture | HTTP Archive format | Skyvern, Browser Use |
| Stealth | Anti-detection flags | Skyvern, Stagehand, Browser Use |

### AI
| Component | Technology | Source |
|-----------|------------|--------|
| Protocol | ACP | Expect |
| Server | MCP | Expect, Skyvern, Stagehand, Browser Use |
| Providers | Claude, GPT, Gemini, DeepSeek, Groq, Cerebras, Bedrock, Vertex AI, Mistral, Ollama, OpenRouter, Azure | All |
| CUA | Anthropic Computer Use, Google, MS FARA, OpenAI | Stagehand |
| Frameworks | LangChain, LlamaIndex, Vercel AI SDK | All |

### UI
| Component | Technology | Source |
|-----------|------------|--------|
| CLI | Ink + React | Expect |
| State | Zustand | Expect |
| Logging | Pino (structured) | Stagehand |

### Backend (API Server)
| Component | Technology | Source |
|-----------|------------|--------|
| API | Fastify / Express | Skyvern |
| Database | PostgreSQL + Drizzle/Prisma | Skyvern |
| Cache | Redis | Skyvern |
| Streaming | SSE + WebSocket | Skyvern, Expect |
| Auth | JWT | Skyvern |

### Quality Testing
| Component | Technology | Source |
|-----------|------------|--------|
| Accessibility | axe-core (90+ WCAG rules) | axe-core |
| Performance | Lighthouse (5 categories) | Lighthouse |
| Chaos Testing | Gremlins.js (5 species) | Gremlins.js |
| API Mocking | MSW (network-level) | MSW |
| Security | Nuclei (12k+ templates) + ZAP (DAST) | Nuclei, ZAP |
| Resilience | Toxiproxy patterns (fault injection) | Toxiproxy |
| Visual Regression | pixelmatch + BackstopJS slider reports | BackstopJS, Lost Pixel |

### Integrations
| Component | Technology | Source |
|-----------|------------|--------|
| Credentials | Bitwarden, 1Password, Azure Key Vault | Skyvern |
| Automation | Zapier, Make, N8N | Skyvern |
| Email | SMTP, AgentMail, Gmail | Skyvern, Browser Use |
| Storage | S3, Azure Blob | Skyvern |
| Tunneling | Cloudflare | Browser Use |
| Observability | PostHog, OpenTelemetry | Expect, Skyvern |
| Web Crawling | Firecrawl (page→markdown) | Firecrawl |
| Fast Browser | Lightpanda (11x faster headless) | Lightpanda |

### Deployment
| Component | Technology | Source |
|-----------|------------|--------|
| Containers | Docker + Dockerfile | Skyvern, Browser Use |
| Cloud Browsers | Browserbase, Browser Use Cloud | Stagehand, Browser Use |
| SEA | Single Executable Application | Stagehand |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Test execution time | < 30s for simple flow |
| Cache hit rate | > 80% for repeated tests |
| Device coverage | 15+ presets |
| Agent support | 15+ LLM providers |
| GitHub integration | PR comments, status checks |
| Visual diff accuracy | 95%+ |
| Recovery success rate | > 90% |
| WebBench score | > 65% |
| Workflow block types | 15+ |
| Watchdog monitors | 14+ |
| API endpoints | Full CRUD coverage |
| Credential providers | 5+ (native, Bitwarden, 1Password, Azure, custom) |
| A11y rules | 90+ (axe-core WCAG 2.2) |
| Security templates | 12,000+ (Nuclei) |
| Lighthouse categories | 5 (Performance, A11y, Best Practices, SEO, PWA) |
| Chaos test species | 5 (clicker, formFiller, scroller, typer, toucher) |
| Total OSS projects referenced | 16 |

---

## Key Files to Reference

### From Expect
| Feature | File |
|---------|------|
| ARIA snapshot | `packages/browser/src/mcp/server.ts` |
| Git detection | `packages/supervisor/src/git/git.ts` |
| Executor | `packages/supervisor/src/executor.ts` |
| ACP client | `packages/agent/src/acp-client.ts` |
| CLI with Ink | `apps/cli/src/index.tsx` |
| Cookie extraction | `packages/cookies/src/browser-config.ts` |
| Prompts | `packages/shared/src/prompts.ts` |

### From Skyvern
| Feature | File |
|---------|------|
| Element tree | `skyvern/webeye/scraper/scraped_page.py` |
| Vision | `skyvern/webeye/` |
| Actions | `skyvern/webeye/actions/handler.py` |
| Recovery | `skyvern/forge/agent.py` |
| OTP | `skyvern/webeye/actions/handler.py` |

### From Stagehand
| Feature | File |
|---------|------|
| Hybrid tree | `packages/core/lib/v3/understudy/a11y/` |
| Caching | `packages/core/lib/v3/cache/` |
| Handlers | `packages/core/lib/v3/handlers/` |
| Multi-frame | `packages/core/lib/v3/understudy/` |

### From Browser Use
| Feature | File |
|---------|------|
| Agent loop | `browser_use/agent/service.py` |
| Memory | `browser_use/agent/message_manager/` |
| Watchdogs | `browser_use/browser/` |
| Loop detection | `browser_use/agent/service.py` |
| DOM capture | `browser_use/dom/service.py` |

---

## Next Steps

1. **Initialize project**: `pnpm init`, setup Turborepo
2. **Study key files**: Read the referenced files above
3. **Build CLI skeleton**: Commander + Ink setup
4. **Implement browser layer**: Playwright + ARIA snapshot
5. **Build ACP client**: Agent communication
6. **Create first test flow**: End-to-end MVP

---

## Open Questions

- [ ] Pricing: Open source + cloud offering?
- [ ] Primary language: TypeScript only or Python bindings?
- [ ] Mobile testing: Emulation or real devices?
- [ ] Vision provider: GPT-4V, Gemini Vision, or both?
- [ ] GitHub: GitHub App or Personal Access Token?
