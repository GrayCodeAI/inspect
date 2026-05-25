<!--
  Thanks for your contribution! Please fill out this template so reviewers can
  understand the change quickly. Anything that does not apply can be left in
  place; do not delete unanswered sections — write "n/a".
-->

## Summary

<!--
  One paragraph describing what this PR does and why. Link the related
  issue(s) with `Fixes #N` or `Refs #N` if applicable.
-->

## Changes

<!--
  Bullet list of what changed, grouped by area (scanner, checks, browser,
  crawler, output formats, MCP, internal/...). Reviewers should be able
  to skim this and know what to look at first.
-->

-

## Scan-quality impact

<!--
  Inspect is a security/quality scanner. Any change to checks, the
  crawler, the rule set, or finding deduplication can shift the
  false-positive / false-negative balance.

  - Did you add, remove, or modify a check? Update or relax detection
    rules?
  - If yes: paste before/after numbers from `go test ./checks/...`,
    `go test ./internal/check/...`, and any fixture sites you scanned.
  - If no: write "n/a".
-->

## SARIF compatibility

<!--
  Did you change `internal/report/sarif.go` or any SARIF-shaped output?

  - If yes: confirm the output still validates against the SARIF 2.1.0
    schema and call out any new fields, especially in `tool.driver`.
  - If no: write "n/a".
-->

## SSRF & egress safety

<!--
  Inspect crawls URLs supplied by users. SSRF protection (private-IP
  blocking, redirect filtering, scheme allowlists) is critical.

  - Did you change anything that affects which hosts inspect will
    connect to? Redirects? DNS resolution? IP filtering?
  - If yes: explicitly call out which protections were added, removed,
    or relaxed, and confirm the relevant unit tests cover the new
    behaviour.
  - If no: write "n/a".
-->

## Testing

<!--
  Describe how you tested. Paste output of `make test` and `make lint`.
  If you added new tests, list them.
-->

```text
$ make test
...
$ make lint
...
```

## Checklist

- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
      (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, etc.)
- [ ] `make build` passes
- [ ] `make lint` passes
- [ ] `make test-race` passes locally
- [ ] New or changed code has tests
- [ ] Public APIs in `inspect.go`, `scanner.go`, etc. have godoc comments
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` if user-visible
- [ ] No regression in default scan output on representative fixtures
- [ ] SARIF output (if touched) validates against the 2.1.0 schema
- [ ] SSRF protection (if touched) — private-IP blocking, redirect
      filtering, scheme allowlists — is preserved
- [ ] No secrets, real-customer URLs, or PII in test fixtures
- [ ] No `Co-authored-by:` trailers (this is individual-developer work)
