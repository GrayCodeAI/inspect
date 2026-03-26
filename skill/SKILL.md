# Inspect - AI Browser Testing Platform

## What is Inspect?

Inspect is a monorepo-based TypeScript platform for AI-powered browser testing. It uses LLM agents (Claude, GPT-4o, Gemini, etc.) to execute natural language test instructions against real web pages via Playwright.

## Architecture

- **packages/shared** - Shared types, utilities, constants
- **packages/browser** - Playwright browser management, page interaction, screenshots
- **packages/core** - Agent loop, planning, action execution, step orchestration
- **packages/agent** - LLM integration, multi-provider support, tool calling
- **packages/quality** - A11y auditing (axe-core), Lighthouse, chaos testing, security scanning, mocking, fault injection
- **packages/visual** - Visual regression: pixel diff, slider reports, masking, Storybook capture, approval workflow
- **packages/workflow** - Workflow engine for multi-step automation
- **packages/credentials** - Credential management (native, Bitwarden, 1Password, Azure Key Vault)
- **packages/data** - Data extraction, table parsing, structured output
- **packages/api** - REST API server (Hono)
- **packages/network** - Proxy management, HAR recording, traffic interception
- **packages/observability** - OpenTelemetry tracing, metrics, structured logging
- **packages/sdk** - Public SDK for programmatic usage
- **packages/reporter** - HTML/JSON/Markdown test reports
- **apps/cli** - Command-line interface (Commander.js)
- **evals/** - Benchmark implementations (GAIA, Mind2Web, WebVoyager, BrowserGym)
- **yaml/** - YAML test definitions parser, runner, and NL-to-YAML generator

## How to Use Inspect

### Running Tests via CLI

```bash
# Natural language test
npx inspect test "Go to example.com, click Login, enter 'user@test.com' and 'password123', verify dashboard loads"

# From YAML definition
npx inspect test --file tests/login.yaml

# With specific model
npx inspect test "..." --model claude-sonnet-4-20250514

# With device emulation
npx inspect test "..." --device iphone-16

# Headed mode (watch the browser)
npx inspect test "..." --headed
```

### YAML Test Definitions

```yaml
name: Login Flow
baseUrl: https://app.example.com
steps:
  - action: navigate
    value: /login
  - action: type
    selector: "#email"
    value: user@test.com
  - action: type
    selector: "#password"
    value: password123
  - action: click
    selector: button[type="submit"]
  - action: assertUrl
    url: /dashboard
  - action: assertVisible
    selector: ".welcome-message"
  - action: a11y
    standard: wcag2aa
```

### Programmatic SDK Usage

```typescript
import { createInspect } from "@inspect/sdk";

const inspect = createInspect({
  model: "claude-sonnet-4-20250514",
  headless: true,
});

const result = await inspect.test("Navigate to example.com and verify the title contains 'Example'");
console.log(result.passed); // true/false
```

### Quality Testing

```typescript
import { AccessibilityAuditor, LighthouseAuditor, ChaosEngine } from "@inspect/quality";

// A11y audit
const a11y = new AccessibilityAuditor();
const report = await a11y.audit(page);

// Lighthouse
const lh = new LighthouseAuditor();
const perf = await lh.run("https://example.com");

// Chaos testing
const chaos = new ChaosEngine();
const chaosReport = await chaos.unleash(page, { count: 500 });
```

### Visual Regression

```typescript
import { VisualDiff, ViewportCapture, ApprovalWorkflow } from "@inspect/visual";

// Multi-viewport capture
const viewports = new ViewportCapture();
const screenshots = await viewports.captureResponsive(page, "https://example.com");

// Pixel-level diff
const diff = new VisualDiff();
const result = diff.compare(actualImage, baselineImage, { threshold: 10 });
```

## Key Configuration

Environment variables:
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_API_KEY` - Google AI API key
- `INSPECT_MODEL` - Default model to use
- `INSPECT_HEADLESS` - Run browser headless (true/false)
- `INSPECT_BASE_URL` - Default base URL for tests

## Project Commands

```bash
pnpm build          # Build all packages
pnpm dev            # Watch mode for all packages
pnpm test           # Run all tests
pnpm typecheck      # TypeScript type checking
pnpm clean          # Clean build artifacts
```
