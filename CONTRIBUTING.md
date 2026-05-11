# Contributing to inspect

## Setup

```bash
git clone https://github.com/GrayCodeAI/inspect.git
cd inspect
make test
```

## Requirements

- Go 1.26+
- For browser checks: Chrome/Chromium (rod auto-downloads)

## Development

```bash
make test        # Run tests
make test-race   # With race detector
make cover       # Coverage report
make lint        # Static analysis
make bench       # Benchmarks
```

## Adding a New Check

### Custom check (Go code)

1. Create a file in `internal/check/`
2. Implement the `Checker` interface
3. Register in `internal/check/registry.go`
4. Add tests

### Declarative rule (no Go code)

1. Add a `RuleCheck` struct in `internal/check/rules.go`
2. Specify: HeaderMatch/HeaderMissing/BodyMatch/BodyMissing
3. Add tests

## Guidelines

- All tests must pass with `-race` flag
- Use `t.Parallel()` in tests
- SSRF protection must remain enabled by default
- Rate limiting must be respected (don't remove defaults)
- Add tests for new checks

## Pull Requests

1. Open an issue first for significant changes
2. Run `make all` before submitting
3. Include test coverage
4. Update CHANGELOG.md
