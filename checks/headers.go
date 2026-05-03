package checks

import (
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect"
)

// SecurityHeadersCheck audits HTTP response headers for security best practices.
// Replaces: securityheaders.com
type SecurityHeadersCheck struct{}

func (c *SecurityHeadersCheck) Name() string { return "security-headers" }

func (c *SecurityHeadersCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding

	// Headers that SHOULD be present
	required := []struct {
		header   string
		severity inspect.Severity
		fix      string
	}{
		{"Strict-Transport-Security", inspect.SeverityHigh, "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains"},
		{"Content-Security-Policy", inspect.SeverityMedium, "Add header: Content-Security-Policy: default-src 'self'"},
		{"X-Content-Type-Options", inspect.SeverityMedium, "Add header: X-Content-Type-Options: nosniff"},
		{"Referrer-Policy", inspect.SeverityLow, "Add header: Referrer-Policy: strict-origin-when-cross-origin"},
		{"Permissions-Policy", inspect.SeverityLow, "Add header: Permissions-Policy: camera=(), microphone=(), geolocation=()"},
	}

	for _, r := range required {
		if resp.Headers.Get(r.header) == "" {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: r.severity,
				URL:      resp.URL,
				Element:  r.header,
				Message:  fmt.Sprintf("Missing security header: %s", r.header),
				Fix:      r.fix,
			})
		}
	}

	// Headers that SHOULD be absent (information disclosure)
	disclose := []string{"Server", "X-Powered-By", "X-AspNet-Version", "X-AspNetMvc-Version"}
	for _, h := range disclose {
		if val := resp.Headers.Get(h); val != "" {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityLow,
				URL:      resp.URL,
				Element:  h,
				Message:  fmt.Sprintf("Information disclosure via %s header: %s", h, val),
				Fix:      fmt.Sprintf("Remove the %s header from responses", h),
				Evidence: val,
			})
		}
	}

	// CSP unsafe directives
	csp := resp.Headers.Get("Content-Security-Policy")
	if csp != "" {
		if strings.Contains(csp, "'unsafe-inline'") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityHigh,
				URL:      resp.URL,
				Element:  "Content-Security-Policy",
				Message:  "CSP contains 'unsafe-inline' which defeats XSS protection",
				Fix:      "Replace 'unsafe-inline' with nonce-based or hash-based CSP: script-src 'nonce-{RANDOM}' 'strict-dynamic'",
				Evidence: csp,
			})
		}
		if strings.Contains(csp, "'unsafe-eval'") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityHigh,
				URL:      resp.URL,
				Element:  "Content-Security-Policy",
				Message:  "CSP contains 'unsafe-eval' which enables code injection",
				Fix:      "Remove 'unsafe-eval' from script-src; refactor code to avoid eval()",
				Evidence: csp,
			})
		}
	}

	return findings
}
