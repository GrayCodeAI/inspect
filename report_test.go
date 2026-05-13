package inspect

import (
	"encoding/xml"
	"strings"
	"testing"
)

func sampleFindings() []Finding {
	return []Finding{
		{Check: "api-cors", Severity: SeverityCritical, URL: "https://api.example.com/users", Message: "CORS allows all origins with credentials", Evidence: "Access-Control-Allow-Origin: *"},
		{Check: "api-cors", Severity: SeverityMedium, URL: "https://api.example.com/data", Message: "CORS reflects arbitrary origin", Fix: "Validate Origin header"},
		{Check: "api-security-headers", Severity: SeverityHigh, URL: "https://api.example.com/users", Message: "Missing security header: Strict-Transport-Security", Fix: "Add HSTS header"},
		{Check: "api-security-headers", Severity: SeverityMedium, URL: "https://api.example.com/users", Message: "Missing security header: X-Content-Type-Options"},
		{Check: "dependency-npm", Severity: SeverityCritical, URL: "package.json", Element: "lodash@4.17.15", Message: "CVE-2021-23337: Command injection", Fix: "Upgrade to 4.17.21"},
		{Check: "dependency-npm", Severity: SeverityHigh, URL: "package.json", Element: "axios@1.4.0", Message: "CVE-2023-45857: CSRF token exposure"},
		{Check: "api-jwt", Severity: SeverityLow, URL: "https://api.example.com", Message: "JWT uses HS256 algorithm"},
		{Check: "api-error-leakage", Severity: SeverityInfo, URL: "https://api.example.com/debug", Message: "Server version information disclosed"},
	}
}

func TestSeverityStats(t *testing.T) {
	findings := sampleFindings()
	stats := SeverityStats(findings)

	if stats["critical"] != 2 {
		t.Errorf("expected 2 critical, got %d", stats["critical"])
	}
	if stats["high"] != 2 {
		t.Errorf("expected 2 high, got %d", stats["high"])
	}
	if stats["medium"] != 2 {
		t.Errorf("expected 2 medium, got %d", stats["medium"])
	}
	if stats["low"] != 1 {
		t.Errorf("expected 1 low, got %d", stats["low"])
	}
	if stats["info"] != 1 {
		t.Errorf("expected 1 info, got %d", stats["info"])
	}
}

func TestSeverityStats_Empty(t *testing.T) {
	stats := SeverityStats(nil)
	if len(stats) != 0 {
		t.Errorf("expected empty stats for nil findings, got %v", stats)
	}
}

func TestGenerateHTML_Structure(t *testing.T) {
	findings := sampleFindings()
	html := GenerateHTML(findings)

	// Check basic structure
	if !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("expected DOCTYPE declaration")
	}
	if !strings.Contains(html, "<html") {
		t.Error("expected html tag")
	}
	if !strings.Contains(html, "Security Scan Report") {
		t.Error("expected report title")
	}

	// Check severity badges
	if !strings.Contains(html, "critical") {
		t.Error("expected critical class in HTML")
	}
	if !strings.Contains(html, "high") {
		t.Error("expected high class in HTML")
	}

	// Check findings content
	if !strings.Contains(html, "CORS allows all origins") {
		t.Error("expected finding message in HTML")
	}
	if !strings.Contains(html, "api-cors") {
		t.Error("expected check name in HTML")
	}
}

func TestGenerateHTML_Empty(t *testing.T) {
	html := GenerateHTML(nil)
	if !strings.Contains(html, "No security issues found") {
		t.Error("expected 'no issues' message for empty findings")
	}
}

func TestGenerateHTML_ValidTemplate(t *testing.T) {
	// Ensure no template errors with various inputs
	findings := []Finding{
		{Check: "test", Severity: SeverityCritical, URL: "http://example.com", Message: "Test <script>alert('xss')</script>"},
	}
	html := GenerateHTML(findings)
	if strings.Contains(html, "template error") {
		t.Error("template execution error detected")
	}
	// HTML template should escape special characters
	if strings.Contains(html, "<script>alert") {
		t.Error("expected HTML escaping of special characters")
	}
}

func TestGenerateMarkdown_Structure(t *testing.T) {
	findings := sampleFindings()
	md := GenerateMarkdown(findings)

	// Check headers
	if !strings.Contains(md, "# Security Scan Report") {
		t.Error("expected main heading")
	}
	if !strings.Contains(md, "## Summary") {
		t.Error("expected summary section")
	}
	if !strings.Contains(md, "## Findings") {
		t.Error("expected findings section")
	}

	// Check stats table
	if !strings.Contains(md, "| Severity | Count |") {
		t.Error("expected stats table")
	}
	if !strings.Contains(md, "CRITICAL") {
		t.Error("expected CRITICAL severity in table")
	}

	// Check grouping
	if !strings.Contains(md, "### api-cors") {
		t.Error("expected api-cors group heading")
	}
	if !strings.Contains(md, "### dependency-npm") {
		t.Error("expected dependency-npm group heading")
	}

	// Check finding details
	if !strings.Contains(md, "**[CRITICAL]**") {
		t.Error("expected severity badge")
	}
	if !strings.Contains(md, "Evidence:") {
		t.Error("expected evidence field")
	}
	if !strings.Contains(md, "Fix:") {
		t.Error("expected fix field")
	}
}

func TestGenerateMarkdown_Empty(t *testing.T) {
	md := GenerateMarkdown(nil)
	if !strings.Contains(md, "No findings detected") {
		t.Error("expected 'no findings' message for empty input")
	}
}

func TestGenerateMarkdown_TotalCount(t *testing.T) {
	findings := sampleFindings()
	md := GenerateMarkdown(findings)
	if !strings.Contains(md, "**Total findings:** 8") {
		t.Error("expected total count of 8")
	}
}

func TestGenerateJUnit_Structure(t *testing.T) {
	findings := sampleFindings()
	junit := GenerateJUnit(findings)

	// Check XML declaration
	if !strings.Contains(junit, "<?xml version=") {
		t.Error("expected XML declaration")
	}

	// Check it is valid XML
	var suites junitTestSuites
	if err := xml.Unmarshal([]byte(junit), &suites); err != nil {
		t.Fatalf("invalid XML output: %v", err)
	}

	// Check test suites exist
	if len(suites.Suites) == 0 {
		t.Fatal("expected test suites")
	}

	// Check that suites are grouped by check name
	suiteNames := make(map[string]bool)
	for _, s := range suites.Suites {
		suiteNames[s.Name] = true
	}
	if !suiteNames["api-cors"] {
		t.Error("expected api-cors suite")
	}
	if !suiteNames["dependency-npm"] {
		t.Error("expected dependency-npm suite")
	}
}

func TestGenerateJUnit_FailureDetails(t *testing.T) {
	findings := []Finding{
		{
			Check:    "test-check",
			Severity: SeverityHigh,
			URL:      "https://example.com",
			Element:  "button.submit",
			Message:  "Test finding",
			Evidence: "some evidence",
			Fix:      "fix it",
		},
	}

	junit := GenerateJUnit(findings)

	var suites junitTestSuites
	if err := xml.Unmarshal([]byte(junit), &suites); err != nil {
		t.Fatalf("invalid XML: %v", err)
	}

	if len(suites.Suites) != 1 {
		t.Fatalf("expected 1 suite, got %d", len(suites.Suites))
	}

	suite := suites.Suites[0]
	if suite.Name != "test-check" {
		t.Errorf("expected suite name 'test-check', got %q", suite.Name)
	}
	if suite.Tests != 1 {
		t.Errorf("expected 1 test, got %d", suite.Tests)
	}
	if suite.Failures != 1 {
		t.Errorf("expected 1 failure, got %d", suite.Failures)
	}

	tc := suite.Cases[0]
	if tc.Name != "Test finding" {
		t.Errorf("expected test case name 'Test finding', got %q", tc.Name)
	}
	if tc.Failure == nil {
		t.Fatal("expected failure element")
	}
	if tc.Failure.Type != "high" {
		t.Errorf("expected failure type 'high', got %q", tc.Failure.Type)
	}
	if !strings.Contains(tc.Failure.Content, "URL: https://example.com") {
		t.Error("expected URL in failure content")
	}
	if !strings.Contains(tc.Failure.Content, "Evidence: some evidence") {
		t.Error("expected evidence in failure content")
	}
	if !strings.Contains(tc.Failure.Content, "Fix: fix it") {
		t.Error("expected fix in failure content")
	}
}

func TestGenerateJUnit_Empty(t *testing.T) {
	junit := GenerateJUnit(nil)

	var suites junitTestSuites
	if err := xml.Unmarshal([]byte(junit), &suites); err != nil {
		t.Fatalf("invalid XML for empty findings: %v", err)
	}
	if len(suites.Suites) != 0 {
		t.Errorf("expected 0 suites for empty findings, got %d", len(suites.Suites))
	}
}

func TestGroupByCheck(t *testing.T) {
	findings := sampleFindings()
	grouped := groupByCheck(findings)

	if len(grouped["api-cors"]) != 2 {
		t.Errorf("expected 2 api-cors findings, got %d", len(grouped["api-cors"]))
	}
	if len(grouped["dependency-npm"]) != 2 {
		t.Errorf("expected 2 dependency-npm findings, got %d", len(grouped["dependency-npm"]))
	}
}

func TestGroupByCheck_EmptyCheck(t *testing.T) {
	findings := []Finding{
		{Message: "no check set"},
	}
	grouped := groupByCheck(findings)
	if len(grouped["unknown"]) != 1 {
		t.Error("expected finding with empty check to go into 'unknown' group")
	}
}

func TestSortedKeys(t *testing.T) {
	m := map[string][]Finding{
		"zebra": {},
		"alpha": {},
		"beta":  {},
	}
	keys := sortedKeys(m)
	if keys[0] != "alpha" || keys[1] != "beta" || keys[2] != "zebra" {
		t.Errorf("expected sorted keys, got %v", keys)
	}
}

func TestGenerateMarkdown_FindingURLPresent(t *testing.T) {
	findings := []Finding{
		{Check: "test", Severity: SeverityHigh, URL: "https://example.com/api", Message: "Test issue"},
	}
	md := GenerateMarkdown(findings)
	if !strings.Contains(md, "`https://example.com/api`") {
		t.Error("expected URL in markdown output")
	}
}

func TestGenerateJUnit_TestCountsMatchFindings(t *testing.T) {
	findings := sampleFindings()
	junit := GenerateJUnit(findings)

	var suites junitTestSuites
	if err := xml.Unmarshal([]byte(junit), &suites); err != nil {
		t.Fatal(err)
	}

	totalTests := 0
	totalFailures := 0
	for _, s := range suites.Suites {
		totalTests += s.Tests
		totalFailures += s.Failures
	}

	if totalTests != len(findings) {
		t.Errorf("expected %d total tests, got %d", len(findings), totalTests)
	}
	if totalFailures != len(findings) {
		t.Errorf("expected %d total failures, got %d", len(findings), totalFailures)
	}
}
