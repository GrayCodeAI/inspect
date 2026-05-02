package report

import (
	"testing"
	"time"
)

func TestFormatTerminal_NoFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 10,
		Duration:    2 * time.Second,
	}
	out := FormatTerminal(data)
	if out == "" {
		t.Error("expected non-empty output")
	}
	if len(out) < 50 {
		t.Error("output too short")
	}
}

func TestFormatTerminal_WithFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 5,
		Duration:    1 * time.Second,
		Findings: []Finding{
			{Check: "security", Severity: SeverityHigh, URL: "https://example.com", Message: "Missing CSP"},
			{Check: "links", Severity: SeverityCritical, URL: "https://example.com/broken", Message: "404"},
			{Check: "a11y", Severity: SeverityMedium, URL: "https://example.com", Message: "Missing alt"},
		},
	}
	data.Stats.BySeverity = map[string]int{"CRITICAL": 1, "HIGH": 1, "MEDIUM": 1}
	data.Stats.ByCheck = map[string]int{"security": 1, "links": 1, "a11y": 1}

	out := FormatTerminal(data)
	if out == "" {
		t.Error("expected non-empty output")
	}
}

func TestFormatJSON(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    100 * time.Millisecond,
		Findings: []Finding{
			{Check: "links", Severity: SeverityHigh, URL: "https://example.com/x", Message: "broken"},
		},
	}
	out, err := FormatJSON(data)
	if err != nil {
		t.Fatalf("FormatJSON error: %v", err)
	}
	if out == "" {
		t.Error("expected non-empty JSON")
	}
}
