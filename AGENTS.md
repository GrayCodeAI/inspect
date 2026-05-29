# AGENTS.md — Inspect

Website security auditing and crawling library for Go. Crawls sites concurrently, runs checks and declarative rules, generates findings with severity and CWE references.

## Design Principles

- **Library + CLI** — importable library with optional `inspect-ci` binary
- **No LLM dependency** — pure static analysis on crawled pages
- **Extensible** — custom checks (Go code) + declarative rules (no code required)

## Build & Test

```bash
go test ./...                    # Run all tests
go test -race ./...              # Race detector
go test -coverprofile=c.out ./... # Coverage
go vet ./...                     # Static analysis
gofumpt -w .                     # Format
```

## Architecture

- `crawler.go` — Concurrent website crawler with depth control
- `check.go` — Check interface and built-in security checks
- `rule.go` — Declarative rule engine (YAML-based)
- `finding.go` — Findings with severity, CWE, and evidence
- `report.go` — Report generation (JSON, SARIF, HTML)
- `cmd/inspect-ci/` — Optional CI binary for pipeline integration

## Conventions

- Go 1.26+, pure Go, no CGO
- Table-driven tests
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- No `Co-authored-by:` trailers (auto-stripped by githook)
- `gofumpt` formatting enforced in CI
- CWE references required for all security findings

## Common Pitfalls

- Crawler tests need HTTP test servers — use `httptest.NewServer`
- Rule YAML must be validated before execution
- Session cookie matching uses substring, not exact match
