# Changelog

All notable changes to inspect are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Removed
- **Dead exported `RateLimiter` type** (`ratelimit.go`). It had no
  callers — the crawler rate-limits via its own internal per-crawl
  limiter (`internal/crawler/rate.go`) — and its `Close` panicked when
  called twice. Removed along with its test file; the now-unused
  `golang.org/x/time` dependency is dropped from `go.mod`. This is a
  minor API removal of code that never worked in a real scan; the
  crawler's actual rate limiting is unchanged.

### Fixed
- **`FindingsStore.Flush` dropped the batch when the sink errored.** The
  buffer was swapped out before `StoreBatch`, so a failing sink silently
  lost every buffered entry. A failed flush now re-queues its batch at
  the front of the buffer (entries added in the meantime keep their
  order behind it) and still returns the error, so the next `Flush`
  retries the same entries. The buffer stays bounded: re-queued batches
  are capped at `maxBufferEntries` (10,000); overflow drops the oldest
  entries and is reported via the new `FindingsStore.Dropped` counter.
- **`Scanner.ScanDir` was blocked by its own SSRF protection.** The
  temporary file server behind `ScanDir` listens on `127.0.0.1`, which the
  crawler rejects under the default configuration, so default-options
  scans (including the MCP `inspect_scan_dir` tool) returned a silently
  empty report. The crawler now accepts an exact `host:port` private-IP
  allowlist (`crawler.Config.PrivateIPAllowlist`) honored at both the
  dialer and URL-validation layers, and `ScanDir` registers its ephemeral
  listener address for the duration of that scan only. User-supplied URLs
  and all other private addresses remain blocked.
- **`ToContractReport` lost the configured fail threshold at the contract
  layer.** The conversion field-copied `FailOn`, leaving the contract's
  `FailOnSet` false, so a user-configured below-critical threshold did not
  take effect in `verify.Report.Failed`. The converter now calls
  `SetFailOn` so the threshold is recorded as explicitly configured.

---

## [0.1.3] - 2026-07-04

### Changed
- **MCP server scaffolding moved to the shared
  [`hawk-mcpkit`](https://github.com/GrayCodeAI/hawk-mcpkit) module.**
  `mcp/server.go` now delegates server construction, the stdio and
  streamable-HTTP transports, and argument/result helpers to the kit.
  Tool names, schemas, and behavior are unchanged. The advertised MCP
  server version now tracks the `VERSION` file (`inspect.Version`)
  instead of a hardcoded string.
- **Version re-baselined to `0.1.0`** in
  `internal/report/sarif.go` (`const inspectVersion`, used as
  `tool.driver.version` in SARIF output) and `mcp/server.go`
  (advertised MCP server version). Aligns inspect with the rest of
  the hawk-eco ecosystem (`hawk`, `tok`, `eyrie`, `yaad`, `trace`,
  `sight`).
  - Note: the previous values were inconsistent (`inspectVersion`
    was `"1.0.0"` while the MCP server advertised `"0.1.0"`); both
    now agree on `"0.1.0"`.
  - The SARIF spec version (`sarifVersion = "2.1.0"`) is unchanged
    — that's a different field that identifies the SARIF format,
    not the tool.

### Added
- Soft 404 / false positive detection
- Per-host error circuit breaker with auto-throttle
- Gzipped archive format for scan results
- Findings storage bridge for external persistence

### Added — Production hygiene (top-50 OSS parity)
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `.gitattributes` — LF normalization, binary detection, GitHub
  linguist hint to collapse `go.sum` in PR diffs.
- `.editorconfig` — UTF-8, LF, final newline, trim trailing whitespace,
  tabs for Go + Makefile, 2-space indent for YAML/JSON/TOML, no-trim
  for Markdown.
- `.github/PULL_REQUEST_TEMPLATE.md` — Summary / Changes / Scan-
  quality impact / SARIF compatibility / SSRF & egress safety /
  Testing / Checklist.
- `.github/ISSUE_TEMPLATE/bug_report.yml` — surface dropdown
  (library API / MCP / SARIF / browser checks / CVE database) and
  false-positive textarea.
- `.github/ISSUE_TEMPLATE/feature_request.yml` — `kind` selector
  covering 8 functional areas (security checks / accessibility /
  SEO / performance / browser / output formats / config / tooling)
  and developer fit checks.
- `.github/ISSUE_TEMPLATE/config.yml` — routes security to
  advisories, questions to discussions, blocks blank issues.

---

## [0.4.0] — 2026-05-08

### Added
- Browser-based checks (optional rod integration)
- Accessibility auditing (WCAG contrast, ARIA, alt text)
- SRI (Subresource Integrity) validation
- SEO checks (meta tags, structured data)
- Performance checks (resource sizes, render-blocking)
- SARIF and HTML output formats
- MCP server integration (inspect_scan, inspect_scan_dir)
- GitHub Action (action.yml) for CI/CD
- SSRF protection (private IP blocking)
- Sitemap and robots.txt discovery

### Changed
- Improved crawler concurrency model
- Rate limiting defaults (20 req/sec)

---

## [0.1.0] — 2026-04-30

### Added
- Directory scanning (ScanDir)
- JUnit XML output format
- Cookie security checks
- Form validation checks (CSRF, action URLs)
- Configuration file support (.inspect.toml)
- File exclusion patterns

---

## [0.1.0] — 2026-04-28

### Added
- Initial release: Scan() with concurrent crawler
- Security header checks (CSP, HSTS, CORS, X-Frame-Options)
- Broken link detection
- Custom Checker interface
- Declarative RuleCheck pattern matching
- Quick, Standard, Deep presets
- JSON and terminal output
