// Package report provides formatting utilities for scan results.
package report

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Severity mirrors the public type.
type Severity int

const (
	SeverityInfo Severity = iota
	SeverityLow
	SeverityMedium
	SeverityHigh
	SeverityCritical
)

var severityNames = [...]string{"INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"}
var severityColors = [...]string{"\033[36m", "\033[34m", "\033[33m", "\033[31m", "\033[35;1m"}

func (s Severity) String() string {
	if int(s) < len(severityNames) {
		return severityNames[s]
	}
	return "UNKNOWN"
}

// Finding for report rendering.
type Finding struct {
	Check    string   `json:"check"`
	Severity Severity `json:"severity"`
	URL      string   `json:"url"`
	Element  string   `json:"element,omitempty"`
	Message  string   `json:"message"`
	Fix      string   `json:"fix,omitempty"`
	Evidence string   `json:"evidence,omitempty"`
}

// ReportData holds all data needed for rendering.
type ReportData struct {
	Target      string        `json:"target"`
	Findings    []Finding     `json:"findings"`
	CrawledURLs int           `json:"crawled_urls"`
	Duration    time.Duration `json:"duration"`
	Stats       struct {
		BySeverity map[string]int `json:"by_severity"`
		ByCheck    map[string]int `json:"by_check"`
	} `json:"stats"`
}

// FormatTerminal renders a human-readable report for terminal output.
func FormatTerminal(data ReportData) string {
	var b strings.Builder
	reset := "\033[0m"

	b.WriteString("\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString(fmt.Sprintf("  INSPECT REPORT: %s\n", data.Target))
	b.WriteString(fmt.Sprintf("  Crawled %d pages in %s\n", data.CrawledURLs, data.Duration.Round(time.Millisecond)))
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

	if len(data.Findings) == 0 {
		b.WriteString("  ✓ No issues found.\n\n")
		return b.String()
	}

	grouped := map[Severity][]Finding{}
	order := []Severity{SeverityCritical, SeverityHigh, SeverityMedium, SeverityLow, SeverityInfo}
	for _, f := range data.Findings {
		grouped[f.Severity] = append(grouped[f.Severity], f)
	}

	for _, sev := range order {
		items := grouped[sev]
		if len(items) == 0 {
			continue
		}
		color := severityColors[sev]
		b.WriteString(fmt.Sprintf("  %s%s (%d)%s\n\n", color, sev.String(), len(items), reset))

		for _, f := range items {
			b.WriteString(fmt.Sprintf("    [%s] %s\n", f.Check, f.Message))
			b.WriteString(fmt.Sprintf("      URL: %s\n", f.URL))
			if f.Element != "" {
				b.WriteString(fmt.Sprintf("      Element: %s\n", f.Element))
			}
			if f.Fix != "" {
				b.WriteString(fmt.Sprintf("      Fix: %s\n", f.Fix))
			}
			if f.Evidence != "" {
				b.WriteString(fmt.Sprintf("      Evidence: %s\n", f.Evidence))
			}
			b.WriteString("\n")
		}
	}

	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString(fmt.Sprintf("  SUMMARY: %d findings", len(data.Findings)))
	if data.Stats.BySeverity != nil {
		parts := []string{}
		for _, sev := range order {
			count := data.Stats.BySeverity[sev.String()]
			if count > 0 {
				parts = append(parts, fmt.Sprintf("%d %s", count, sev.String()))
			}
		}
		if len(parts) > 0 {
			b.WriteString(" (" + strings.Join(parts, ", ") + ")")
		}
	}
	b.WriteString("\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

	return b.String()
}

// FormatJSON renders the report as machine-readable JSON.
func FormatJSON(data ReportData) (string, error) {
	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}
