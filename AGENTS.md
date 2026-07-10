---
description: inspect — website audit library build and test conventions.
globs: "*.go"
alwaysApply: false
---

# inspect Conventions

Live website auditor for accessibility, TLS, cookies, and security headers.

## Build & Test

```bash
go build ./...                    # Build library
go test ./...                     # Run tests
go test -race ./...               # Race detector
go vet ./...                      # Static analysis
```

## Architecture

- Go library + MCP server (no standalone CLI binary)
- Analyzes live HTTP/browser targets, not source code
- `browser/` sub-module: headless Chromium via `rod` (optional, heavy dependency)

## Ecosystem Boundaries

- Use `hawk-core-contracts` for cross-repo shared types
- Do not import `hawk/internal/*` or legacy `hawk/shared/types`
- Do not import other engines (`eyrie`, `yaad`, `tok`, `trace`, `sight`)

For full hawk-eco extension guidelines, see [hawk/AGENTS.md](https://github.com/GrayCodeAI/hawk/blob/main/AGENTS.md).
