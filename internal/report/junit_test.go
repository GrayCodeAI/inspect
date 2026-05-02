package report

import (
	"encoding/xml"
	"strings"
	"testing"
	"time"
)

func TestFormatJUnit_WithFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 5,
		Duration:    2 * time.Second,
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
				Message:  "Broken link returns 404",
				Element:  `<a href="/missing">`,
				Evidence: "Status: 404",
			},
			{
				Check:    "a11y",
				Severity: SeverityMedium,
				URL:      "https://example.com",
				Message:  "Image missing alt attribute",
			},
		},
	}

	output, err := FormatJUnit(data)
	if err != nil {
		t.Fatalf("FormatJUnit error: %v", err)
	}

	if output == "" {
		t.Fatal("expected non-empty output")
	}

	// Verify it starts with XML header
	if !strings.HasPrefix(output, `<?xml`) {
		t.Error("expected XML header")
	}

	// Verify valid XML
	var suites JUnitTestSuites
	err = xml.Unmarshal([]byte(strings.TrimPrefix(output, xml.Header)), &suites)
	if err != nil {
		t.Fatalf("invalid XML: %v", err)
	}

	if suites.Name != "inspect: https://example.com" {
		t.Errorf("unexpected suite name: %q", suites.Name)
	}

	// Should have suites for builtin checks
	if len(suites.Suites) == 0 {
		t.Error("expected at least one test suite")
	}

	// Verify failures are present
	if suites.Failures == 0 {
		t.Error("expected at least one failure")
	}

	// Verify total tests count
	if suites.Tests == 0 {
		t.Error("expected non-zero tests count")
	}

	// Check that the security suite has failures
	for _, suite := range suites.Suites {
		if suite.Name == "security" {
			if suite.Failures == 0 {
				t.Error("expected security suite to have failures")
			}
			for _, tc := range suite.Cases {
				if tc.Failure != nil {
					if tc.Failure.Message == "" {
						t.Error("failure message should not be empty")
					}
					if tc.Classname != "inspect.security" {
						t.Errorf("expected classname 'inspect.security', got %q", tc.Classname)
					}
				}
			}
		}
	}
}

func TestFormatJUnit_NoFindings(t *testing.T) {
	data := ReportData{
		Target:      "https://clean.example.com",
		CrawledURLs: 3,
		Duration:    1 * time.Second,
	}

	output, err := FormatJUnit(data)
	if err != nil {
		t.Fatalf("FormatJUnit error: %v", err)
	}

	var suites JUnitTestSuites
	err = xml.Unmarshal([]byte(strings.TrimPrefix(output, xml.Header)), &suites)
	if err != nil {
		t.Fatalf("invalid XML: %v", err)
	}

	// All suites should have 0 failures
	if suites.Failures != 0 {
		t.Errorf("expected 0 failures for clean report, got %d", suites.Failures)
	}

	// Each builtin check should have a passing test case
	for _, suite := range suites.Suites {
		if suite.Failures > 0 {
			t.Errorf("suite %q should have 0 failures, got %d", suite.Name, suite.Failures)
		}
		if suite.Tests != 1 {
			t.Errorf("suite %q should have 1 test (passing), got %d", suite.Name, suite.Tests)
		}
		for _, tc := range suite.Cases {
			if tc.Failure != nil {
				t.Errorf("passing test case should not have failure: %s", tc.Name)
			}
		}
	}
}

func TestFormatJUnit_CustomCheck(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    500 * time.Millisecond,
		Findings: []Finding{
			{
				Check:    "my-custom-rule",
				Severity: SeverityLow,
				URL:      "https://example.com",
				Message:  "Custom rule failed",
			},
		},
	}

	output, err := FormatJUnit(data)
	if err != nil {
		t.Fatalf("FormatJUnit error: %v", err)
	}

	var suites JUnitTestSuites
	err = xml.Unmarshal([]byte(strings.TrimPrefix(output, xml.Header)), &suites)
	if err != nil {
		t.Fatalf("invalid XML: %v", err)
	}

	foundCustom := false
	for _, suite := range suites.Suites {
		if suite.Name == "my-custom-rule" {
			foundCustom = true
			if suite.Failures != 1 {
				t.Errorf("expected 1 failure in custom suite, got %d", suite.Failures)
			}
		}
	}
	if !foundCustom {
		t.Error("expected to find custom check suite in output")
	}
}

func TestFormatJUnit_XMLContainsExpectedElements(t *testing.T) {
	data := ReportData{
		Target:      "https://example.com",
		CrawledURLs: 1,
		Duration:    100 * time.Millisecond,
		Findings: []Finding{
			{
				Check:    "security",
				Severity: SeverityHigh,
				URL:      "https://example.com",
				Message:  "Test finding",
				Fix:      "Test fix",
				Element:  "<div>",
				Evidence: "test evidence",
			},
		},
	}

	output, err := FormatJUnit(data)
	if err != nil {
		t.Fatalf("FormatJUnit error: %v", err)
	}

	// Check for expected XML elements
	// Note: XML encoding may escape < and > in CDATA content
	checks := []string{
		"<testsuites",
		"<testsuite",
		"<testcase",
		"<failure",
		"URL: https://example.com",
		"Fix: Test fix",
		"Evidence: test evidence",
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q", check)
		}
	}
}

func TestFormatFailureBody(t *testing.T) {
	f := Finding{
		URL:      "https://example.com",
		Element:  "<img>",
		Fix:      "Add alt text",
		Evidence: "src=photo.jpg",
	}

	body := formatFailureBody(f)
	if !strings.Contains(body, "URL: https://example.com") {
		t.Error("body should contain URL")
	}
	if !strings.Contains(body, "Element: <img>") {
		t.Error("body should contain Element")
	}
	if !strings.Contains(body, "Fix: Add alt text") {
		t.Error("body should contain Fix")
	}
	if !strings.Contains(body, "Evidence: src=photo.jpg") {
		t.Error("body should contain Evidence")
	}
}

func TestFormatFailureBody_MinimalFields(t *testing.T) {
	f := Finding{
		URL: "https://example.com",
	}

	body := formatFailureBody(f)
	if !strings.Contains(body, "URL:") {
		t.Error("body should contain URL")
	}
	if strings.Contains(body, "Element:") {
		t.Error("body should not contain Element when empty")
	}
	if strings.Contains(body, "Fix:") {
		t.Error("body should not contain Fix when empty")
	}
}

func TestIsBuiltinCheck(t *testing.T) {
	builtins := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	for _, name := range builtins {
		if !isBuiltinCheck(name) {
			t.Errorf("%q should be a builtin check", name)
		}
	}

	if isBuiltinCheck("custom") {
		t.Error("'custom' should not be a builtin check")
	}
	if isBuiltinCheck("") {
		t.Error("empty string should not be a builtin check")
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		input    time.Duration
		expected string
	}{
		{0, "0.000"},
		{1 * time.Second, "1.000"},
		{2500 * time.Millisecond, "2.500"},
		{100 * time.Millisecond, "0.100"},
	}

	for _, tt := range tests {
		got := formatDuration(tt.input)
		if got != tt.expected {
			t.Errorf("formatDuration(%v) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
