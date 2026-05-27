package inspect

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestGenerateSARIF_Structure(t *testing.T) {
	findings := sampleFindings()
	sarif := GenerateSARIF(findings, "1.0.0")

	// Must be valid JSON
	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	// Check SARIF version
	if log.Version != "2.1.0" {
		t.Errorf("expected SARIF version 2.1.0, got %s", log.Version)
	}

	// Check schema URL
	if !strings.Contains(log.Schema, "sarif-schema-2.1.0.json") {
		t.Error("expected SARIF 2.1.0 schema URL")
	}

	// Must have exactly one run
	if len(log.Runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(log.Runs))
	}

	run := log.Runs[0]

	// Check tool driver
	if run.Tool.Driver.Name != "inspect" {
		t.Errorf("expected tool name 'inspect', got %q", run.Tool.Driver.Name)
	}
	if run.Tool.Driver.Version != "1.0.0" {
		t.Errorf("expected tool version '1.0.0', got %q", run.Tool.Driver.Version)
	}
	if run.Tool.Driver.InformationURI == "" {
		t.Error("expected informationUri to be set")
	}

	// Check results exist
	if len(run.Results) == 0 {
		t.Fatal("expected SARIF results")
	}

	// Each finding should produce a result
	if len(run.Results) != len(findings) {
		t.Errorf("expected %d results, got %d", len(findings), len(run.Results))
	}
}

func TestGenerateSARIF_EmptyFindings(t *testing.T) {
	sarif := GenerateSARIF(nil, "1.0.0")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON for empty findings: %v", err)
	}

	if len(log.Runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(log.Runs))
	}

	run := log.Runs[0]
	if len(run.Results) != 0 {
		t.Errorf("expected 0 results for empty findings, got %d", len(run.Results))
	}
	if len(run.Tool.Driver.Rules) != 0 {
		t.Errorf("expected 0 rules for empty findings, got %d", len(run.Tool.Driver.Rules))
	}
}

func TestGenerateSARIF_DefaultVersion(t *testing.T) {
	sarif := GenerateSARIF(nil, "")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	if log.Runs[0].Tool.Driver.Version != "dev" {
		t.Errorf("expected 'dev' version for empty string, got %q", log.Runs[0].Tool.Driver.Version)
	}
}

func TestGenerateSARIF_RulesFromChecks(t *testing.T) {
	findings := []Finding{
		{Check: "api-cors", Severity: SeverityHigh, URL: "https://example.com", Message: "CORS issue"},
		{Check: "api-cors", Severity: SeverityMedium, URL: "https://example.com/other", Message: "Another CORS issue"},
		{Check: "security-headers", Severity: SeverityLow, URL: "https://example.com", Message: "Missing header"},
	}

	sarif := GenerateSARIF(findings, "test")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	rules := log.Runs[0].Tool.Driver.Rules
	if len(rules) != 2 {
		t.Fatalf("expected 2 unique rules, got %d", len(rules))
	}

	ruleIDs := make(map[string]bool)
	for _, r := range rules {
		ruleIDs[r.ID] = true
		if r.ShortDescription.Text == "" {
			t.Errorf("rule %q should have a short description", r.ID)
		}
	}
	if !ruleIDs["api-cors"] {
		t.Error("expected api-cors rule")
	}
	if !ruleIDs["security-headers"] {
		t.Error("expected security-headers rule")
	}
}

func TestGenerateSARIF_SeverityLevels(t *testing.T) {
	tests := []struct {
		severity Severity
		want     string
	}{
		{SeverityCritical, "error"},
		{SeverityHigh, "error"},
		{SeverityMedium, "warning"},
		{SeverityLow, "note"},
		{SeverityInfo, "none"},
	}

	for _, tt := range tests {
		findings := []Finding{
			{Check: "test", Severity: tt.severity, URL: "https://example.com", Message: "test"},
		}
		sarif := GenerateSARIF(findings, "test")

		var log sarifLog
		if err := json.Unmarshal([]byte(sarif), &log); err != nil {
			t.Fatalf("invalid SARIF JSON for severity %v: %v", tt.severity, err)
		}

		result := log.Runs[0].Results[0]
		if result.Level != tt.want {
			t.Errorf("severity %v: expected level %q, got %q", tt.severity, tt.want, result.Level)
		}
	}
}

func TestGenerateSARIF_ResultLocations(t *testing.T) {
	findings := []Finding{
		{Check: "test", Severity: SeverityHigh, URL: "https://example.com/page", Message: "issue with URL"},
		{Check: "test", Severity: SeverityLow, Message: "issue without URL"},
	}

	sarif := GenerateSARIF(findings, "test")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	// First result should have a location
	r0 := log.Runs[0].Results[0]
	if len(r0.Locations) != 1 {
		t.Fatalf("expected 1 location for first result, got %d", len(r0.Locations))
	}
	if r0.Locations[0].PhysicalLocation == nil {
		t.Fatal("expected physicalLocation")
	}
	if r0.Locations[0].PhysicalLocation.ArtifactLocation.URI != "https://example.com/page" {
		t.Errorf("unexpected URI: %s", r0.Locations[0].PhysicalLocation.ArtifactLocation.URI)
	}

	// Second result should have no locations
	r1 := log.Runs[0].Results[1]
	if len(r1.Locations) != 0 {
		t.Errorf("expected 0 locations for result without URL, got %d", len(r1.Locations))
	}
}

func TestGenerateSARIF_EvidenceInMessage(t *testing.T) {
	findings := []Finding{
		{Check: "test", Severity: SeverityHigh, URL: "https://example.com", Message: "issue found", Evidence: "header value was bad"},
	}

	sarif := GenerateSARIF(findings, "test")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	msg := log.Runs[0].Results[0].Message.Text
	if !strings.Contains(msg, "issue found") {
		t.Error("expected message to contain finding message")
	}
	if !strings.Contains(msg, "Evidence: header value was bad") {
		t.Error("expected message to contain evidence")
	}
}

func TestGenerateSARIF_UnknownCheck(t *testing.T) {
	findings := []Finding{
		{Severity: SeverityMedium, URL: "https://example.com", Message: "no check set"},
	}

	sarif := GenerateSARIF(findings, "test")

	var log sarifLog
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("invalid SARIF JSON: %v", err)
	}

	if log.Runs[0].Results[0].RuleID != "unknown" {
		t.Errorf("expected ruleId 'unknown', got %q", log.Runs[0].Results[0].RuleID)
	}

	if len(log.Runs[0].Tool.Driver.Rules) != 1 || log.Runs[0].Tool.Driver.Rules[0].ID != "unknown" {
		t.Error("expected 'unknown' rule in rules list")
	}
}

func TestSeverityToSARIFLevel(t *testing.T) {
	tests := []struct {
		sev  Severity
		want string
	}{
		{SeverityCritical, "error"},
		{SeverityHigh, "error"},
		{SeverityMedium, "warning"},
		{SeverityLow, "note"},
		{SeverityInfo, "none"},
		{Severity(99), "error"},
	}

	for _, tt := range tests {
		got := severityToSARIFLevel(tt.sev)
		if got != tt.want {
			t.Errorf("severityToSARIFLevel(%d) = %q, want %q", tt.sev, got, tt.want)
		}
	}
}
