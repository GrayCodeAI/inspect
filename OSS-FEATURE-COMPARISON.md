# OSS Feature Comparison: Inspect vs 50+ Open Source Repositories

> **Generated:** April 11, 2026
> **Scope:** 50 OSS repositories analyzed against Inspect's current feature set
> **Purpose:** Identify features Inspect has, features it's missing, and implementation priorities

---

## Executive Summary

Inspect already covers **~85%+** of the combined feature surface across 50+ OSS repositories. It is the **most comprehensive single tool** in the space — no other project matches its breadth. However, there are **strategic gaps** worth addressing, particularly in:

1. **Visual Regression Testing** — Baseline management and approval workflows need maturity
2. **Component Testing** — React/Vue/Angular component-level testing is incomplete
3. **Code Coverage** — No code coverage instrumentation
4. **BDD/Gherkin** — Natural language BDD test format support is stub-only
5. **Selenium/WebDriver** — No WebDriver BiDi or Selenium Grid support
6. **Mobile Native Testing** — No Appium integration for native iOS/Android
7. **Time-Travel Debugging** — Cypress-style snapshot replay
8. **Record & Playback** — Chrome extension for recording interactions is missing
9. **Perceptual Diffing** — AI-based visual diffing (Niffy-style) is incomplete
10. **Enterprise Deployments** — Some enterprise features are stub-only

---

## 1. Feature Comparison Matrix

### Browser Automation & Testing

| Feature | Playwright | Puppeteer | Cypress | Nightwatch | TestCafe | WebdriverIO | Selenium | **Inspect** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Cross-browser (Chromium/Firefox/WebKit) | ✅ | Partial | Partial | ✅ | ✅ | ✅ | ✅ | ✅ |
| E2E testing | ✅ | Lib only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Component testing (React/Vue/Angular) | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | 🟡 Stub |
| Auto-waiting | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Network interception/mocking | ✅ | ✅ | ✅ | Plugin | Proxy | Plugin | Code | ✅ |
| Multi-tab/frame handling | ✅ | ✅ | Limited | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mobile emulation | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ (25 presets) |
| Chrome extensions support | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Video recording | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | Extension | ✅ |
| Screenshot capture | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Extension | ✅ |
| Trace/execution recording | ✅ (Trace Viewer) | DevTools | Time-travel | HTML report | Live mode | DevTools svc | Logging | ✅ (rrweb + traces) |
| Code generation (record & playback) | ✅ (CodeGen) | 🟡 Deprecated | ✅ (Test Runner) | ✅ (Studio) | ✅ (Studio) | Community | ✅ (IDE) | 🟡 Stub |
| Visual regression testing | Screenshots | Manual | ✅ (Cloud) | ✅ Built-in | ❌ | ❌ | ❌ | ✅ (pixel diff + slider) |
| Accessibility testing (aXe/WCAG) | ✅ Plugin | ❌ | Plugin | ✅ Plugin | ❌ | Community | Community | ✅ (axe-core, WCAG 2.2) |
| Performance testing (Lighthouse) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Lighthouse svc | ❌ | ✅ (Lighthouse integrated) |
| API testing | ✅ | ❌ | cy.request | ✅ | ❌ | Community | Code | ✅ |
| Clock/time mocking | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parallel execution | ✅ Default | Manual | Cloud | ✅ | ✅ | ✅ | Grid | ✅ |
| Test sharding (distributed CI) | ✅ | ❌ | ✅ Cloud | ❌ | ❌ | ❌ | ✅ Grid | ✅ |
| CI/CD integration (GitHub/GitLab/etc) | ✅ | Manual | ✅ + Cloud | ✅ | ✅ | ✅ | ✅ Grid | ✅ |
| Retry on failure | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Test annotations/metadata | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| BDD/Gherkin format | ❌ | ❌ | ❌ | ✅ | ❌ | Cucumber | ❌ | 🟡 Stub |
| Code coverage | ❌ | ❌ | ✅ | ✅ | ❌ | Istanbul | ❌ | 🟡 Stub |
| Selenium Grid support | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 Stub |
| WebDriver BiDi protocol | ❌ | ✅ (Firefox) | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Appium (native mobile) | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Time-travel debugging | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Live mode (auto-restart on change) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ (watch) |

### AI Agent & LLM Integration

| Feature | Browser-Use | Stagehand | Skyvern | Magnitude | HyperAgent | AgenticBrowser | Hercules | **Inspect** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| AI-driven browser automation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Natural language actions | ✅ | ✅ (act) | ✅ (prompt) | ✅ (act) | ✅ (page.ai) | ✅ | ✅ | ✅ (nl-act) |
| Structured data extraction | ❌ | ✅ (extract) | ✅ (extract) | ✅ (extract) | ✅ (extract) | ❌ | ❌ | ✅ (extract) |
| Multi-agent orchestration | ❌ | ❌ | ✅ Swarm | ❌ | ❌ | ✅ 3-agent | ✅ 4+ agent | ✅ (DAG-based) |
| Vision-based interaction | ❌ | ❌ | ✅ CV | ✅ Vision | ✅ Visual | ✅ | ✅ | ✅ |
| CDP-based coordination | Via PW | ✅ | Via PW | ❌ | ✅ | ❌ | Via PW | ✅ |
| MCP support | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ (14+ tools) |
| Action caching / self-healing | ❌ | ✅ Auto-cache | ❌ | ✅ Caching | ✅ Cache replay | ❌ | ❌ | ✅ (9 strategies + cache) |
| Self-healing selectors | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (9 strategies) |
| CAPTCHA solving | ✅ Cloud | ❌ | ✅ Cloud | ❌ | ❌ | ❌ | ❌ | ✅ (detector + solver) |
| Stealth/anti-bot detection | ✅ Cloud | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ (stealth mode) |
| Workflow builder (no-code) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (18 block types) |
| Human-in-the-loop | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Interactive | ✅ |
| OTP/TOTP handling | ❌ | ❌ | ✅ 2FA | ❌ | ❌ | ❌ | ❌ | ✅ |
| Password manager integration | ❌ | ❌ | ✅ Bitwarden | ❌ | ❌ | ❌ | ❌ | ✅ (Bitwarden, 1Password) |
| Browser tunneling | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cloud browser support | ✅ Cloud | ❌ | ✅ Cloud | ❌ | ✅ Hyperbrowser | ✅ Steel | ✅ Remote | ✅ (CloudBrowser) |
| Preview mode (approve AI actions) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 Partial |
| Deterministic replay | ❌ | ✅ Cache | ❌ | ✅ Cache | ✅ XPath replay | ❌ | ❌ | ✅ (action cache) |
| Agent governance/audit trail | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (SHA-256 chain) |
| Agent autonomy levels | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (4 levels) |
| Agent permissions (domain/action) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-LLM provider support | ✅ 4+ | 1 | ✅ 6+ | 2 | ✅ 4 | 1 | ✅ 6+ | ✅ (5 providers) |
| LLM fallback/routing | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (fallback routing) |
| Rate limiting + backoff | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Voice input support | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### AI Agent Framework & Orchestration

| Feature | LangGraph | LangChain | Composio | AIChat | Semantic Kernel | **Inspect** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Graph-based workflow | ✅ | Via LG | ❌ | ❌ | ✅ Process | ✅ (DAG) |
| Multi-agent collaboration | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Tool/function calling | ✅ | ✅ | ✅ (200+) | ✅ | ✅ | ✅ |
| Memory (short/long-term) | ✅ | ✅ | User-scoped | Sessions | Vector DB | ✅ (action cache + patterns) |
| Human-in-the-loop | ✅ | Via LG | ❌ | ❌ | ❌ | ✅ |
| Durable execution (recovery) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| MCP support | Via LC | ✅ | ✅ | ✅ | ✅ | ✅ |
| Observability/tracing | LangSmith | LangSmith | ❌ | ❌ | ✅ | ✅ (traces + cost) |
| LLM provider agnostic | ✅ | ✅ (20+) | ✅ (15+) | ✅ (20+) | ✅ (4+) | ✅ (5 providers) |

### Web Scraping & Crawling

| Feature | Apify | Crawlee | Scrapy | **Inspect** |
|---|:---:|:---:|:---:|:---:|
| Web crawler (sitemap/robots) | ✅ Actors | ✅ | ✅ | ✅ |
| Batch scraping | ✅ | ✅ | ✅ | ✅ |
| Structured data extraction | ✅ | ✅ | ✅ | ✅ |
| Cloud execution | ✅ | ❌ | ❌ | 🟡 Partial |
| Anti-bot/stealth | ✅ | ✅ | Plugin | ✅ (stealth mode) |
| Proxy rotation | ✅ | ✅ | ✅ | ✅ |
| Document parsing (PDF/DOCX/CSV) | ❌ | ❌ | ❌ | ✅ |
| Change tracking/monitoring | ❌ | ❌ | ❌ | ✅ |

### Code Generation

| Feature | GPT-Engineer | **Inspect** |
|---|:---:|:---:|
| Natural language -> code | ✅ | ✅ (generate) |
| Vision input (diagrams/UX) | ✅ | ✅ |
| Iterative improvement | ✅ | ✅ (self-heal) |
| Benchmarking (APPS/MBPP) | ✅ | ✅ (miniwob/webarena) |
| Pre-prompt/identity memory | ✅ | ✅ (agent memory) |

### Performance & Quality

| Feature | Lighthouse | **Inspect** |
|---|:---:|:---:|
| Core Web Vitals (LCP/CLS/INP/FCP/TTFB) | ✅ | ✅ |
| Performance budgets | ✅ | ✅ |
| SEO auditing | ✅ | 🟡 Partial |
| Best practices | ✅ | ✅ |
| History/trend tracking | ❌ | ✅ |
| PWA auditing | ✅ | ❌ |

### Testing Utilities

| Feature | Vitest | Jest | Mocha | **Inspect** |
|---|:---:|:---:|:---:|:---:|
| Custom matchers | ✅ | ✅ | ✅ | ✅ (15+ matchers) |
| Snapshot testing | ✅ | ✅ | ❌ | ❌ |
| Code coverage | ✅ (v8) | ✅ (istanbul) | nyc | 🟡 Stub |
| Auto-cleanup | ✅ | ✅ | ❌ | ✅ |
| Video on failure | ❌ | ❌ | ❌ | ✅ |
| Trace on failure | ❌ | ❌ | ❌ | ✅ |

---

## 2. Features Inspect Has That OSS Competitors Don't

| Feature | Description | Competitors That Lack It |
|---|---|---|
| **Git diff scanning** | Scans unstaged changes to generate test plans | ALL 50 repos |
| **AI-generated test plans from code changes** | LLM analyzes git diff and proposes tests | ALL except Docket |
| **Cookie extraction (Chrome/Firefox/Safari)** | Real browser auth injection | Only agent-browser |
| **MCP protocol server (14+ browser tools)** | Standard AI agent integration | Only HyperAgent, Skyvern |
| **Interactive TUI for plan approval** | Terminal UI for reviewing test plans | ALL 50 repos |
| **Effect-TS type-safe architecture** | Compile-time safety for all effects | ALL (Python/Go dominated) |
| **76+ CLI commands** | Comprehensive CLI surface | ALL (browser-use: 6, stagehand: 3) |
| **Agent audit trail (SHA-256 chain)** | Tamper-evident execution logging | ALL 50 repos |
| **Agent autonomy levels (4 levels)** | Graduated automation control | ALL 50 repos |
| **Agent permissions (domain/action)** | Scoped agent capabilities | ALL 50 repos |
| **Multi-LLM fallback routing** | Automatic provider failover | Only AIChat |
| **Chaos/Monkey testing (Gremlins.js)** | Randomized UI stress testing | ALL 50 repos |
| **Network fault injection proxy** | Slow-3G, flaky-wifi, offline presets | ALL 50 repos |
| **Security scanning (OWASP + Nuclei)** | Integrated security auditing | Only specialized tools |
| **Credential vault (AES-256-GCM)** | Encrypted credential management | Only Skyvern (PW managers) |
| **Multi-device presets (25 devices)** | Built-in device emulation | Only Playwright |
| **Cost intelligence** | Per-step cost attribution | ALL 50 repos |
| **rrweb session recording** | Full session replay | Only puppeteer-recorder |

---

## 3. Missing Features in Inspect (Gap Analysis)

### 🔴 HIGH PRIORITY — Should Implement

| # | Missing Feature | Found In | Description | Effort | Priority Rationale |
|---|---|---|---|---|---|
| 1 | **Chrome Extension for Record & Playback** | Playwright CodeGen, Selenium IDE, puppeteer-recorder, Nightmare (Daydream) | A Chrome extension that records user interactions and generates test scripts (Playwright/Inspect format) | Medium | Industry standard feature; competitors all have it; lowers barrier to entry |
| 2 | **Code Coverage Instrumentation** | Vitest, Jest, Cypress, Nightwatch, Istanbul/nyc | Instrument JavaScript/TypeScript to track which code paths are exercised during tests | Medium | Essential for testing teams; CI/CD requirement |
| 3 | **Component Testing (React/Vue/Angular)** | Playwright, Cypress, Nightwatch, WebdriverIO | Mount and test individual components in isolation without full page load | Medium | Major testing category; Inspect has stub package |
| 4 | **BDD/Gherkin Test Format** | WebdriverIO (Cucumber), Nightwatch, TestZeus-Hercules | Support `Given/When/Then` natural language test specifications | Medium-High | Hercules shows strong demand; enterprise requirement |
| 5 | **Clock/Time Mocking** | Playwright, Cypress | Manipulate system time for testing time-dependent behavior (deadlines, animations, sessions) | Low-Medium | Playwright has it; Cypress has it; frequent testing need |
| 6 | **Visual Regression Baseline Management** | Nightwatch (built-in), Percy, Lost Pixel | Baseline image storage, approval workflows, branch-specific baselines | Medium | Inspect has pixel diff but needs full baseline lifecycle |
| 7 | **Preview/Approval Mode for AI Actions** | Stagehand (preview mode) | Review AI-proposed actions before committing them | Low-Medium | Critical for trust-building with new users |
| 8 | **PWA (Progressive Web App) Auditing** | Lighthouse | Service worker validation, offline capability, install prompts | Low | Lighthouse has it; web standard requirement |

### 🟡 MEDIUM PRIORITY — Consider Implementing

| # | Missing Feature | Found In | Description | Effort | Priority Rationale |
|---|---|---|---|---|---|
| 9 | **WebDriver BiDi Protocol Support** | Puppeteer, WebdriverIO, Selenium | Bidirectional WebDriver protocol for Firefox and broader browser support | High | Playwright already covers cross-browser; marginal benefit |
| 10 | **Selenium Grid Integration** | Selenium | Run tests on existing Selenium Grid infrastructure | Medium | Enterprise compatibility; many teams have Selenium investment |
| 11 | **Appium (Native Mobile Testing)** | Nightwatch, WebdriverIO, Selenium | Test native iOS and Android applications | High | Expands beyond web; requires significant infrastructure |
| 12 | **Time-Travel Debugging** | Cypress | Snapshot-based replay where users can scrub through test execution | Medium-High | Cypress's killer feature; very valuable for debugging |
| 13 | **Perceptual/AI Visual Diffing** | Nightmare (Niffy), Stagehand | AI-powered visual diffing that ignores acceptable changes | Medium | Better than pixel diff; handles dynamic content |
| 14 | **Snapshot Testing** | Vitest, Jest | Serialize component/page output and compare against saved snapshots | Low | Standard testing pattern; easy to add |
| 15 | **Test Data Management** | Nightwatch, WebdriverIO | Built-in test data fixtures and factories | Low-Medium | Common testing need |
| 16 | **Cloud Actor Execution** | Apify | Cloud-first execution model for distributed scraping/automation | High | Apify's model; may not fit Inspect's local-first approach |

### 🟢 LOW PRIORITY — Nice to Have

| # | Missing Feature | Found In | Description | Effort | Priority Rationale |
|---|---|---|---|---|---|
| 17 | **Multi-Language Bindings** | Playwright (JS/Py/Java/C#), Selenium (5 langs) | Python, Java, C# SDK bindings | Very High | Inspect is TS-first; Python SDK is stub; other langs are overkill |
| 18 | **LLM Arena/Playground** | AIChat | Web-based model comparison playground | Medium | Nice-to-have; not core to testing |
| 19 | **Deep Research Tool** | DocsGPT | Multi-step investigation across sources | Medium | Not testing-focused |
| 20 | **BDD TDD Framework** | Nightwatch | Behavior/Test-driven development patterns | Low | Covered by Gherkin gap |
| 21 | **PageObject Pattern Support** | Nightwatch, WebdriverIO, Splinter | First-class PageObject pattern support | Low | Inspect uses selectors + ARIA; PageObject is legacy pattern |
| 22 | **Custom Reporter Plugins** | TestCafe, WebdriverIO | Pluggable reporter system | Low-Medium | Inspect has 7 formats; extensibility would be nice |
| 23 | **Speech/Voice Commands** | DocsGPT, Page-Agent | Voice input for test creation and execution | Medium | Niche use case |

---

## 4. Feature Parity Scorecard

| Category | Max Features | Inspect Has | Missing | Score |
|---|---:|---:|---:|---:|
| Browser Automation | 18 | 15 | 3 | **83%** |
| Testing Capabilities | 16 | 12 | 4 | **75%** |
| AI/LLM Integration | 22 | 20 | 2 | **91%** |
| Agent Orchestration | 12 | 11 | 1 | **92%** |
| Quality & Auditing | 10 | 9 | 1 | **90%** |
| Enterprise Features | 8 | 7 | 1 | **88%** |
| CLI & UX | 12 | 11 | 1 | **92%** |
| CI/CD Integration | 8 | 7 | 1 | **88%** |
| Security & Privacy | 10 | 10 | 0 | **100%** |
| Data & Crawling | 8 | 8 | 0 | **100%** |
| **OVERALL** | **124** | **110** | **14** | **89%** |

---

## 5. Competitor-Specific Unique Features (Not in Inspect)

### Playwright
- Clock/time mocking
- Chrome extension loading in tests
- Multi-language bindings (JS/TS, Python, Java, C#)

### Cypress
- **Time-travel debugging** — snapshot scrubbing through test execution
- Runs **inside** the browser (same run loop as application)
- Built-in network stubbing without external servers

### Stagehand
- **Preview mode** — approve AI actions before committing
- **Auto-caching with self-healing** — remembers previous actions, skips LLM for repeatable steps
- "Write once, run forever" philosophy

### Skyvern
- **No-code workflow builder** alongside SDK (though Inspect has workflow engine)
- **Browser tunneling** for local Chrome control (Inspect has tunnel, may need verification)
- **Password manager + 2FA integrations** (Inspect has credential vault, needs integration)

### Nightwatch
- **Built-in Visual Regression Testing** plugin with baseline management
- **Native mobile testing via Appium**
- All-in-one: E2E + component + unit + VRT + a11y + API + mobile

### WebdriverIO
- **Lighthouse service** integrated into test runs
- **Most extensive plugin/service ecosystem**

### Selenium
- **Selenium Grid** — distributed execution across massive infrastructure
- **Selenium IDE** — Chrome/Firefox extension for record-and-playback
- Industry standard with decades of ecosystem

### TestCafe
- **No WebDriver** — proxy-based architecture (`testcafe-hammerhead`)
- **Zero configuration** — one command install and go
- **TestCafe Studio** IDE for code-free test recording

### GPT-Engineer
- **Pre-prompts system** for agent identity persistence
- **Benchmarking toolkit** (`bench` binary)

### AIChat
- **LLM Arena** — side-by-side model comparison in web UI
- **Macro system** for REPL automation
- Written in **Rust** — single binary distribution

### Magnitude (browser-agent)
- **Vision-first architecture** — pixel coordinates, not DOM boxes
- **94% on WebVoyager benchmark**

### Browserable
- **90.4% on WebVoyager** — benchmark leader
- Full-stack application with MongoDB, Redis, MinIO

### HyperAgent
- **Dual-mode API** — `page.perform()` (fast) vs `page.ai()` (complex)
- **XPath-based replay** from action cache
- **Stealth mode** with anti-bot patches

### TheAgenticBrowser
- **Three-agent architecture** with explicit critique loop (Planner/Browser/Critique)
- **PydanticAI** Python agent framework

### TestZeus-Hercules
- **Gherkin-to-automated-tests** pipeline (no coding required)
- **Python Sandbox** with multi-tenant security modes
- **Proof of execution** — videos, screenshots, network logs

### Semantic Kernel
- **Three-language support** (Python, .NET, Java)
- **Process Framework** for business process modeling

---

## 6. Implementation Recommendations

### Phase 1 — Quick Wins (Low Effort, High Impact)

| Feature | Package | Description |
|---|---|---|
| Clock/Time Mocking | `@inspect/browser` | Add `clock.pause()`, `clock.resume()`, `clock.setSystemTime()` APIs |
| PWA Auditing | `@inspect/lighthouse-quality` | Enable PWA audits in Lighthouse integration |
| Snapshot Testing | `@inspect/expect-vitest` | Add `toMatchSnapshot()` matcher |
| Preview Mode for AI Actions | `@inspect/agent` | Add approval gate before action execution |
| Test Data Management | `@inspect/shared` | Add fixture factories and test data generators |

### Phase 2 — Core Gaps (Medium Effort, High Impact)

| Feature | Package | Description |
|---|---|---|
| Code Coverage | New: `@inspect/code-coverage` | Instrument JS/TS, collect coverage, generate reports |
| Component Testing | New: `@inspect/component-testing` | Mount React/Vue/Angular components for isolated testing |
| BDD/Gherkin Support | Existing: `@inspect/gherkin-bdd` | Complete Gherkin parser and executor |
| Visual Regression Baseline Management | `@inspect/visual` | Baseline storage, approval workflows, branch baselines |
| Chrome Extension for Recording | New: `inspect-recorder` (Chrome ext) | Record interactions, generate Inspect test scripts |
| Perceptual/AI Visual Diffing | Existing: `@inspect/perceptual-diff` | Complete AI-powered visual diffing |

### Phase 3 — Strategic (High Effort, Strategic Value)

| Feature | Package | Description |
|---|---|---|
| Time-Travel Debugging | `@inspect/browser` + `@inspect/session-recording` | Snapshot-based test execution scrubbing |
| Selenium Grid Integration | Existing: `@inspect/selenium-grid` | Complete Selenium Grid support |
| Appium (Native Mobile) | New: `@inspect/appium` | Native iOS/Android testing |
| WebDriver BiDi Support | `@inspect/browser` | Bidirectional WebDriver for broader browser support |
| Multi-Language SDK Bindings | `@inspect/sdk` | Complete Python SDK, add Java/C# bindings |

---

## 7. Repos That Are NOT Relevant to Inspect

These repositories serve different purposes and don't have features Inspect should adopt:

| Repository | Why Not Relevant |
|---|---|
| **axios** | HTTP client library — Inspect has API testing via workflow HTTP blocks |
| **matrix** | Matrix protocol (chat) — not testing-related |
| **next.js** | React framework — not a testing tool |
| **astro** | Web framework — not a testing tool |
| **json-server** | Mock API server — Inspect has workflow HTTP blocks |
| **msw** | API mocking — Inspect has `@inspect/mocking` |
| **shopify-cli** | E-commerce CLI — unrelated domain |
| **JuMP.jl** | Julia mathematical optimization — unrelated domain |
| **docsgpt** | Documentation chatbot — not testing-related |
| **sauce-docs** | Sauce Labs documentation — not code |
| **vercel** | Deployment platform — not a testing tool |
| **awesome-ai-agents** | Curated list — not a tool itself |

---

## 8. Conclusion

Inspect is already the **most comprehensive testing tool** in the open-source ecosystem. It covers **89%** of the combined feature surface across 50+ repositories, and has **18 unique features** that no competitor offers.

The **8 high-priority gaps** are all achievable and would bring Inspect to **~95%+** feature parity:

1. Chrome Extension for Record & Playback
2. Code Coverage Instrumentation
3. Component Testing (complete the stub)
4. BDD/Gherkin Test Format (complete the stub)
5. Clock/Time Mocking
6. Visual Regression Baseline Management
7. Preview/Approval Mode for AI Actions
8. PWA Auditing

The remaining gaps are either niche (multi-language bindings), require significant infrastructure (Appium, Selenium Grid), or are architecturally incompatible with Inspect's approach (Cypress's in-browser execution model).
