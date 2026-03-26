# CLAUDE.md - Inspect Project Guide

## Project Overview

Inspect is an AI-powered browser testing platform. It's a TypeScript monorepo with 15 packages.

## Build & Run

```bash
pnpm install          # Install deps
pnpm build            # Build all packages (Turborepo)
npx vitest run        # Run all 317 unit tests
npx vitest            # Watch mode

# Run CLI
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js test -m "test login" --url https://example.com -y
```

## Project Structure

- `apps/cli/` — CLI entry point (Commander + Ink TUI)
- `packages/shared/` — Types (122+), utils (25), constants (68), device presets (25)
- `packages/browser/` — Playwright wrapper, ARIA snapshots, DOM, vision, cookies, MCP
- `packages/agent/` — LLM providers (Claude/GPT/Gemini/DeepSeek/Ollama), prompts, memory, cache, watchdogs
- `packages/core/` — Test orchestrator, git integration, GitHub PR, device pool
- `packages/workflow/` — YAML workflow engine, 15 block types
- `packages/credentials/` — Credential vault (Bitwarden, 1Password, Azure)
- `packages/data/` — Data extraction, file parsers, cloud storage
- `packages/api/` — REST API server, webhooks, SSE, WebSocket
- `packages/network/` — Proxy, domain security, data masking, tunneling
- `packages/observability/` — Analytics, tracing, metrics, logging
- `packages/quality/` — a11y, Lighthouse, chaos, security, mocking
- `packages/visual/` — Pixel diff, slider reports, masking
- `packages/reporter/` — Markdown/HTML/JSON reports
- `packages/sdk/` — Public SDK (act/extract/observe/agent)

## Coding Conventions

- **TypeScript strict mode** — no `any` unless absolutely necessary (use `as unknown as Type`)
- **ESM only** — `"type": "module"` in all package.json
- **Node.js built-ins preferred** — use `node:fs`, `node:crypto`, `node:http` over external deps
- **Fetch-based HTTP** — LLM providers use native fetch, no SDK dependencies
- **Workspace deps** — use `"@inspect/shared": "workspace:*"` for inter-package deps
- **Export barrels** — each package has `src/index.ts` re-exporting public API
- **Types in shared** — all shared types go in `packages/shared/src/types/`
- **Tests colocated** — test files live next to source: `utils/index.test.ts`

## Key Patterns

- **BrowserManager** — `launchBrowser(config)` / `closeBrowser()` / `newPage()`
- **AriaSnapshotBuilder** — `buildTree(page)` / `getFormattedTree()` / `getStats()`
- **AgentRouter** — `new AgentRouter({ keys: {...} })` / `getProvider("anthropic")`
- **LLM Providers** — `provider.chat(messages)` / `provider.stream(messages)`
- **GitManager** — `new GitManager(cwd)` / `getChangedFiles(scope)` / `getDiff(scope)`

## Testing

- **Framework**: Vitest
- **Config**: `vitest.config.ts` at root
- **Pattern**: `describe/it/expect` from vitest
- **No external deps**: Tests must work without network, browser, or API keys
- **12 test files, 317 tests** currently passing

## Environment Variables

- `ANTHROPIC_API_KEY` — Claude
- `OPENAI_API_KEY` — OpenAI/GPT
- `GOOGLE_AI_KEY` — Gemini
- `DEEPSEEK_API_KEY` — DeepSeek
- `INSPECT_LOG_LEVEL` — debug/info/warn/error
- `INSPECT_TELEMETRY` — false to disable

## Adding a New Package

1. Create `packages/<name>/package.json` with `@inspect/shared` workspace dep
2. Create `packages/<name>/tsconfig.json` extending root
3. Create `packages/<name>/src/index.ts` barrel
4. Add to `pnpm-workspace.yaml` (already covered by `packages/*`)
5. Run `pnpm install` then `pnpm build`
