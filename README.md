<p align="center">
  <h1 align="center">Inspect</h1>
  <p align="center">
    <strong>Live website auditor for accessibility, TLS, cookies, and security headers</strong>
  </p>
  <p align="center">
    <a href="https://golang.org/"><img src="https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
    <a href="https://github.com/GrayCodeAI/inspect/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/GrayCodeAI/inspect/ci.yml?style=flat-square&label=tests" alt="CI"></a>
  </p>
</p>

---

## What is inspect

inspect is a Go library that crawls live **websites** and audits the pages it
finds — accessibility, TLS, cookies, security headers, mixed content, and meta
tags. It is part of the [hawk](https://github.com/GrayCodeAI/hawk) ecosystem:
hawk wires inspect into its own commands, and inspect also ships an MCP server
so any MCP-compatible agent can run audits.

> **inspect is a Go library (and MCP server), not a CLI.** It ships no `inspect`
> binary of its own — it analyzes running URLs, not source code. Import it
> directly to embed website auditing in your own Go program, or run the MCP
> server to expose it to an agent.

It crawls concurrently (with rate limiting, robots.txt support, redirect
handling, and SSRF protection), runs each check against the discovered pages,
and returns findings with severity levels. Results can be emitted as SARIF for
the GitHub Security tab.

## Quick Start

```go
import (
    "context"
    "fmt"

    "github.com/GrayCodeAI/inspect"
)

// One-shot scan with the Standard preset.
report, err := inspect.Scan(ctx, "https://example.com", inspect.Standard)
if err != nil {
    // handle error
}
for _, f := range report.Findings {
    fmt.Printf("[%s] %s: %s\n", f.Severity, f.URL, f.Message)
}
```

Requires Go 1.26+.

For repeated or high-throughput scans, reuse a `Scanner` (safe for concurrent use):

```go
scanner := inspect.NewScanner(inspect.Standard, inspect.WithDepth(3))
r1, _ := scanner.Scan(ctx, "https://site-a.com")
r2, _ := scanner.Scan(ctx, "https://site-b.com")
```

## Features

- **Accessibility** — meta/ARIA checks; optional axe-core and color-contrast
  analysis through the `browser` sub-module (headless Chromium via rod)
- **TLS** — certificate validity and expiry checks
- **Cookies** — `Secure`, `HttpOnly`, and `SameSite` flag auditing
- **Security headers** — detects missing CSP, HSTS, and related headers
- **Mixed content** — flags insecure resources served on HTTPS pages
- **Meta tags** — SEO and metadata checks
- **Concurrent crawler** — depth limits, rate limiting, robots.txt, redirect
  following, and SSRF protection (private IPs blocked by default)
- **SARIF output** — `inspect.GenerateSARIF` emits SARIF 2.1.0 for the GitHub
  Security tab
- **MCP server** — expose `inspect_scan` and `inspect_scan_dir` to any agent
- **Extensible** — register custom `Checker` implementations or declarative
  `RuleCheck` patterns

## Presets

| Preset | Behavior |
|---|---|
| `Quick` | Shallow crawl (depth 2), links only |
| `Standard` | Balanced crawl (depth 5), all checks |
| `Deep` | Exhaustive crawl (no depth limit), all checks |
| `SecurityOnly` | Security-related checks only |
| `CI` | Standard checks, fail on high severity |

## MCP Server

inspect ships an MCP server (stdio transport) that exposes website auditing to
any MCP-compatible agent:

```go
import inspectmcp "github.com/GrayCodeAI/inspect/mcp"

srv := inspectmcp.New(inspect.Standard)
if err := srv.ServeStdio(); err != nil {
    // handle error
}
```

**Tools:**

- `inspect_scan` — crawl a URL and run the configured checks
- `inspect_scan_dir` — serve and scan a local directory of HTML files

## Browser-Rendered Analysis

By default inspect analyzes raw HTTP responses. To analyze JavaScript-rendered
pages and run axe-core accessibility checks, supply a `BrowserEngine` from the
`browser` sub-module:

```go
import "github.com/GrayCodeAI/inspect/browser"

engine, err := browser.New()
if err != nil {
    // handle error
}
defer engine.Close()

report, err := inspect.Scan(ctx, "https://example.com",
    inspect.Standard,
    inspect.WithBrowser(engine),
)
```

## Custom Checks

```go
// Declarative rule — no Go code beyond the struct.
inspect.RegisterRule(inspect.RuleCheck{
    RuleName:      "x-frame-options",
    RuleSeverity:  inspect.SeverityHigh,
    HeaderMissing: []string{"X-Frame-Options"},
})

// Full Checker implementation, scoped to a single Scanner.
scanner := inspect.NewScanner(inspect.WithCustomChecks(myCheck))
```

## Examples

See the [examples/](examples/) directory for runnable code samples.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the package layout and data flow.

## Ecosystem

inspect is part of the hawk ecosystem:

| Component | Repository | Purpose |
|---|---|---|
| **hawk** | [GrayCodeAI/hawk](https://github.com/GrayCodeAI/hawk) | AI coding agent |
| **eyrie** | [GrayCodeAI/eyrie](https://github.com/GrayCodeAI/eyrie) | LLM provider runtime |
| **yaad** | [GrayCodeAI/yaad](https://github.com/GrayCodeAI/yaad) | Graph-based memory |
| **inspect** | This repo | Website audit library + MCP server |

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT - see [LICENSE](LICENSE) for details.
