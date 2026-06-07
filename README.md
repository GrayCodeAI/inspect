<p align="center">
  <h1 align="center">Inspect</h1>
  <p align="center">
    <strong>Security vulnerability scanner for code</strong>
  </p>
  <p align="center">
    <a href="https://golang.org/"><img src="https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
    <a href="https://github.com/GrayCodeAI/inspect/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/GrayCodeAI/inspect/ci.yml?style=flat-square&label=tests" alt="CI"></a>
  </p>
</p>

---

Inspect scans code for security vulnerabilities, anti-patterns, and potential issues. It provides actionable findings with severity ratings and remediation guidance.

## Features

- **Multi-language support** - Scans Go, Python, JavaScript, TypeScript, and more
- **OWASP coverage** - Detects common vulnerability patterns
- **Custom rules** - Define project-specific security policies
- **CI/CD integration** - Fails builds on critical issues

## Quick Start

```bash
go get github.com/GrayCodeAI/inspect
```

```go
import "github.com/GrayCodeAI/inspect"

scanner := inspect.NewScanner(
    inspect.WithRules(inspect.DefaultRules),
)

report, err := scanner.Scan(ctx, "./path/to/code")
for _, f := range report.Findings {
    fmt.Printf("[%s] %s - %s\n", f.Severity, f.Rule, f.Message)
}
```

## Examples

See the [examples/](examples/) directory for runnable code samples.

## Configuration

Create `.inspect.yaml` to customize scanning:

```yaml
rules:
  - name: no-hardcoded-secrets
    severity: critical
  - name: sql-injection
    severity: high
ignore:
  - vendor/
  - testdata/
```

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT - see [LICENSE](LICENSE) for details.
