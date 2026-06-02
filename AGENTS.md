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

## Naming Conventions

- **Types are domain nouns**: `Finding`, `Report`, `Stats`, `Page`, `PageLink`, `Checker`, `RuleCheck`
- **Option functions use `With` prefix**: `WithChecks()`, `WithDepth()`, `WithConcurrency()`, `WithAllowPrivateIPs()`
- **Preset options are bare vars**: `Quick`, `Standard`, `Deep`, `SecurityOnly`, `CI` — exported `var Option` values
- **Severity is a type alias**: `type Severity = types.Severity` from `hawk/shared/types` — shared across hawk-eco
- **Internal adapters use `Adapter` suffix**: `ruleCheckAdapter`, `customCheckAdapter` — bridge public to internal interfaces
- **Check names are lowercase strings**: `"security"`, `"links"`, `"forms"`, `"a11y"`, `"performance"` — used in `WithChecks()`
- **Error handling**: `Scan()` returns `(*Report, error)` — validation errors for empty URL, nil errors for success

## API Patterns

- **Functional options pattern**: same as sight — `Option` interface with `optFunc` adapter, `buildConfig()` merge
- **One-shot + reusable**: `Scan(ctx, target, opts...)` creates a `Scanner` internally; `NewScanner(opts...)` for reuse
- **Checker interface for extensibility**: `Name() string` + `Run(ctx, pages) []Finding` — register via `RegisterCheck()`
- **RuleCheck for declarative rules**: `HeaderMatch`, `HeaderMissing`, `BodyMatch`, `BodyMissing`, `URLMatch` patterns
- **Global + per-scanner custom checks**: `RegisterCheck()`/`RegisterRule()` for global; pass slices to `Scanner` for scoped
- **Report.Failed()**: checks if any finding meets `FailOn` severity threshold — same pattern as sight
- **ReDoS protection**: all user-supplied regex patterns go through `compileWithTimeout()` and `matchWithTimeout()` with 1s/100ms limits
- **Regex complexity check**: `checkRegexComplexity()` rejects nested quantifiers and deep group nesting before compilation

## Testing Patterns

- **External test package**: `package inspect_test` — tests import `inspect` as a consumer would
- **httptest.NewServer for all tests**: each test spins up a mock HTTP server with specific HTML/headers/responses
- **Test patterns by concern**: `TestScan_BasicSite` (links), `TestScan_SecurityHeaders`, `TestScan_FormCSRF`, `TestScan_Accessibility`
- **Always pass `WithAllowPrivateIPs()`**: tests run against `127.0.0.1` — without this flag, localhost is blocked
- **Always pass `WithDepth(1)`**: keeps tests fast by limiting crawl depth
- **Finding assertions**: iterate `report.Findings` and check specific `Check`, `Severity`, `Message` fields
- **Preset smoke test**: `TestScan_Presets` runs all presets against a simple server — catches config panics
- **ClearCustomChecks() in tests**: call before registering test-specific checks to avoid global state leaks
- **Report method tests**: `TestReport_Failed`, `TestReport_MaxSeverity` — test on struct literals, no HTTP needed

## Refactoring Guidelines

- **Safe to refactor**: `checkRegexComplexity()`, `compileWithTimeout()`, `matchWithTimeout()` — internal helpers
- **Safe to refactor**: `truncateEvidence()`, `intIn()` — pure utility functions
- **Safe to refactor**: `parseInspectTOML()`, `parseInspectKeyValue()`, `applyFileConfig()` — config parsing internals
- **Do not touch**: `Checker` interface (`Name()`, `Run()`) — breaking change for all custom check implementations
- **Do not touch**: `RuleCheck` struct field names — used by consumers to define declarative rules
- **Do not touch**: `Finding`, `Report`, `Stats` struct field names/tags — JSON serialization contract
- **Safe to extend**: add new `Option` functions, new presets, new built-in checks in `checks/` package
- **When adding checks**: create a new file in `checks/`, implement `Checker` interface, register in `init()`

## Key File Locations

| What | Where |
|---|---|
| Public API entry point | `inspect.go` (types, `Scan()`, `Finding`, `Report`, `Stats`) |
| Check interface & adapters | `check.go` (`Checker`, `RuleCheck`, `RegisterCheck()`, `RegisterRule()`, ReDoS protection) |
| Scanner implementation | `scanner.go` (crawler orchestration, check execution) |
| Configuration & presets | `options.go` (`config` struct, `With*` functions, presets) |
| Config file loading | `config.go` (`.inspect.toml` parsing, `LoadConfig()`) |
| Severity type alias | `severity.go` (re-exports from `hawk/shared/types`) |
| SARIF output | `sarif.go` |
| CI output formatting | `ci_output.go` |
| Built-in checks | `checks/` directory |
| Internal crawler | `internal/crawler/` |
| Internal check runner | `internal/check/` |
| Browser-based crawling | `browser.go`, `browser/` |
| LLM scanner integration | `llm_scanner.go` |
| API security checks | `api_security.go` |
| Dependency checking | `dependency_check.go` |
| SBOM generation | `sbom.go` |
| Main test file | `inspect_test.go` (httptest servers, per-concern scenarios) |
| Linter config | `.golangci.yml` (errcheck, govet, staticcheck, gocritic, bodyclose, noctx) |
