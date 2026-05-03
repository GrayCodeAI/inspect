package checks

import (
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect"
)

// CookieSecurityCheck audits Set-Cookie headers for security flags.
type CookieSecurityCheck struct{}

func (c *CookieSecurityCheck) Name() string { return "cookie-security" }

func (c *CookieSecurityCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding

	cookies := resp.Headers.Values("Set-Cookie")
	for _, cookie := range cookies {
		lower := strings.ToLower(cookie)
		name := extractCookieName(cookie)

		if !strings.Contains(lower, "secure") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityHigh,
				URL:      resp.URL,
				Element:  name,
				Message:  fmt.Sprintf("Cookie '%s' missing Secure flag (transmitted over HTTP)", name),
				Fix:      "Add Secure flag: Set-Cookie: " + name + "=...; Secure",
				Evidence: cookie,
			})
		}

		if !strings.Contains(lower, "httponly") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityMedium,
				URL:      resp.URL,
				Element:  name,
				Message:  fmt.Sprintf("Cookie '%s' missing HttpOnly flag (accessible via JavaScript)", name),
				Fix:      "Add HttpOnly flag: Set-Cookie: " + name + "=...; HttpOnly",
				Evidence: cookie,
			})
		}

		if !strings.Contains(lower, "samesite") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityMedium,
				URL:      resp.URL,
				Element:  name,
				Message:  fmt.Sprintf("Cookie '%s' missing SameSite attribute", name),
				Fix:      "Add SameSite: Set-Cookie: " + name + "=...; SameSite=Lax",
				Evidence: cookie,
			})
		}

		// SameSite=None without Secure
		if strings.Contains(lower, "samesite=none") && !strings.Contains(lower, "secure") {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityHigh,
				URL:      resp.URL,
				Element:  name,
				Message:  fmt.Sprintf("Cookie '%s' has SameSite=None without Secure flag (rejected by browsers)", name),
				Fix:      "Add Secure flag when using SameSite=None",
				Evidence: cookie,
			})
		}
	}

	return findings
}

func extractCookieName(setCookie string) string {
	eq := strings.IndexByte(setCookie, '=')
	if eq < 0 {
		return setCookie
	}
	return strings.TrimSpace(setCookie[:eq])
}
