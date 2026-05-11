# Changelog

All notable changes to inspect are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

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
