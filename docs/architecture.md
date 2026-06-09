<div align="center">

# 🔍 inspect Architecture

**Live Website Accessibility, TLS & Security-Header Auditor**

[![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?logo=go)](https://go.dev/)
[![Protocol](https://img.shields.io/badge/Protocol-MCP-purple)]()

</div>

---

## 🎯 Overview

inspect is a website auditing **library** for Go. It crawls live sites
concurrently, runs **accessibility**, **TLS**, **cookie**, **security-header**,
**mixed-content**, and **meta** checks against the discovered pages, and returns
findings with severity levels. Results can be emitted as SARIF for the GitHub
Security tab.

> 💡 inspect ships **no CLI binary**. It is consumed two ways: as a **Go library**
> (imported by hawk and other programs) and as an **MCP server** (stdio transport)
> that exposes auditing tools to any MCP-compatible agent.

---

## 🧱 Package Layout

```
inspect/
├── inspect.go                📤 Public API: Scan(), Finding, Report, Stats
├── scanner.go                🔄 Scanner: crawl orchestration + check execution
├── options.go                ⚙️ config, With* options, presets (Quick/Standard/Deep/…)
├── check.go                  🛡️ Checker interface, RuleCheck, RegisterCheck/RegisterRule
├── config.go                 📋 .inspect config loading
├── severity.go               🎚️ Severity (aliased from hawk/shared/types)
├── sarif.go                  📊 GenerateSARIF — SARIF 2.1.0 output
├── browser.go                🌐 BrowserEngine interface + page-data types (no rod import)
├── browser_fetcher.go        🔌 Adapts a BrowserEngine into the crawler's fetcher
├── checks/                   ✅ Built-in checks run against crawled responses
│   ├── headers.go            📋 Missing security headers (CSP, HSTS, …)
│   ├── cookies.go            🍪 Cookie Secure/HttpOnly/SameSite flags
│   ├── tls.go                🔐 Certificate validity & expiry
│   ├── mixed_content.go      ⚠️ Insecure resources on HTTPS pages
│   ├── meta.go               🏷️ Meta-tag / SEO checks
│   └── accessibility.go      ♿ Accessibility / ARIA checks
├── browser/                  🖥️ Optional rod-based engine (headless Chromium)
│   ├── rod.go                🚀 New() — launches Chromium, renders pages
│   ├── axe.go                ♿ axe-core injection & violation collection
│   ├── contrast.go           🎨 Color-contrast analysis
│   └── options.go            ⚙️ Engine options (separate Go module)
├── mcp/                      🔌 MCP server (stdio transport)
│   └── server.go             📡 inspect_scan & inspect_scan_dir tools
├── api/openapi.yaml          📜 MCP tool surface reference
├── examples/                 📚 Runnable code samples
└── internal/
    ├── crawler/              🕷️ Concurrent crawl, robots.txt, sitemap, rate limit, circuit breaker, dir server
    ├── check/                🔄 Internal check registry & runners (links, forms, a11y, perf, reachability)
    ├── html/                 📄 HTML parsing utilities
    └── report/               📊 Output formatters (text, JSON, JUnit, markdown)
```

---

## 📤 Public API

```go
// 🚀 One-shot scan
report, err := inspect.Scan(ctx, "https://example.com",
    inspect.WithChecks("security", "a11y"),
    inspect.WithDepth(3),
)

// 🔄 Reusable scanner (safe for concurrent use)
scanner := inspect.NewScanner(inspect.WithConcurrency(10))
report, err := scanner.Scan(ctx, "https://example.com")

// 📁 Audit local build output before deploy
report, err := scanner.ScanDir(ctx, "./public")

// 🛡️ Custom Go check
inspect.RegisterCheck(myCheck)

// 📋 Declarative rule (no Go code)
inspect.RegisterRule(inspect.RuleCheck{
    RuleName:      "x-frame-options",
    RuleSeverity:  inspect.SeverityHigh,
    HeaderMissing: []string{"X-Frame-Options"},
})
```

---

## ⚡ Presets

| Preset | Crawl | Checks |
|--------|-------|--------|
| 🏃 `Quick` | depth 2, concurrency 5 | links |
| 📊 `Standard` | depth 5, concurrency 10 | links, security, forms, a11y, perf, seo |
| 🔬 `Deep` | no depth limit, concurrency 20 | all |
| 🔒 `SecurityOnly` | default crawl | security |
| 🤖 `CI` | depth 5, concurrency 10 | all, fail on high |

---

## 🔌 MCP Server

Embed the server in a program to expose auditing over stdio:

```go
import (
    "github.com/GrayCodeAI/inspect"
    inspectmcp "github.com/GrayCodeAI/inspect/mcp"
)

srv := inspectmcp.New(inspect.Standard)
_ = srv.ServeStdio()
```

**Tools:** `inspect_scan` — crawl a URL and run checks · `inspect_scan_dir` — serve and scan a local HTML directory.

---

## 🌐 Browser-Rendered Analysis

The core `inspect` package never imports rod. To analyze JavaScript-rendered
pages and run axe-core / contrast checks, supply a `BrowserEngine` from the
`browser` sub-module (a separate Go module so the rod/Chromium dependency stays
opt-in):

```go
import "github.com/GrayCodeAI/inspect/browser"

engine, _ := browser.New()
defer engine.Close()

report, _ := inspect.Scan(ctx, "https://example.com",
    inspect.Standard,
    inspect.WithBrowser(engine),
)
```

`browser_fetcher.go` adapts the engine into the crawler's fetcher so rendered
HTML is analyzed instead of the raw HTTP response.

---

## 🔎 Findings

Each finding (`inspect.Finding`) includes:

| Field | Description |
|-------|-------------|
| `Check` | Which check produced the finding |
| `Severity` | 🟢 Info · 🟡 Low · 🟠 Medium · 🔴 High · 🟥 Critical |
| `URL` | Page where the issue was found |
| `Element` | Offending element (optional) |
| `Message` | Human-readable description |
| `Fix` | Suggested remediation (optional) |
| `Evidence` | Snippet of the problematic content (optional) |

A `Report` aggregates findings plus `Stats` (pages scanned, counts by severity
and check, per-check durations) and a `FailOn` threshold; `Report.Failed()` and
`Report.MaxSeverity()` summarize the run. `GenerateSARIF` converts findings to
SARIF 2.1.0.

---

## 🛡️ Crawler Safeguards

- **SSRF protection** — requests to private IP ranges are blocked by default
  (`WithAllowPrivateIPs` opts out for internal infrastructure)
- **Rate limiting** — per-host request rate caps
- **Circuit breaker** — stops hitting a host after repeated failures, half-opens after cooldown
- **robots.txt** — respected by default
- **Redirect & page timeouts** — bounded redirect chains and per-page deadlines
