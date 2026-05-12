package inspect

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CIOutput formats findings for CI/CD pipeline consumption.
// Supports: GitHub Actions annotations, GitLab CI, SARIF, plain text.
type CIOutput struct {
	Format string // "github", "gitlab", "sarif", "text", "json"
}

// FormatFindings converts findings to CI-friendly output.
func (ci *CIOutput) FormatFindings(findings []Finding) string {
	switch ci.Format {
	case "github":
		return ci.formatGitHub(findings)
	case "gitlab":
		return ci.formatGitLab(findings)
	case "json":
		return ci.formatJSON(findings)
	default:
		return ci.formatText(findings)
	}
}

// formatGitHub creates GitHub Actions annotation format.
func (ci *CIOutput) formatGitHub(findings []Finding) string {
	var sb strings.Builder
	for _, f := range findings {
		level := "warning"
		if f.Severity == SeverityCritical || f.Severity == SeverityHigh {
			level = "error"
		} else if f.Severity == SeverityInfo {
			level = "notice"
		}
		sb.WriteString(fmt.Sprintf("::%s file=%s,line=%d::%s\n", level, f.URL, 0, f.Message))
	}
	return sb.String()
}

// formatGitLab creates GitLab CI Code Quality format.
func (ci *CIOutput) formatGitLab(findings []Finding) string {
	type glIssue struct {
		Description string `json:"description"`
		Severity    string `json:"severity"`
		Location    struct {
			Path  string `json:"path"`
			Lines struct {
				Begin int `json:"begin"`
			} `json:"lines"`
		} `json:"location"`
	}

	var issues []glIssue
	for _, f := range findings {
		issue := glIssue{Description: f.Message, Severity: mapSeverity(f.Severity)}
		issue.Location.Path = f.URL
		issue.Location.Lines.Begin = 0
		issues = append(issues, issue)
	}

	data, _ := json.MarshalIndent(issues, "", "  ")
	return string(data)
}

func (ci *CIOutput) formatJSON(findings []Finding) string {
	data, _ := json.MarshalIndent(findings, "", "  ")
	return string(data)
}

func (ci *CIOutput) formatText(findings []Finding) string {
	var sb strings.Builder
	for _, f := range findings {
		sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", f.Severity, f.URL, f.Message))
	}
	return sb.String()
}

func mapSeverity(s Severity) string {
	switch s {
	case SeverityCritical:
		return "critical"
	case SeverityHigh:
		return "major"
	case SeverityMedium:
		return "minor"
	default:
		return "info"
	}
}

// ExitCode returns the appropriate CI exit code based on findings.
// 0 = no issues, 1 = has high/critical findings.
func ExitCode(findings []Finding) int {
	for _, f := range findings {
		if f.Severity == SeverityCritical || f.Severity == SeverityHigh {
			return 1
		}
	}
	return 0
}
