package inspect

import (
	"encoding/json"
	"strings"
	"testing"
)

func sampleCIFindings() []Finding {
	return []Finding{
		{Check: "security", Severity: SeverityCritical, URL: "https://example.com", Message: "Exposed API key"},
		{Check: "security", Severity: SeverityHigh, URL: "https://example.com/page", Message: "Missing CSP"},
		{Check: "links", Severity: SeverityMedium, URL: "https://example.com/broken", Message: "Broken link"},
		{Check: "a11y", Severity: SeverityLow, URL: "https://example.com", Message: "Missing alt text"},
		{Check: "seo", Severity: SeverityInfo, URL: "https://example.com", Message: "Missing meta description"},
	}
}

func TestCIOutput_TextFormat(t *testing.T) {
	ci := &CIOutput{Format: "text"}
	findings := sampleCIFindings()
	out := ci.FormatFindings(findings)

	if out == "" {
		t.Fatal("expected non-empty text output")
	}

	// Should contain each finding line
	if !strings.Contains(out, "critical") {
		t.Error("expected critical severity in text output")
	}
	if !strings.Contains(out, "https://example.com") {
		t.Error("expected URL in text output")
	}
	if !strings.Contains(out, "Exposed API key") {
		t.Error("expected finding message in text output")
	}

	// Count lines — should match number of findings
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != len(findings) {
		t.Errorf("expected %d lines, got %d", len(findings), len(lines))
	}
}

func TestCIOutput_GitHubFormat(t *testing.T) {
	ci := &CIOutput{Format: "github"}
	findings := sampleCIFindings()
	out := ci.FormatFindings(findings)

	if out == "" {
		t.Fatal("expected non-empty GitHub output")
	}

	// Critical/High should use ::error
	if !strings.Contains(out, "::error") {
		t.Error("expected ::error annotation for critical/high findings")
	}

	// Info should use ::notice
	if !strings.Contains(out, "::notice") {
		t.Error("expected ::notice annotation for info findings")
	}

	// Medium/Low should use ::warning
	if !strings.Contains(out, "::warning") {
		t.Error("expected ::warning annotation for medium/low findings")
	}

	// Should contain file= format
	if !strings.Contains(out, "file=") {
		t.Error("expected file= in GitHub annotation")
	}
}

func TestCIOutput_GitLabFormat(t *testing.T) {
	ci := &CIOutput{Format: "gitlab"}
	findings := sampleCIFindings()
	out := ci.FormatFindings(findings)

	if out == "" {
		t.Fatal("expected non-empty GitLab output")
	}

	// Should be valid JSON
	var issues []struct {
		Description string `json:"description"`
		Severity    string `json:"severity"`
		Location    struct {
			Path string `json:"path"`
		} `json:"location"`
	}
	if err := json.Unmarshal([]byte(out), &issues); err != nil {
		t.Fatalf("invalid GitLab JSON: %v", err)
	}

	if len(issues) != len(findings) {
		t.Errorf("expected %d issues, got %d", len(findings), len(issues))
	}

	// Check severity mapping
	for _, issue := range issues {
		switch issue.Severity {
		case "critical", "major", "minor", "info":
			// valid
		default:
			t.Errorf("unexpected severity %q in GitLab output", issue.Severity)
		}
	}

	// Check that critical maps to "critical"
	foundCritical := false
	for _, issue := range issues {
		if issue.Severity == "critical" {
			foundCritical = true
		}
	}
	if !foundCritical {
		t.Error("expected critical severity in GitLab output")
	}
}

func TestCIOutput_JSONFormat(t *testing.T) {
	ci := &CIOutput{Format: "json"}
	findings := sampleCIFindings()
	out := ci.FormatFindings(findings)

	if out == "" {
		t.Fatal("expected non-empty JSON output")
	}

	// Should be valid JSON array
	var parsed []Finding
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}

	if len(parsed) != len(findings) {
		t.Errorf("expected %d findings, got %d", len(findings), len(parsed))
	}

	// Check first finding details
	if parsed[0].Check != "security" {
		t.Errorf("expected check 'security', got %q", parsed[0].Check)
	}
	if parsed[0].Severity != SeverityCritical {
		t.Errorf("expected severity critical, got %v", parsed[0].Severity)
	}
}

func TestCIOutput_DefaultIsText(t *testing.T) {
	ci := &CIOutput{Format: "unknown"}
	findings := []Finding{
		{Check: "test", Severity: SeverityHigh, URL: "https://example.com", Message: "test issue"},
	}
	out := ci.FormatFindings(findings)

	// Should fall back to text format
	if !strings.Contains(out, "[") || !strings.Contains(out, "https://example.com") {
		t.Error("expected text format as default fallback")
	}
}

func TestCIOutput_EmptyFindings(t *testing.T) {
	formats := []string{"text", "github", "gitlab", "json"}
	for _, format := range formats {
		ci := &CIOutput{Format: format}
		out := ci.FormatFindings(nil)
		// Should not panic and should return valid output
		switch format {
		case "gitlab":
			var issues []interface{}
			if err := json.Unmarshal([]byte(out), &issues); err != nil {
				t.Errorf("gitlab: invalid JSON for empty findings: %v", err)
			}
		case "json":
			var findings []interface{}
			if err := json.Unmarshal([]byte(out), &findings); err != nil {
				t.Errorf("json: invalid JSON for empty findings: %v", err)
			}
		default:
			// text/github return empty string for no findings — that's fine
		}
	}
}

func TestExitCode_NoFindings(t *testing.T) {
	code := ExitCode(nil)
	if code != 0 {
		t.Errorf("expected exit code 0 for no findings, got %d", code)
	}
}

func TestExitCode_LowAndInfoOnly(t *testing.T) {
	findings := []Finding{
		{Severity: SeverityLow, Message: "minor"},
		{Severity: SeverityInfo, Message: "info"},
		{Severity: SeverityMedium, Message: "medium"},
	}
	code := ExitCode(findings)
	if code != 0 {
		t.Errorf("expected exit code 0 for low/medium findings, got %d", code)
	}
}

func TestExitCode_HighFinding(t *testing.T) {
	findings := []Finding{
		{Severity: SeverityLow, Message: "minor"},
		{Severity: SeverityHigh, Message: "major"},
	}
	code := ExitCode(findings)
	if code != 1 {
		t.Errorf("expected exit code 1 for high finding, got %d", code)
	}
}

func TestExitCode_CriticalFinding(t *testing.T) {
	findings := []Finding{
		{Severity: SeverityCritical, Message: "critical issue"},
	}
	code := ExitCode(findings)
	if code != 1 {
		t.Errorf("expected exit code 1 for critical finding, got %d", code)
	}
}

func TestMapSeverity(t *testing.T) {
	tests := []struct {
		sev  Severity
		want string
	}{
		{SeverityCritical, "critical"},
		{SeverityHigh, "major"},
		{SeverityMedium, "minor"},
		{SeverityLow, "info"},
		{SeverityInfo, "info"},
	}

	for _, tt := range tests {
		got := mapSeverity(tt.sev)
		if got != tt.want {
			t.Errorf("mapSeverity(%d) = %q, want %q", tt.sev, got, tt.want)
		}
	}
}

func TestCIOutput_GitHubFormat_LineContent(t *testing.T) {
	ci := &CIOutput{Format: "github"}
	findings := []Finding{
		{Check: "security", Severity: SeverityCritical, URL: "/path/to/file.js", Message: "Critical issue"},
	}
	out := ci.FormatFindings(findings)

	// GitHub format: ::error file=/path/to/file.js,line=0::Critical issue
	if !strings.Contains(out, "::error file=/path/to/file.js") {
		t.Error("expected file path in GitHub annotation")
	}
	if !strings.Contains(out, "Critical issue") {
		t.Error("expected message in GitHub annotation")
	}
}
