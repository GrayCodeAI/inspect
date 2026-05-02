// Package inspect crawls websites and detects broken links, security issues,
// form problems, accessibility violations, and performance concerns.
//
// It is designed as a standalone library imported by hawk — it has no CLI,
// no LLM dependency, and no TUI. Hawk wires inspect into its own commands.
//
// Usage:
//
//	report, err := inspect.Scan(ctx, "https://example.com", inspect.Standard)
//	for _, f := range report.Findings {
//	    fmt.Printf("[%s] %s: %s\n", f.Severity, f.URL, f.Message)
//	}
//
// For high-throughput or repeated scans, use the reusable Scanner:
//
//	scanner := inspect.NewScanner(inspect.Standard)
//	r1, _ := scanner.Scan(ctx, "https://site-a.com")
//	r2, _ := scanner.Scan(ctx, "https://site-b.com")
package inspect

import (
	"context"
	"time"
)

// Finding represents a single issue detected during a scan.
type Finding struct {
	Check    string   `json:"check"`
	Severity Severity `json:"severity"`
	URL      string   `json:"url"`
	Element  string   `json:"element,omitempty"`
	Message  string   `json:"message"`
	Fix      string   `json:"fix,omitempty"`
	Evidence string   `json:"evidence,omitempty"`
}

// Stats provides scan metrics, broken down by severity and check type.
type Stats struct {
	PagesScanned     int                       `json:"pages_scanned"`
	FindingsTotal    int                       `json:"findings_total"`
	BySeverity       map[Severity]int          `json:"by_severity"`
	ByCheck          map[string]int            `json:"by_check"`
	DurationPerCheck map[string]time.Duration  `json:"duration_per_check"`
}

// Report is the complete result of a scan operation.
type Report struct {
	Target      string        `json:"target"`
	Findings    []Finding     `json:"findings"`
	Stats       Stats         `json:"stats"`
	CrawledURLs int           `json:"crawled_urls"`
	Duration    time.Duration `json:"duration"`
	FailOn      Severity      `json:"fail_on"`
}

// Failed returns true if any finding meets or exceeds the configured fail threshold.
func (r *Report) Failed() bool {
	for _, f := range r.Findings {
		if f.Severity.AtLeast(r.FailOn) {
			return true
		}
	}
	return false
}

// MaxSeverity returns the highest severity found in the report.
func (r *Report) MaxSeverity() Severity {
	max := SeverityInfo
	for _, f := range r.Findings {
		if f.Severity > max {
			max = f.Severity
		}
	}
	return max
}

// Scan crawls the target URL and runs all configured checks.
// This is the primary entry point for one-off scans.
func Scan(ctx context.Context, target string, opts ...Option) (*Report, error) {
	s := NewScanner(opts...)
	return s.Scan(ctx, target)
}
