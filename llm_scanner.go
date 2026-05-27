package inspect

import (
	"context"
	"fmt"
	"strings"
)

// LLMSecurityScanner enhances traditional SAST with LLM-based analysis.
// Research shows LLM+SAST hybrid reduces false positives by 91%
// (SAST-Genius, IEEE S&P 2025).
type LLMSecurityScanner struct {
	checks []SecurityCheck
}

// SecurityCheck represents a security check.
type SecurityCheck struct {
	ID          string
	Name        string
	Description string
	Category    string // "injection", "auth", "crypto", "config", "data"
	Severity    string // "critical", "high", "medium", "low"
	Check       func(ctx context.Context, source string, filePath string) []SecurityFinding
}

// SecurityFinding represents a security finding.
type SecurityFinding struct {
	CheckID    string  `json:"check_id"`
	Rule       string  `json:"rule"`
	Message    string  `json:"message"`
	File       string  `json:"file"`
	Line       int     `json:"line"`
	Severity   string  `json:"severity"`
	Confidence float64 `json:"confidence"` // 0-1
	CWE        string  `json:"cwe"`        // CWE ID if applicable
	Evidence   string  `json:"evidence"`
	Suggestion string  `json:"suggestion"` // how to fix
}

// NewLLMSecurityScanner creates a security scanner with built-in checks.
func NewLLMSecurityScanner() *LLMSecurityScanner {
	s := &LLMSecurityScanner{}
	s.registerBuiltinChecks()
	return s
}

// Scan runs all security checks on the given source code.
func (s *LLMSecurityScanner) Scan(ctx context.Context, source string, filePath string) []SecurityFinding {
	var findings []SecurityFinding

	for _, check := range s.checks {
		results := check.Check(ctx, source, filePath)
		findings = append(findings, results...)
	}

	return findings
}

// BuildEnhancedPrompt builds a prompt that combines SAST findings with
// LLM analysis capabilities. This is the key innovation from SAST-Genius.
func (s *LLMSecurityScanner) BuildEnhancedPrompt(findings []SecurityFinding, source string) string {
	var prompt strings.Builder

	prompt.WriteString("## Security Analysis Request\n\n")
	prompt.WriteString("You are a security expert reviewing code. The following static analysis ")
	prompt.WriteString("findings were detected. Your job is to:\n")
	prompt.WriteString("1. Verify each finding (many are false positives)\n")
	prompt.WriteString("2. Identify additional security issues SAST missed\n")
	prompt.WriteString("3. Provide actionable remediation advice\n\n")

	if len(findings) > 0 {
		prompt.WriteString(fmt.Sprintf("### SAST Findings (%d detected)\n\n", len(findings)))
		for _, f := range findings {
			prompt.WriteString(fmt.Sprintf("- **%s** [%s] at %s:%d\n  %s\n  CWE: %s\n  Evidence: `%s`\n\n",
				f.Rule, f.Severity, f.File, f.Line, f.Message, f.CWE, truncateStr(f.Evidence, 100)))
		}
	} else {
		prompt.WriteString("### No SAST Findings\n\n")
		prompt.WriteString("No static analysis issues detected. Focus on logic vulnerabilities.\n\n")
	}

	prompt.WriteString("### Source Code\n\n")
	prompt.WriteString("```go\n")
	prompt.WriteString(source)
	prompt.WriteString("\n```\n")

	return prompt.String()
}

// registerBuiltinChecks adds common security checks.
func (s *LLMSecurityScanner) registerBuiltinChecks() {
	// SQL Injection
	s.checks = append(s.checks, SecurityCheck{
		ID:       "sql-injection",
		Name:     "SQL Injection",
		Category: "injection",
		Severity: "critical",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			for i, line := range lines {
				if strings.Contains(line, "fmt.Sprintf") && strings.Contains(line, "SELECT") {
					findings = append(findings, SecurityFinding{
						CheckID:    "sql-injection",
						Rule:       "SQL Injection",
						Message:    "Potential SQL injection via fmt.Sprintf",
						File:       filePath,
						Line:       i + 1,
						Severity:   "critical",
						Confidence: 0.7,
						CWE:        "CWE-89",
						Evidence:   strings.TrimSpace(line),
						Suggestion: "Use parameterized queries instead of string formatting",
					})
				}
			}
			return findings
		},
	})

	// Command Injection
	s.checks = append(s.checks, SecurityCheck{
		ID:       "command-injection",
		Name:     "Command Injection",
		Category: "injection",
		Severity: "critical",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			for i, line := range lines {
				if strings.Contains(line, "exec.Command") && strings.Contains(line, "+") {
					findings = append(findings, SecurityFinding{
						CheckID:    "command-injection",
						Rule:       "Command Injection",
						Message:    "Potential command injection via string concatenation",
						File:       filePath,
						Line:       i + 1,
						Severity:   "critical",
						Confidence: 0.6,
						CWE:        "CWE-78",
						Evidence:   strings.TrimSpace(line),
						Suggestion: "Use exec.Command with separate arguments, not string concatenation",
					})
				}
			}
			return findings
		},
	})

	// Path Traversal
	s.checks = append(s.checks, SecurityCheck{
		ID:       "path-traversal",
		Name:     "Path Traversal",
		Category: "injection",
		Severity: "high",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			for i, line := range lines {
				if strings.Contains(line, "../") && (strings.Contains(line, "Open") || strings.Contains(line, "ReadFile")) {
					findings = append(findings, SecurityFinding{
						CheckID:    "path-traversal",
						Rule:       "Path Traversal",
						Message:    "Potential path traversal with ../",
						File:       filePath,
						Line:       i + 1,
						Severity:   "high",
						Confidence: 0.5,
						CWE:        "CWE-22",
						Evidence:   strings.TrimSpace(line),
						Suggestion: "Validate and sanitize file paths, use filepath.Clean",
					})
				}
			}
			return findings
		},
	})

	// Weak Crypto
	s.checks = append(s.checks, SecurityCheck{
		ID:       "weak-crypto",
		Name:     "Weak Cryptography",
		Category: "crypto",
		Severity: "high",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			weakPatterns := []string{"md5", "sha1", "DES", "RC4"}
			for i, line := range lines {
				lower := strings.ToLower(line)
				for _, pattern := range weakPatterns {
					if strings.Contains(lower, strings.ToLower(pattern)) {
						findings = append(findings, SecurityFinding{
							CheckID:    "weak-crypto",
							Rule:       "Weak Cryptography",
							Message:    fmt.Sprintf("Weak cryptographic algorithm: %s", pattern),
							File:       filePath,
							Line:       i + 1,
							Severity:   "high",
							Confidence: 0.6,
							CWE:        "CWE-327",
							Evidence:   strings.TrimSpace(line),
							Suggestion: "Use SHA-256 or stronger algorithms",
						})
					}
				}
			}
			return findings
		},
	})

	// Hardcoded Credentials
	s.checks = append(s.checks, SecurityCheck{
		ID:       "hardcoded-creds",
		Name:     "Hardcoded Credentials",
		Category: "auth",
		Severity: "critical",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			credPatterns := []string{"password", "secret", "api_key", "apikey", "token", "private_key"}
			for i, line := range lines {
				lower := strings.ToLower(line)
				for _, pattern := range credPatterns {
					if strings.Contains(lower, pattern) && strings.Contains(line, "=") && strings.Contains(line, "\"") {
						if !strings.Contains(lower, "test") && !strings.Contains(lower, "example") {
							findings = append(findings, SecurityFinding{
								CheckID:    "hardcoded-creds",
								Rule:       "Hardcoded Credentials",
								Message:    fmt.Sprintf("Potential hardcoded %s", pattern),
								File:       filePath,
								Line:       i + 1,
								Severity:   "critical",
								Confidence: 0.5,
								CWE:        "CWE-798",
								Evidence:   strings.TrimSpace(line),
								Suggestion: "Use environment variables or a secrets manager",
							})
						}
					}
				}
			}
			return findings
		},
	})

	// Missing Error Handling
	s.checks = append(s.checks, SecurityCheck{
		ID:       "missing-error-check",
		Name:     "Missing Error Check",
		Category: "data",
		Severity: "medium",
		Check: func(ctx context.Context, source, filePath string) []SecurityFinding {
			var findings []SecurityFinding
			lines := strings.Split(source, "\n")
			for i, line := range lines {
				trimmed := strings.TrimSpace(line)
				if strings.Contains(trimmed, "(") && strings.Contains(trimmed, ")") &&
					!strings.Contains(trimmed, ":=") && !strings.Contains(trimmed, "=") &&
					!strings.HasPrefix(trimmed, "//") && !strings.HasPrefix(trimmed, "defer") &&
					!strings.HasPrefix(trimmed, "go ") && !strings.HasPrefix(trimmed, "if ") &&
					!strings.HasPrefix(trimmed, "for ") && !strings.HasPrefix(trimmed, "return ") &&
					!strings.HasPrefix(trimmed, "func ") && len(trimmed) > 10 {
					findings = append(findings, SecurityFinding{
						CheckID:    "missing-error-check",
						Rule:       "Missing Error Check",
						Message:    "Possible unchecked error return",
						File:       filePath,
						Line:       i + 1,
						Severity:   "medium",
						Confidence: 0.3,
						CWE:        "CWE-252",
						Evidence:   trimmed,
						Suggestion: "Check error return values",
					})
				}
			}
			return findings
		},
	})
}

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
