<div align="center">

# 🔍 inspect Architecture

**Website Security, Accessibility & SEO Auditor**

[![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?logo=go)](https://go.dev/)
[![Protocol](https://img.shields.io/badge/Protocol-MCP-purple)]()

</div>

---

## 🎯 Overview

inspect is a website security auditing and crawling library for Go. It crawls sites concurrently, runs **security**, **accessibility**, **SEO**, and **performance** checks, and generates findings with severity levels and **CWE references**.

> 💡 Three modes: **Go library**, **CLI binary** (`inspect-ci`), and **GitHub Action**.

---

## 🧱 Components

```
inspect/
├── api/openapi.yaml          📜 MCP tool surface reference
├── cmd/
│   ├── inspect-ci/main.go    🖥️ CLI binary entry point
│   └── inspect-action/main.go ⚡ GitHub Action entry point
├── inspect.go                📤 Public API: Scan(), Finding, Report, Stats
├── check.go                  🛡️ Checker interface, RuleCheck, RegisterCheck()
├── scanner.go                🔄 Crawler orchestration, check execution
├── options.go                ⚙️ config, With* functions, presets
├── config.go                 📋 .inspect.toml loading
├── sarif.go                  📊 SARIF output formatter
├── ci_output.go              🖥️ CI-friendly terminal output
├── llm_scanner.go            🤖 AI-powered scanning
├── api_security.go           🔒 API endpoint security checks
├── dependency_check.go       📦 Dependency vulnerability checks
├── sbom.go                   📋 SBOM generation
├── browser.go                🌐 Browser automation entry
├── browser/                  🖥️ Rod-based browser crawling
├── checks/
│   ├── security.go           🔒 CSP, HSTS, CORS headers
│   ├── accessibility.go      ♿ ARIA violations
│   ├── tls.go                🔐 Certificate checks
│   ├── cookies.go            🍪 Cookie security flags
│   ├── headers.go            📋 Missing security headers
│   └── mixed_content.go      ⚠️ Mixed content detection
├── mcp/                      🔌 MCP server (stdio transport)
└── internal/
    ├── crawler/              🕷️ URL parsing, sitemap, robots.txt
    ├── check/                🔄 Internal check runner
    ├── html/                 📄 HTML parsing utilities
    └── report/               📊 Output format implementations
```

---

## 📤 Public API

```go
// 🚀 One-shot scan
report, err := inspect.Scan(ctx, "https://example.com",
    inspect.WithChecks("security", "a11y"),
    inspect.WithDepth(3),
)

// 🔄 Reusable scanner
scanner := inspect.NewScanner(inspect.WithConcurrency(10))
report, err := scanner.Scan(ctx, "https://example.com")

// 🛡️ Custom Go check
inspect.RegisterCheck(myCheck)

// 📋 Declarative rule (no Go code)
inspect.RegisterRule(inspect.RuleCheck{
    Name: "x-frame-options", Severity: inspect.High,
    Check: inspect.HeaderMissing{Header: "X-Frame-Options"},
})
```

---

## ⚡ Presets

| Preset | Checks | Speed |
|--------|--------|:-----:|
| 🏃 `Quick` | links, security headers | Fast |
| 📊 `Standard` | links, security, forms, a11y | Medium |
| 🔬 `Deep` | all checks, depth 10 | Slow |
| 🔒 `SecurityOnly` | security, TLS, cookies, headers | Fast |
| 🤖 `CI` | all checks, fail on Medium+ | Medium |

---

## 🔌 MCP Server

```bash
inspect-ci mcp    # 📡 stdio transport (add to agent MCP config)
```

**Tools:** `inspect_scan` — crawl URL and run checks · `inspect_scan_dir` — scan local HTML directory

---

## 🐙 GitHub Action

```yaml
- uses: GrayCodeAI/inspect@v0.4.0
  with:
    url: https://example.com
    checks: security,a11y
    fail-on: high
```

---

## 🔎 Findings

Each finding includes:

| Field | Description |
|-------|-------------|
| `Check` | Which check produced this finding |
| `Severity` | 🟢 Info · 🟡 Low · 🟠 Medium · 🔴 High · 🟥 Critical |
| `URL` | Page where the issue was found |
| `Message` | Human-readable description |
| `Evidence` | Snippet of the problematic content |
| `CWE` | CWE reference (required for security findings) |
| `Confidence` | 0.0–1.0 score |

---

## 🛡️ ReDoS Protection

All user-supplied regex patterns go through:
- `compileWithTimeout()` — **1s** compilation limit
- `matchWithTimeout()` — **100ms** match limit
- `checkRegexComplexity()` — rejects nested quantifiers before compilation
