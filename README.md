<p align="center">
  <h1 align="center">Inspect</h1>
  <p align="center"><strong>AI-Powered Browser Testing Platform</strong></p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-1642%20passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node Version">
  <img src="https://img.shields.io/badge/packages-45-orange" alt="Packages">
  <img src="https://img.shields.io/badge/CLI%20commands-76-purple" alt="CLI Commands">
</p>

---

Inspect uses AI agents to test websites in real browsers. Give it a natural-language instruction and it launches Playwright, navigates pages, finds bugs, and reports results. It ships as a monorepo of 34 packages covering browser automation, 5 LLM providers, visual regression, accessibility auditing, performance scoring, security scanning, web crawling, stealth browsing, network fault injection, agent benchmarking, agent governance, enterprise RBAC/SSO, self-healing, and more.

**Inspired by**: Playwright (browser API), Vitest (runner/reporter), Lighthouse (auditing), GitHub CLI (command structure), Vercel (developer experience), Expect (assertions)

## Features

- **AI-Powered Testing** -- Describe what to test in plain English; an AI agent drives a real browser
- **76 CLI Commands** -- Organized into 8 groups: Testing, Browser, Quality, Infrastructure, Governance, Enterprise, Data & Workflow, Setup & Info
- **Interactive TUI** -- Form-based interface with instruction history, auto-URL detection, agent/device/mode selectors
- **REPL Mode** -- 14 slash commands (/help, /model, /heal, /generate, /cost, /audit, etc.)
- **7 Reporter Formats** -- list, dot, json, junit, html, markdown, github
- **5 LLM Providers** -- Claude, GPT, Gemini, DeepSeek, Ollama (local)
- **Visual Regression** -- Pixel diff with slider, side-by-side, and overlay comparison modes
- **Accessibility Auditing** -- WCAG 2.2 compliance with iframe support (axe-core)
- **Performance Scoring** -- Lighthouse integration with Core Web Vitals
- **Security Scanning** -- OWASP Top 10, CVE scanning, Nuclei multi-protocol (DNS/TCP/SSL)
- **Web Crawler** -- Sitemap parsing, robots.txt, link discovery, batch scraping, media extraction
- **Change Tracking** -- Scheduled monitoring with text/JSON diffing and webhook notifications
- **Stealth Browsing** -- Fingerprint rotation, anti-detection headers, CAPTCHA detection
- **Network Fault Injection** -- TCP proxy with toxicity presets (slow-3g, flaky-wifi, offline)
- **WebSocket Mocking** -- Fluent API for WS handler mocking, message matching, recording
- **Browser Profiles** -- Encrypted session persistence with cookie management
- **iFrame/Shadow DOM** -- Traversal and element discovery across frames and shadow roots
- **Agent Benchmarking** -- MiniWoB, WebArena, WorkArena suites with reward shaping
- **CAPTCHA Solving** -- Multi-agent swarm architecture with vision detection
- **Story Testing** -- Storybook, Ladle, Histoire story-level visual regression
- **YAML Workflows** -- 14 block types (crawl, track, proxy, benchmark, task, loop, code, etc.)
- **Microservice Architecture** -- Service registry, API gateway, message bus
- **Credential Vault** -- AES-256-GCM encrypted storage with Bitwarden, 1Password, Azure
- **CI/CD Ready** -- JUnit/GitHub reporters, sharding, presets, template generation
- **Agent Governance** -- Audit trail, autonomy levels, permission management, compliance reports
- **Enterprise** -- RBAC (5 roles), SSO (SAML/OIDC/Azure/Okta), multi-tenancy, hybrid LLM routing
- **Self-Healing** -- Smart selector healing with similarity matching and recovery
- **Session Recording** -- rrweb-based session recording with privacy controls
- **Human-in-the-Loop** -- Human approval checkpoints for autonomous tests
- **Workflow Recording** -- Record workflows and export to test scripts
- **Visual Test Builder** -- Drag-and-drop style test step creation
- **Multi-Agent Scenarios** -- Multi-agent orchestration for complex tests
- **Sandboxed Execution** -- Isolated test execution with resource limits
- **Plugin Marketplace** -- Extensible plugin system with hooks
- **Test Generation** -- Page analysis, sitemap-based generation, YAML/instruction export
- **MCP Server** -- Standalone Model Context Protocol server (14 browser tools)
- **SDK** -- 9 methods: `act()`, `extract()`, `observe()`, `agent()`, `navigate()`, `screenshot()`, `crawl()`, `track()`, `createProxy()`

## Quick Start

```bash
# 1. Install and build
pnpm install && pnpm build

# 2. Check your environment
node apps/cli/dist/index.js doctor

# 3. Run a test
ANTHROPIC_API_KEY=sk-ant-... node apps/cli/dist/index.js test \
  -m "test the login flow" \
  --url https://your-app.com \
  -y
```

## CLI Reference

Inspect ships 76 commands organized into 8 groups.

### Testing

| Command           | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `inspect test`    | AI-powered browser test with natural-language instructions |
| `inspect run`     | Run a saved test suite or YAML test file                   |
| `inspect pr`      | Test a GitHub pull request with full git context           |
| `inspect replay`  | Replay a previous test run from its trace                  |
| `inspect compare` | Compare two test runs side by side                         |
| `inspect watch`   | Watch for file changes and re-run tests automatically      |

```bash
inspect test -m "test checkout flow" --url https://shop.example.com
inspect test -m "test forms" --headed --agent gpt --mode cua
inspect test -m "test search" --workers 4 --shard 1/3 --grep "login"
inspect pr https://github.com/user/repo/pull/123
inspect run tests/checkout.yaml --retries 2
inspect watch --grep "login" --reporter dot
```

### Browser

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `inspect open`       | Open a URL in a managed browser session      |
| `inspect screenshot` | Capture a screenshot of a page               |
| `inspect pdf`        | Export a page to PDF                         |
| `inspect codegen`    | Generate test code from browser interactions |

```bash
inspect open https://example.com --device "iPhone 15"
inspect screenshot https://example.com -o screenshot.png --full-page
inspect pdf https://example.com -o page.pdf
inspect codegen https://example.com
```

### Quality

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `inspect a11y`       | Run accessibility audit (axe-core, WCAG 2.2) |
| `inspect lighthouse` | Run Lighthouse performance audit             |
| `inspect security`   | Run security scan (OWASP Top 10)             |
| `inspect chaos`      | Run chaos/monkey testing (Gremlins.js)       |
| `inspect visual`     | Run visual regression comparison             |

```bash
inspect a11y https://example.com --standard wcag22aa
inspect lighthouse https://example.com --budget perf:90,a11y:95
inspect security https://example.com --level full
inspect chaos https://example.com --duration 30s
inspect visual --baseline main --branch feature/ui
```

### Infrastructure

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `inspect serve`    | Start the REST API server                          |
| `inspect tunnel`   | Create a Cloudflare tunnel to the API server       |
| `inspect sessions` | Manage browser sessions                            |
| `inspect mcp`      | Start the MCP (Model Context Protocol) tool server |

```bash
inspect serve --port 3000 --auth jwt
inspect tunnel --subdomain my-inspect
inspect sessions list
inspect mcp
```

### Governance

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `inspect trail`       | Show agent audit trail                      |
| `inspect autonomy`    | Manage agent autonomy level                 |
| `inspect permissions` | Manage agent permissions (domains, actions) |
| `inspect cost`        | Show session cost breakdown                 |

```bash
inspect trail --limit 50
inspect trail --compliance eu-ai-act
inspect autonomy --level supervision
inspect permissions --allow-domain example.com
inspect permissions --block-action navigate
inspect cost --json
```

### Enterprise

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `inspect rbac`   | Manage role-based access control   |
| `inspect tenant` | Manage tenant plans and quotas     |
| `inspect sso`    | Configure Single Sign-On providers |

```bash
inspect rbac
inspect rbac --role admin
inspect tenant --plan enterprise
inspect tenant --name "Acme Corp" --plan team
inspect sso --provider saml --sso-url https://idp.example.com/sso
```

### Data & Workflow

| Command               | Description                                         |
| --------------------- | --------------------------------------------------- |
| `inspect extract`     | Extract structured data from a page                 |
| `inspect crawl`       | Crawl a website and extract content                 |
| `inspect track`       | Monitor pages for content changes                   |
| `inspect proxy`       | Network fault injection proxy server                |
| `inspect benchmark`   | Run agent benchmarks (miniwob, webarena, workarena) |
| `inspect workflow`    | Run or create YAML workflows                        |
| `inspect credentials` | Manage the encrypted credential vault               |

```bash
inspect extract https://example.com -s '{"title": "string", "price": "number"}'
inspect crawl https://example.com --depth 3 --max-pages 100 --format json
inspect track https://example.com/pricing --interval 3600
inspect proxy start --preset slow-3g --upstream localhost:3000
inspect proxy presets
inspect benchmark run --suite miniwob --concurrency 2
inspect workflow run tests/e2e.yaml
inspect workflow create
inspect credentials set STAGING_PASSWORD
```

### Setup & Info

| Command               | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `inspect init`        | Initialize project config and CI templates           |
| `inspect doctor`      | Check environment, dependencies, and API keys        |
| `inspect generate`    | Generate test files from descriptions                |
| `inspect audit`       | Audit project dependencies and config                |
| `inspect install`     | Install browser binaries (Chromium, Firefox, WebKit) |
| `inspect show-report` | Open a generated report in the browser               |
| `inspect show-trace`  | Open a trace file in the viewer                      |
| `inspect devices`     | List available device presets (25 devices)           |
| `inspect agents`      | List available AI agents and their capabilities      |
| `inspect models`      | List available LLM models across all providers       |
| `inspect completions` | Generate shell completions (bash/zsh/fish)           |
| `inspect alias`       | Manage command aliases                               |
| `inspect engine`      | Manage browser engine settings                       |

```bash
inspect init
inspect init --ci github-actions
inspect doctor --json
inspect devices --format json
inspect models --provider anthropic
inspect completions --shell zsh >> ~/.zshrc
```

## SDK Usage

```typescript
import { Inspect } from "@inspect/sdk";

const inspect = new Inspect({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headless: true,
});

await inspect.init();

// Navigate
await inspect.navigate("https://example.com");

// Execute a single action
await inspect.act("Click the login button");

// Extract structured data
const data = await inspect.extract("Get all product prices");

// Get suggested actions
const actions = await inspect.observe("What can I do on this page?");

// Run a multi-step autonomous agent
const result = await inspect.agent("Complete the checkout flow", {
  maxSteps: 20,
});

// Crawl a website
const crawled = await inspect.crawl("https://example.com", {
  depth: 3,
  maxPages: 100,
});

// Track changes on pages
const changes = await inspect.track(["https://example.com/pricing"], {
  interval: 3600,
});

// Start a fault injection proxy
const proxy = await inspect.createProxy({ preset: "slow-3g" });
// ... run tests with degraded network ...
await proxy.stop();

await inspect.close();
```

## Configuration

### Config File

Create `inspect.config.ts` (or `.js`, `.json`) in your project root:

```typescript
import { defineConfig } from "@inspect/sdk";

export default defineConfig({
  provider: "anthropic",
  headless: true,
  device: "Desktop Chrome",
  timeout: 30_000,
  retries: 2,
  reporter: ["list", "html"],
  outputDir: "./inspect-results",
});
```

### Presets

```bash
inspect test -m "test login" --preset ci        # CI-optimized (headless, retries, junit)
inspect test -m "test login" --preset fast       # Fast mode (reduced timeouts)
inspect test -m "test login" --preset thorough   # Thorough (more steps, screenshots)
```

### Performance Budgets

```bash
inspect lighthouse https://example.com \
  --budget perf:90,a11y:100,bp:90,seo:90,pwa:50
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/inspect.yml
name: Inspect Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install && pnpm build
      - run: npx inspect test -m "test critical flows" --preset ci --reporter github
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### GitLab CI

```yaml
# .gitlab-ci.yml
inspect:
  image: node:20
  before_script:
    - npm i -g pnpm && pnpm install && pnpm build
  script:
    - npx inspect test -m "test critical flows" --preset ci --reporter junit
  artifacts:
    reports:
      junit: inspect-results/junit.xml
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1
jobs:
  inspect:
    docker:
      - image: cimg/node:20.0-browsers
    steps:
      - checkout
      - run: npm i -g pnpm && pnpm install && pnpm build
      - run: npx inspect test -m "test critical flows" --preset ci --reporter junit
      - store_test_results:
          path: inspect-results
```

### Sharding

Split tests across CI workers for parallel execution:

```bash
# Worker 1 of 3
inspect run tests/ --shard 1/3 --reporter junit

# Worker 2 of 3
inspect run tests/ --shard 2/3 --reporter junit

# Worker 3 of 3
inspect run tests/ --shard 3/3 --reporter junit
```

### Template Generation

```bash
inspect init --ci github-actions   # Generate .github/workflows/inspect.yml
inspect init --ci gitlab-ci        # Generate .gitlab-ci.yml
inspect init --ci circleci         # Generate .circleci/config.yml
```

## Architecture

```
inspect/
├── apps/
│   └── cli/                  CLI (Commander + Ink TUI, 76 commands)
├── packages/
│   ├── shared/               Types (160+), utils (24), constants, device presets
│   ├── observability/        Analytics, tracing, metrics, logging, cost intelligence
│   ├── browser/              Playwright, ARIA, DOM, vision, profiles, backends (Lightpanda)
│   ├── devices/              Device presets and device pool
│   ├── llm/                  5 LLM providers (Claude, GPT, Gemini, DeepSeek, Ollama)
│   ├── agent/                Backward-compat facade (re-exports llm, agent-*)
│   ├── agent-memory/         Action cache, short/long-term memory, compaction
│   ├── agent-tools/          Tool registry, decorators, judge, validator
│   ├── agent-watchdogs/      Captcha, crash, DOM, download, popup watchdogs
│   ├── agent-governance/     Audit trail, autonomy levels, permissions
│   ├── orchestrator/         Test execution, scheduling, recovery, caching
│   ├── core/                 Backward-compat facade (re-exports orchestrator, git, devices)
│   ├── git/                  Git integration, GitHub PR management
│   ├── workflow/             YAML engine, 14 block types (crawl, track, proxy, benchmark)
│   ├── credentials/          AES-256-GCM vault (Bitwarden, 1Password, Azure)
│   ├── data/                 Crawler, change tracking, extractors, parsers, cloud storage
│   ├── api/                  REST server, webhooks, SSE, WebSocket
│   ├── network/              Stealth browsing, proxy, domain security, data masking
│   ├── quality/              Backward-compat facade (re-exports a11y, chaos, etc.)
│   ├── a11y/                 Accessibility auditing (axe-core, WCAG 2.2)
│   ├── lighthouse-quality/   Core Web Vitals, budgets, history
│   ├── chaos/                Gremlins.js chaos testing
│   ├── security-scanner/     Nuclei, ZAP security scanning
│   ├── mocking/              REST/GraphQL/WebSocket mocking
│   ├── resilience/           Network fault injection (TCP proxy, toxics)
│   ├── visual/               Pixel diff, masking, storybook, slider reports
│   ├── reporter/             7 formats: list, dot, json, junit, html, markdown, github
│   ├── sdk/                  Public SDK (9 methods)
│   ├── mcp/                  Standalone MCP server (Model Context Protocol)
│   ├── enterprise/           RBAC, SSO, multi-tenancy, hybrid LLM routing
│   └── services/             Microservice architecture (9 services + 3 infra)
├── evals/                    Benchmarks (MiniWoB, WebArena, WorkArena, reward shaping)
└── docker/                   Dockerfile + Dockerfile.fast
```

## Environment Variables

| Variable             | Description                                     | Required               |
| -------------------- | ----------------------------------------------- | ---------------------- |
| `ANTHROPIC_API_KEY`  | Claude API key (Sonnet, Opus, Haiku)            | For Anthropic provider |
| `OPENAI_API_KEY`     | OpenAI API key (GPT-4o, GPT-4.1, o3)            | For OpenAI provider    |
| `GOOGLE_AI_KEY`      | Google Gemini API key (2.5 Pro/Flash)           | For Gemini provider    |
| `DEEPSEEK_API_KEY`   | DeepSeek API key (R1, V3)                       | For DeepSeek provider  |
| `INSPECT_LOG_LEVEL`  | Logging level: `debug`, `info`, `warn`, `error` | No (default: `info`)   |
| `INSPECT_TELEMETRY`  | Set to `false` to disable telemetry             | No (default: `true`)   |
| `INSPECT_CONFIG`     | Path to config file                             | No                     |
| `INSPECT_OUTPUT_DIR` | Output directory for results                    | No                     |

## Supported AI Providers

| Provider      | Models                          | Features                            |
| ------------- | ------------------------------- | ----------------------------------- |
| **Anthropic** | Claude 4 Sonnet/Opus, Haiku 3.5 | Vision, extended thinking, tool use |
| **OpenAI**    | GPT-4o, GPT-4.1, o3             | Vision, function calling            |
| **Google**    | Gemini 2.5 Pro/Flash            | Vision, thinking budget             |
| **DeepSeek**  | DeepSeek-R1, V3                 | Reasoning, cost-efficient           |
| **Ollama**    | Any local model                 | Privacy, offline use, no API key    |

## Testing Types

| Type                | Tool         | What It Does                                            |
| ------------------- | ------------ | ------------------------------------------------------- |
| **Functional**      | AI Agent     | Tests user flows with natural-language instructions     |
| **Accessibility**   | axe-core     | WCAG 2.2 compliance with iframe support                 |
| **Performance**     | Lighthouse   | Core Web Vitals, SEO, PWA scoring                       |
| **Security**        | Nuclei + ZAP | OWASP Top 10, CVE scanning, DNS/TCP/SSL                 |
| **Visual**          | Pixel diff   | Screenshot comparison with configurable thresholds      |
| **Chaos**           | Gremlins.js  | Random monkey testing (5 species)                       |
| **Resilience**      | Toxiproxy    | Network fault injection (TCP proxy, toxicity presets)   |
| **Web Crawling**    | Custom       | Sitemap/robots.txt, link discovery, batch scraping      |
| **Change Tracking** | Custom       | Scheduled monitoring with text/JSON diffing             |
| **Stealth**         | Custom       | Fingerprint rotation, anti-detection, CAPTCHA detection |
| **Mocking**         | MSW-inspired | REST + GraphQL + WebSocket handler mocking              |
| **Benchmarking**    | BrowserGym   | MiniWoB, WebArena, WorkArena agent evaluation           |
| **Story Testing**   | Lost Pixel   | Storybook, Ladle, Histoire visual regression            |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages (Turborepo)
pnpm build

# Run all 1642 tests
npx vitest run

# Run a specific test file
npx vitest run packages/shared/src/utils/index.test.ts

# Watch mode
npx vitest

# Typecheck
pnpm typecheck

# Run the CLI
node apps/cli/dist/index.js --help
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding conventions, and how to submit changes.

## License

[MIT](LICENSE) -- Copyright (c) 2026 Lakshman Patel
