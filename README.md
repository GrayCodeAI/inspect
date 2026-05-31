# inspect

Website security auditing and crawling library for Go. Crawls sites concurrently, runs checks and declarative rules, generates findings with severity and CWE references.

## Design

- **Library + CLI** — importable library with optional `inspect-ci` binary
- **No LLM dependency** — pure static analysis on crawled pages
- **Extensible** — custom checks (Go code) + declarative rules (no code required)

## Install

```bash
go get github.com/GrayCodeAI/inspect@latest
```

## Usage

### One-shot scan

```go
report, err := inspect.Scan(ctx, "https://example.com", inspect.Standard)
for _, f := range report.Findings {
    fmt.Printf("[%s] %s: %s\n", f.Severity, f.URL, f.Message)
}
if report.Failed() {
    os.Exit(1)
}
```

### Reusable scanner

```go
scanner := inspect.NewScanner(inspect.Standard)
r1, _ := scanner.Scan(ctx, "https://site-a.com")
r2, _ := scanner.Scan(ctx, "https://site-b.com")
```

### Directory scan (local files)

```go
report, _ := scanner.ScanDir(ctx, "./public")
```

## Presets

| Preset | Depth | Checks | Use case |
|--------|-------|--------|----------|
| Quick | 1 | security | Fast header check |
| Standard | 3 | all (default) | Balanced audit |
| Deep | 10 | all | Comprehensive crawl |
| SecurityOnly | 3 | security | Security audit |
| CI | 3 | all + fail-on | CI/CD gates |

## Built-in Checks

| Check | Detects |
|-------|---------|
| Security Headers | Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| TLS/Certificates | Weak ciphers, expired certs, mixed content |
| CORS | Overly permissive Access-Control-Allow-Origin |
| Broken Links | 404s, timeouts, unreachable URLs |
| Forms | Missing CSRF tokens, insecure action URLs |
| Accessibility | Missing alt text, contrast issues, ARIA violations |
| Performance | Large resources, render-blocking scripts |
| SEO | Missing meta tags, broken structured data |
| SRI | Missing subresource integrity on CDN scripts |

## Custom Checks

```go
type Checker interface {
    Name() string
    Run(ctx context.Context, pages []*Page) []Finding
}

inspect.RegisterCheck(&MyCustomChecker{})
```

## Declarative Rules

```go
inspect.RegisterRule(inspect.RuleCheck{
    RuleName:      "HSTS Missing",
    RuleSeverity:  inspect.High,
    HeaderMissing: []string{"Strict-Transport-Security"},
    FixSuggestion: "Add HSTS header with max-age >= 31536000",
})
```

## Configuration

File-based config via `.inspect.toml`:

```toml
depth = 5
concurrency = 10
timeout = "30s"
fail-on = "high"
checks = ["security", "links", "forms"]
exclude = ["/admin/*", "/api/*"]
```

## Output Formats

- Terminal (colored, human-readable)
- JSON
- JUnit XML (CI integration)
- HTML report
- Markdown

## CI/CD Integration

### GitHub Action

```yaml
- uses: GrayCodeAI/inspect@v0.4.0
  with:
    url: https://staging.example.com
    fail-on: high
    format: junit
```

### CLI

```bash
inspect-ci --url https://example.com --fail-on high --format junit
```

## Testing

```bash
make test        # Unit tests
make test-race   # With race detector
make bench       # Benchmarks
make cover       # Coverage report
```

## License

MIT

## New Features (Wave 1-4)

### Soft 404 Detection
Inspect detects "soft 404s" — pages that return HTTP 200 but actually contain error messages or empty content. This reduces false positives in link checking and accessibility audits.

### Per-Host Circuit Breaker
When a host starts returning errors, inspect automatically throttles requests to that host to prevent cascading failures. The circuit breaker:
- Opens after N consecutive errors (default: 5)
- Resets after a cooldown period (default: 30s)
- Tracks per-host health metrics

### Scan Result Archive Format
Inspect can export scan results as a gzipped JSON archive (.inspect.gz) containing:
- Full scan metadata (host, duration, URL counts)
- Per-URL results (status code, content type, body hash, headers)
- Summary statistics (status code distribution, error rate)

Archives can be read back with ReadArchive() for analysis or comparison.

### Findings Storage Bridge
Scan findings can be persisted to an external store (yaad-compatible) for tracking security posture over time. Supports batch writes and auto-flush.

## Ecosystem
Inspect is part of the hawk-eco platform:
- **hawk** — CLI/REPL that orchestrates all tools
- **sight** — code review and security analysis
- **eyrie** — LLM provider layer
- **yaad** — memory/recall engine
- **tok** — token counting and cost estimation
- **trace** — session capture and replay
