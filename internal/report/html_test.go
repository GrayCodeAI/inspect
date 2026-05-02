package report

import (
	"strings"
	"testing"
	"time"
)

func TestFormatHTML_WithFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 10,
		Duration:    3 * time.Second,
		Findings: []Finding{
			{
				Check:    "security",
				Severity: SeverityHigh,
				URL:      "https://example.com",
				Message:  "Missing CSP header",
				Fix:      "Add Content-Security-Policy header",
			},
			{
				Check:    "links",
				Severity: SeverityCritical,
				URL:      "https://example.com/broken",
				Message:  "Broken link",
				Evidence: "Status: 404",
			},
			{
				Check:    "a11y",
				Severity: SeverityMedium,
				URL:      "https://example.com",
				Message:  "Missing alt text",
			},
			{
				Check:    "perf",
				Severity: SeverityLow,
				URL:      "https://example.com",
				Message:  "Large image",
			},
			{
				Check:    "seo",
				Severity: SeverityInfo,
				URL:      "https://example.com",
				Message:  "Missing meta description",
			},
		},
	}

	output, err := FormatHTML(data)
	if err != nil {
		t.Fatalf("FormatHTML error: %v", err)
	}

	if output == "" {
		t.Fatal("expected non-empty output")
	}

	// Check it's valid HTML
	if !strings.Contains(output, "<!DOCTYPE html>") {
		t.Error("expected DOCTYPE")
	}
	if !strings.Contains(output, "<html") {
		t.Error("expected <html> tag")
	}
	if !strings.Contains(output, "</html>") {
		t.Error("expected closing </html> tag")
	}

	// Check target appears
	if !strings.Contains(output, "https://example.com") {
		t.Error("expected target URL in output")
	}

	// Check findings content appears
	if !strings.Contains(output, "Missing CSP header") {
		t.Error("expected finding message in output")
	}
	if !strings.Contains(output, "Broken link") {
		t.Error("expected broken link finding in output")
	}

	// Check severity classes
	if !strings.Contains(output, `class="finding high"`) {
		t.Error("expected high severity class")
	}
	if !strings.Contains(output, `class="finding critical"`) {
		t.Error("expected critical severity class")
	}
	if !strings.Contains(output, `class="finding medium"`) {
		t.Error("expected medium severity class")
	}

	// Check fix suggestion appears
	if !strings.Contains(output, "Add Content-Security-Policy header") {
		t.Error("expected fix suggestion in output")
	}

	// Check evidence appears
	if !strings.Contains(output, "Status: 404") {
		t.Error("expected evidence in output")
	}

	// Check the summary cards
	if !strings.Contains(output, "10") { // crawled URLs
		t.Error("expected crawled URLs count in output")
	}

	// Check title
	if !strings.Contains(output, "Inspect Report") {
		t.Error("expected report title")
	}

	// Check CSS is included (self-contained)
	if !strings.Contains(output, "<style>") {
		t.Error("expected inline CSS in self-contained HTML")
	}

	// Check JavaScript is included
	if !strings.Contains(output, "<script>") {
		t.Error("expected inline JavaScript for filtering")
	}
}

func TestFormatHTML_NoFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://clean.example.com",
		CrawledURLs: 5,
		Duration:    500 * time.Millisecond,
	}

	output, err := FormatHTML(data)
	if err != nil {
		t.Fatalf("FormatHTML error: %v", err)
	}

	if !strings.Contains(output, "https://clean.example.com") {
		t.Error("expected target in output")
	}

	// Findings section should indicate 0
	if !strings.Contains(output, "Findings (0)") {
		t.Error("expected 'Findings (0)' for empty report")
	}
}

func TestFormatHTML_EscapesHTML(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    100 * time.Millisecond,
		Findings: []Finding{
			{
				Check:    "security",
				Severity: SeverityHigh,
				URL:      "https://example.com",
				Message:  `XSS attempt: <script>alert("hi")</script>`,
			},
		},
	}

	output, err := FormatHTML(data)
	if err != nil {
		t.Fatalf("FormatHTML error: %v", err)
	}

	// The HTML template should escape the XSS attempt
	if strings.Contains(output, `<script>alert("hi")</script>`) {
		t.Error("HTML template should escape potential XSS in finding messages")
	}
}

func TestFormatHTML_ContainsFilterButtons(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    100 * time.Millisecond,
		Findings: []Finding{
			{Check: "links", Severity: SeverityHigh, URL: "https://example.com", Message: "test"},
		},
	}

	output, err := FormatHTML(data)
	if err != nil {
		t.Fatalf("FormatHTML error: %v", err)
	}

	// Check filter buttons exist
	if !strings.Contains(output, "filterAll()") {
		t.Error("expected filterAll function")
	}
	if !strings.Contains(output, "filter('critical')") {
		t.Error("expected critical filter button")
	}
	if !strings.Contains(output, "filter('high')") {
		t.Error("expected high filter button")
	}
}

func TestFormatHTML_GeneratedFooter(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    100 * time.Millisecond,
	}

	output, err := FormatHTML(data)
	if err != nil {
		t.Fatalf("FormatHTML error: %v", err)
	}

	if !strings.Contains(output, "Generated by") {
		t.Error("expected generated footer")
	}
	if !strings.Contains(output, "Inspect") {
		t.Error("expected 'Inspect' in footer")
	}
}
