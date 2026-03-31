# Contributing to Inspect

## Getting Started

```bash
git clone <repo-url>
cd inspect
pnpm install
pnpm build
npx vitest run
```

## Project Structure

- `apps/cli/` — CLI entry point (Commander + Ink TUI)
- `apps/cli/src/agents/` — 28-agent autonomous testing system
- `packages/` — 34 packages (shared, observability, browser, llm, agent-\*, orchestrator, quality sub-packages, etc.)
- `tests/` — Integration and E2E tests

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (Turborepo)
npx vitest run        # Run all tests
npx vitest            # Watch mode
```

## Coding Conventions

- **TypeScript strict mode** — no `any` unless at system boundaries
- **ESM only** — `"type": "module"` in all package.json
- **Node.js built-ins** — use `node:fs`, `node:crypto`, `node:http` over external deps
- **Workspace deps** — use `"@inspect/shared": "workspace:*"` for inter-package deps
- **Tests colocated** — test files live next to source: `foo.test.ts`

## Adding an Agent

1. Create `apps/cli/src/agents/<name>.ts`
2. Import types from `./types.js`
3. Use `safeEvaluate` from `./evaluate.js` for all `page.evaluate` calls
4. Export from `./index.ts`
5. Wire into `orchestrator.ts` at the appropriate tier
6. Add tests in `agents.test.ts`

## Pull Requests

- One feature per PR
- All tests must pass (`npx vitest run`)
- Zero type errors (`npx tsc --noEmit -p apps/cli/tsconfig.json`)
- Build must succeed (`pnpm build`)
