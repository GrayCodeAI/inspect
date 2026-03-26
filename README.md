# Inspect

**AI-Powered Browser Testing Platform**

Inspect uses AI agents to automatically test websites — give it a natural language instruction and it launches a real browser, finds bugs, and reports results.

## Quick Start

```bash
# Install
pnpm install

# Build
pnpm build

# Initialize
node apps/cli/dist/index.js init

# Check your environment
node apps/cli/dist/index.js doctor

# Run a test (requires API key)
ANTHROPIC_API_KEY=sk-ant-... node apps/cli/dist/index.js test \
  -m "test the login flow" \
  --url https://your-app.com \
  -y
```

## How It Works

1. **You describe what to test** in plain English
2. **Inspect gathers git context** — what files changed, the diff, recent commits
3. **An AI agent opens a real browser** — navigates, clicks, types, scrolls
4. **The agent thinks adversarially** — tries edge cases, invalid inputs, breaking scenarios
5. **Results are reported** with pass/fail, evidence, and screenshots

## CLI Commands

```bash
# Core testing
inspect test -m "test checkout flow"           # AI-powered test
inspect test -m "test login" --url https://...  # Test specific URL
inspect test --target branch                    # Test branch changes
inspect test -m "test forms" --headed           # Watch the browser
inspect test -m "test" --agent gpt              # Use GPT instead of Claude
inspect test -m "test" --mode cua               # Computer Use Agent mode

# GitHub PR testing
inspect pr https://github.com/user/repo/pull/123

# Visual regression
inspect visual --baseline main --branch feature/ui

# Quality testing
inspect a11y https://your-app.com               # Accessibility audit
inspect lighthouse https://your-app.com          # Performance audit
inspect chaos https://your-app.com               # Monkey testing
inspect security https://your-app.com            # Security scan

# Workflows
inspect workflow run tests/checkout.yaml
inspect workflow create                          # AI-assisted

# Utilities
inspect doctor                                   # Check environment
inspect init                                     # Initialize project
inspect devices                                  # List device presets
inspect models                                   # List LLM models
inspect serve                                    # Start API server
inspect mcp                                      # Start MCP server
```

## SDK Usage

```typescript
import { Inspect } from "@inspect/sdk";

const inspect = new Inspect({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
  headless: true,
});

await inspect.init();

// Single action
await inspect.act("Click the login button");

// Extract data
const data = await inspect.extract("Get all product prices", {
  schema: z.object({
    products: z.array(z.object({ name: z.string(), price: z.number() })),
  }),
});

// Multi-step agent
const result = await inspect.agent("Complete the checkout flow", {
  maxSteps: 20,
  onStep: (step) => console.log(step),
});

await inspect.close();
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_AI_KEY` | Google Gemini API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `INSPECT_TELEMETRY` | Set to `false` to disable telemetry |
| `INSPECT_LOG_LEVEL` | Logging level: debug, info, warn, error |

## Architecture

```
inspect/
  apps/cli/          CLI application (Ink/React TUI, 23 commands)
  packages/
    shared/           Types, utilities, constants (122+ types, 25 devices)
    browser/          Playwright wrapper, ARIA, DOM, vision, cookies, MCP
    agent/            5 LLM providers, prompts, memory, cache, watchdogs
    core/             Orchestrator, git integration, GitHub PR, device pool
    workflow/         YAML workflow engine, 15 block types, cron scheduling
    credentials/      Bitwarden, 1Password, Azure Key Vault, TOTP
    data/             Zod/JSON extraction, CSV/PDF/Excel parsers, S3
    api/              REST API server, JWT auth, webhooks, SSE, WebSocket
    network/          Proxy pool, SOCKS5, domain security, tunneling
    observability/    PostHog analytics, OpenTelemetry, Web Vitals
    quality/          axe-core a11y, Lighthouse, chaos testing, security
    visual/           Pixel diff, slider reports, Storybook capture
    reporter/         Markdown/HTML/JSON reports, GitHub PR comments
    sdk/              Public TypeScript SDK (act/extract/observe/agent)
  evals/              Benchmarks (GAIA, Mind2Web, WebVoyager, etc.)
  yaml/               YAML test definitions, parser, runner
  docker/             Dockerfile + Dockerfile.fast
```

## Supported AI Providers

| Provider | Models | Features |
|----------|--------|----------|
| Anthropic | Claude 4 Sonnet/Opus, Haiku 3.5 | Vision, thinking, tool use |
| OpenAI | GPT-4o, GPT-4.1, o3 | Vision, function calling |
| Google | Gemini 2.5 Pro/Flash | Vision, thinking budget |
| DeepSeek | DeepSeek-R1, V3 | Reasoning, cost-efficient |
| Ollama | Any local model | Privacy, offline use |

## Testing Types

| Type | Tool | What it does |
|------|------|--------------|
| Functional | AI Agent | Tests user flows with natural language |
| Accessibility | axe-core | WCAG 2.2 compliance (105 rules) |
| Performance | Lighthouse | Core Web Vitals, SEO, PWA |
| Security | Nuclei + ZAP | OWASP Top 10, CVE scanning |
| Visual | Pixel diff | Screenshot comparison |
| Chaos | Gremlins.js | Random monkey testing |
| Resilience | Toxiproxy | Network fault injection |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
npx vitest run

# Run specific test file
npx vitest run packages/shared/src/utils/index.test.ts

# Watch mode
npx vitest

# Run the CLI
node apps/cli/dist/index.js --help
```

## License

MIT
