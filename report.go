package inspect

import (
	"encoding/xml"
	"fmt"
	"html/template"
	"sort"
	"strings"
)

// SeverityStats returns a count of findings by severity level.
func SeverityStats(findings []Finding) map[string]int {
	stats := make(map[string]int)
	for _, f := range findings {
		stats[f.Severity.String()]++
	}
	return stats
}

// GenerateHTML generates a styled HTML report from findings, grouped by check
// with severity badges and summary statistics.
func GenerateHTML(findings []Finding) string {
	stats := SeverityStats(findings)
	grouped := groupByCheck(findings)

	data := struct {
		Findings []Finding
		Stats    map[string]int
		Grouped  map[string][]Finding
		Checks   []string
		Total    int
	}{
		Findings: findings,
		Stats:    stats,
		Grouped:  grouped,
		Checks:   sortedKeys(grouped),
		Total:    len(findings),
	}

	tmpl := template.Must(template.New("report").Funcs(template.FuncMap{
		"severityClass": func(s Severity) string {
			switch s {
			case SeverityCritical:
				return "critical"
			case SeverityHigh:
				return "high"
			case SeverityMedium:
				return "medium"
			case SeverityLow:
				return "low"
			default:
				return "info"
			}
		},
		"upper": strings.ToUpper,
	}).Parse(htmlTemplate))

	var buf strings.Builder
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Sprintf("<!-- template error: %s -->", err.Error())
	}
	return buf.String()
}

// GenerateMarkdown generates a Markdown report suitable for PRs and issues.
func GenerateMarkdown(findings []Finding) string {
	if len(findings) == 0 {
		return "# Security Scan Report\n\nNo findings detected.\n"
	}

	var buf strings.Builder
	stats := SeverityStats(findings)
	grouped := groupByCheck(findings)

	buf.WriteString("# Security Scan Report\n\n")

	// Summary
	buf.WriteString("## Summary\n\n")
	buf.WriteString(fmt.Sprintf("**Total findings:** %d\n\n", len(findings)))
	buf.WriteString("| Severity | Count |\n")
	buf.WriteString("|----------|-------|\n")
	for _, sev := range []string{"critical", "high", "medium", "low", "info"} {
		if count, ok := stats[sev]; ok {
			buf.WriteString(fmt.Sprintf("| %s | %d |\n", strings.ToUpper(sev), count))
		}
	}
	buf.WriteString("\n")

	// Findings by check
	buf.WriteString("## Findings\n\n")
	for _, checkName := range sortedKeys(grouped) {
		checkFindings := grouped[checkName]
		buf.WriteString(fmt.Sprintf("### %s (%d)\n\n", checkName, len(checkFindings)))

		for _, f := range checkFindings {
			buf.WriteString(fmt.Sprintf("- **[%s]** %s", strings.ToUpper(f.Severity.String()), f.Message))
			if f.URL != "" {
				buf.WriteString(fmt.Sprintf(" (`%s`)", f.URL))
			}
			buf.WriteString("\n")
			if f.Evidence != "" {
				buf.WriteString(fmt.Sprintf("  - Evidence: `%s`\n", f.Evidence))
			}
			if f.Fix != "" {
				buf.WriteString(fmt.Sprintf("  - Fix: %s\n", f.Fix))
			}
		}
		buf.WriteString("\n")
	}

	return buf.String()
}

// junitTestSuites represents JUnit XML output.
type junitTestSuites struct {
	XMLName xml.Name         `xml:"testsuites"`
	Suites  []junitTestSuite `xml:"testsuite"`
}

type junitTestSuite struct {
	XMLName  xml.Name        `xml:"testsuite"`
	Name     string          `xml:"name,attr"`
	Tests    int             `xml:"tests,attr"`
	Failures int             `xml:"failures,attr"`
	Errors   int             `xml:"errors,attr"`
	Cases    []junitTestCase `xml:"testcase"`
}

type junitTestCase struct {
	XMLName   xml.Name      `xml:"testcase"`
	Name      string        `xml:"name,attr"`
	ClassName string        `xml:"classname,attr"`
	Failure   *junitFailure `xml:"failure,omitempty"`
}

type junitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Content string `xml:",chardata"`
}

// GenerateJUnit generates a JUnit XML report for CI integration.
func GenerateJUnit(findings []Finding) string {
	grouped := groupByCheck(findings)

	var suites []junitTestSuite
	for _, checkName := range sortedKeys(grouped) {
		checkFindings := grouped[checkName]
		suite := junitTestSuite{
			Name:     checkName,
			Tests:    len(checkFindings),
			Failures: len(checkFindings),
			Errors:   0,
		}

		for _, f := range checkFindings {
			tc := junitTestCase{
				Name:      f.Message,
				ClassName: checkName,
			}

			var failContent strings.Builder
			if f.URL != "" {
				failContent.WriteString(fmt.Sprintf("URL: %s\n", f.URL))
			}
			if f.Element != "" {
				failContent.WriteString(fmt.Sprintf("Element: %s\n", f.Element))
			}
			if f.Evidence != "" {
				failContent.WriteString(fmt.Sprintf("Evidence: %s\n", f.Evidence))
			}
			if f.Fix != "" {
				failContent.WriteString(fmt.Sprintf("Fix: %s\n", f.Fix))
			}

			tc.Failure = &junitFailure{
				Message: f.Message,
				Type:    f.Severity.String(),
				Content: failContent.String(),
			}
			suite.Cases = append(suite.Cases, tc)
		}

		suites = append(suites, suite)
	}

	output := junitTestSuites{Suites: suites}
	xmlData, err := xml.MarshalIndent(output, "", "  ")
	if err != nil {
		return fmt.Sprintf("<!-- XML error: %s -->", err.Error())
	}

	return xml.Header + string(xmlData)
}

// groupByCheck groups findings by their Check field.
func groupByCheck(findings []Finding) map[string][]Finding {
	grouped := make(map[string][]Finding)
	for _, f := range findings {
		check := f.Check
		if check == "" {
			check = "unknown"
		}
		grouped[check] = append(grouped[check], f)
	}
	return grouped
}

// sortedKeys returns map keys in sorted order.
func sortedKeys(m map[string][]Finding) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Scan Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; padding: 2rem; }
  .container { max-width: 1000px; margin: 0 auto; }
  h1 { color: #1a1a2e; margin-bottom: 1.5rem; }
  h2 { color: #16213e; margin: 1.5rem 0 0.75rem; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }
  .summary { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .stat-card { background: white; border-radius: 8px; padding: 1rem 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-width: 120px; text-align: center; }
  .stat-card .count { font-size: 2rem; font-weight: bold; }
  .stat-card .label { font-size: 0.85rem; color: #666; text-transform: uppercase; }
  .stat-card.critical .count { color: #d32f2f; }
  .stat-card.high .count { color: #f57c00; }
  .stat-card.medium .count { color: #fbc02d; }
  .stat-card.low .count { color: #388e3c; }
  .stat-card.info .count { color: #1976d2; }
  .finding { background: white; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid #ccc; }
  .finding.critical { border-left-color: #d32f2f; }
  .finding.high { border-left-color: #f57c00; }
  .finding.medium { border-left-color: #fbc02d; }
  .finding.low { border-left-color: #388e3c; }
  .finding.info { border-left-color: #1976d2; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; color: white; text-transform: uppercase; margin-right: 0.5rem; }
  .badge.critical { background: #d32f2f; }
  .badge.high { background: #f57c00; }
  .badge.medium { background: #fbc02d; color: #333; }
  .badge.low { background: #388e3c; }
  .badge.info { background: #1976d2; }
  .finding-url { color: #666; font-size: 0.85rem; margin-top: 0.25rem; }
  .finding-evidence { background: #f8f8f8; padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.85rem; margin-top: 0.5rem; word-break: break-all; }
  .finding-fix { color: #388e3c; font-size: 0.9rem; margin-top: 0.5rem; }
  .no-findings { text-align: center; padding: 3rem; color: #388e3c; font-size: 1.2rem; }
</style>
</head>
<body>
<div class="container">
<h1>Security Scan Report</h1>

<div class="summary">
  <div class="stat-card"><div class="count">{{.Total}}</div><div class="label">Total</div></div>
  {{range $sev, $count := .Stats}}
  <div class="stat-card {{$sev}}"><div class="count">{{$count}}</div><div class="label">{{$sev}}</div></div>
  {{end}}
</div>

{{if eq .Total 0}}
<div class="no-findings">No security issues found.</div>
{{else}}
{{range .Checks}}
<h2>{{.}}</h2>
{{range index $.Grouped .}}
<div class="finding {{severityClass .Severity}}">
  <span class="badge {{severityClass .Severity}}">{{upper .Severity.String}}</span>
  {{.Message}}
  {{if .URL}}<div class="finding-url">{{.URL}}</div>{{end}}
  {{if .Evidence}}<div class="finding-evidence">{{.Evidence}}</div>{{end}}
  {{if .Fix}}<div class="finding-fix">Fix: {{.Fix}}</div>{{end}}
</div>
{{end}}
{{end}}
{{end}}

</div>
</body>
</html>`
