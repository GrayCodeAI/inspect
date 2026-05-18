# Changelog

All notable changes to inspect are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0](https://github.com/GrayCodeAI/inspect/compare/v0.2.0...v0.3.0) (2026-05-18)


### Features

* add severity levels and improve check registry ([ec8f89a](https://github.com/GrayCodeAI/inspect/commit/ec8f89a748d0dabd79a99e89b840a77da1a9b531))


### Bug Fixes

* add local hawk replace for shared/types dependency ([82873db](https://github.com/GrayCodeAI/inspect/commit/82873dbb3c02ccceaf098f00e686816e0b6471ba))
* clone hawk in CI for shared/types dependency ([4e8fdfd](https://github.com/GrayCodeAI/inspect/commit/4e8fdfd92dfb09f62f4e3a4ee9972e1105ab03e8))
* gofumpt formatting + go mod tidy ([b45ec85](https://github.com/GrayCodeAI/inspect/commit/b45ec8579c14a3c39848e3c8b02512d23c7f3216))
* remove sarif replace directive, use v0.2.0 ([58e0ff3](https://github.com/GrayCodeAI/inspect/commit/58e0ff3300dc4453e6c542d5c05d30083ba13473))
* repair malformed CI workflow YAML ([a0d1d1d](https://github.com/GrayCodeAI/inspect/commit/a0d1d1d11c8184b47f834084263dc71b557e6113))
* update go.sum for sarif v0.2.0 ([728f464](https://github.com/GrayCodeAI/inspect/commit/728f4644057065657f9fecc70b5b7e0a787fbada))
* upgrade Go from 1.26.1 to 1.26.3 to patch stdlib vulnerabilities ([6150b12](https://github.com/GrayCodeAI/inspect/commit/6150b120b4106fd4c16a46e3fd8e452c9f83a946))


### Refactoring

* remove sarif dependency and simplify version ([e74c8b1](https://github.com/GrayCodeAI/inspect/commit/e74c8b1ba6ea9ffbc3c492aef92b97ef6b2ca666))

## [Unreleased]

### Changed
- **Version re-baselined to `0.2.0`** in
  `internal/report/sarif.go` (`const inspectVersion`, used as
  `tool.driver.version` in SARIF output) and `mcp/server.go`
  (advertised MCP server version). Aligns inspect with the rest of
  the hawk-eco ecosystem (`hawk`, `tok`, `eyrie`, `yaad`, `trace`,
  `sight`).
  - Note: the previous values were inconsistent (`inspectVersion`
    was `"1.0.0"` while the MCP server advertised `"0.1.0"`); both
    now agree on `"0.2.0"`.
  - The SARIF spec version (`sarifVersion = "2.1.0"`) is unchanged
    — that's a different field that identifies the SARIF format,
    not the tool.

### Added — Production hygiene (top-50 OSS parity)
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `.gitattributes` — LF normalization, binary detection, GitHub
  linguist hint to collapse `go.sum` in PR diffs.
- `.editorconfig` — UTF-8, LF, final newline, trim trailing whitespace,
  tabs for Go + Makefile, 2-space indent for YAML/JSON/TOML, no-trim
  for Markdown.
- `.github/dependabot.yml` — weekly `gomod` (root + `browser/`
  sub-module) + `github-actions` updates.
- `.github/PULL_REQUEST_TEMPLATE.md` — Summary / Changes / Scan-
  quality impact / SARIF compatibility / SSRF & egress safety /
  Testing / Checklist.
- `.github/ISSUE_TEMPLATE/bug_report.yml` — surface dropdown
  (library API / MCP / SARIF / GitHub Action / browser checks /
  CVE database) and false-positive textarea.
- `.github/ISSUE_TEMPLATE/feature_request.yml` — `kind` selector
  covering 8 functional areas (security checks / accessibility /
  SEO / performance / browser / output formats / config / tooling)
  and solo-dev fit checks.
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

## [0.2.0] — 2026-04-30

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
