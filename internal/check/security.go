package check

import (
	"bytes"
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// SecurityCheck detects missing security headers, mixed content, and exposed secrets.
type SecurityCheck struct{}

func (s *SecurityCheck) Name() string { return "security" }

func (s *SecurityCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	for _, page := range pages {
		if page.Error != nil || page.StatusCode >= 400 {
			continue
		}

		findings = append(findings, s.checkHeaders(page)...)
		findings = append(findings, s.checkMixedContent(page)...)
		findings = append(findings, s.checkExposedSecrets(page)...)
		findings = append(findings, s.checkSetCookie(page)...)
	}

	return findings
}

func (s *SecurityCheck) checkHeaders(page *crawler.Page) []Finding {
	var findings []Finding

	requiredHeaders := []struct {
		name     string
		severity Severity
		fix      string
	}{
		{"Content-Security-Policy", SeverityHigh, "Add a Content-Security-Policy header to prevent XSS attacks"},
		{"X-Content-Type-Options", SeverityMedium, "Add 'X-Content-Type-Options: nosniff' to prevent MIME sniffing"},
		{"X-Frame-Options", SeverityMedium, "Add 'X-Frame-Options: DENY' or 'SAMEORIGIN' to prevent clickjacking"},
		{"Strict-Transport-Security", SeverityHigh, "Add HSTS header: 'Strict-Transport-Security: max-age=31536000; includeSubDomains'"},
		{"Referrer-Policy", SeverityLow, "Add 'Referrer-Policy: strict-origin-when-cross-origin'"},
		{"Permissions-Policy", SeverityLow, "Add Permissions-Policy to control browser feature access"},
	}

	if !strings.HasPrefix(page.URL, "https://") {
		findings = append(findings, Finding{
			Severity: SeverityHigh,
			URL:      page.URL,
			Message:  "Page served over HTTP instead of HTTPS",
			Fix:      "Serve all pages over HTTPS and redirect HTTP to HTTPS",
		})
	}

	for _, h := range requiredHeaders {
		if page.Headers.Get(h.name) == "" {
			findings = append(findings, Finding{
				Severity: h.severity,
				URL:      page.URL,
				Message:  fmt.Sprintf("Missing security header: %s", h.name),
				Fix:      h.fix,
			})
		}
	}

	if server := page.Headers.Get("Server"); server != "" {
		if containsVersion(server) {
			findings = append(findings, Finding{
				Severity: SeverityMedium,
				URL:      page.URL,
				Message:  "Server header exposes version information",
				Fix:      "Remove version from Server header or suppress the header entirely",
				Evidence: fmt.Sprintf("Server: %s", server),
			})
		}
	}

	if powered := page.Headers.Get("X-Powered-By"); powered != "" {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Message:  "X-Powered-By header exposes technology stack",
			Fix:      "Remove the X-Powered-By header",
			Evidence: fmt.Sprintf("X-Powered-By: %s", powered),
		})
	}

	return findings
}

func (s *SecurityCheck) checkMixedContent(page *crawler.Page) []Finding {
	if !strings.HasPrefix(page.URL, "https://") {
		return nil
	}

	var findings []Finding
	body := string(page.Body)

	mixedPatterns := []struct {
		pattern string
		element string
	}{
		{`src="http://`, "src attribute"},
		{`src='http://`, "src attribute"},
		{`href="http://`, "href attribute"},
		{`href='http://`, "href attribute"},
		{`action="http://`, "form action"},
		{`action='http://`, "form action"},
	}

	for _, mp := range mixedPatterns {
		if strings.Contains(body, mp.pattern) {
			findings = append(findings, Finding{
				Severity: SeverityHigh,
				URL:      page.URL,
				Element:  mp.element,
				Message:  "Mixed content: HTTP resource loaded on HTTPS page",
				Fix:      "Update all resource URLs to use HTTPS or protocol-relative URLs",
				Evidence: mp.pattern,
			})
			break
		}
	}

	return findings
}

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{20,}`),
	regexp.MustCompile(`(?i)(secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}`),
	regexp.MustCompile(`(?i)aws[_-]?(access[_-]?key[_-]?id|secret[_-]?access[_-]?key)\s*[:=]\s*["']?[A-Z0-9/+=]{20,}`),
	regexp.MustCompile(`(?i)-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----`),
	regexp.MustCompile(`ghp_[a-zA-Z0-9]{36}`),
	regexp.MustCompile(`sk-[a-zA-Z0-9]{32,}`),
	regexp.MustCompile(`(?i)(bearer|token)\s+[a-zA-Z0-9_\-.]{20,}`),
}

func (s *SecurityCheck) checkExposedSecrets(page *crawler.Page) []Finding {
	if len(page.Body) == 0 {
		return nil
	}

	var findings []Finding
	body := page.Body

	if bytes.Contains(body, []byte("<!--")) {
		for _, pat := range secretPatterns {
			if loc := pat.Find(body); loc != nil {
				findings = append(findings, Finding{
					Severity: SeverityCritical,
					URL:      page.URL,
					Message:  "Potential secret or credential exposed in page source",
					Fix:      "Remove hardcoded secrets and use environment variables or a secrets manager",
					Evidence: truncate(string(loc), 80),
				})
				break
			}
		}
	}

	for _, pat := range secretPatterns[3:] {
		if loc := pat.Find(body); loc != nil {
			findings = append(findings, Finding{
				Severity: SeverityCritical,
				URL:      page.URL,
				Message:  "Potential secret or credential exposed in page source",
				Fix:      "Remove hardcoded secrets; rotate any exposed credentials immediately",
				Evidence: truncate(string(loc), 80),
			})
			break
		}
	}

	return findings
}

// sessionCookieNames contains common session cookie name patterns.
var sessionCookieNames = []string{
	"session", "sess", "sid", "jsessionid", "phpsessid",
	"asp.net_sessionid", "connect.sid", "token", "auth",
}

func (s *SecurityCheck) checkSetCookie(page *crawler.Page) []Finding {
	var findings []Finding

	cookies := page.Headers.Values("Set-Cookie")
	if len(cookies) == 0 {
		return nil
	}

	isHTTPS := strings.HasPrefix(page.URL, "https://")

	for _, cookie := range cookies {
		parts := strings.Split(cookie, ";")
		if len(parts) == 0 {
			continue
		}

		// Extract cookie name from "name=value"
		nameValue := strings.TrimSpace(parts[0])
		eqIdx := strings.IndexByte(nameValue, '=')
		cookieName := nameValue
		if eqIdx >= 0 {
			cookieName = nameValue[:eqIdx]
		}
		cookieName = strings.TrimSpace(cookieName)

		// Parse flags from remaining parts
		hasSecure := false
		hasHttpOnly := false
		hasSameSite := false
		sameSiteValue := ""

		for _, part := range parts[1:] {
			part = strings.TrimSpace(strings.ToLower(part))
			switch {
			case part == "secure":
				hasSecure = true
			case part == "httponly":
				hasHttpOnly = true
			case strings.HasPrefix(part, "samesite"):
				hasSameSite = true
				if eqPos := strings.IndexByte(part, '='); eqPos >= 0 {
					sameSiteValue = strings.TrimSpace(part[eqPos+1:])
				}
			}
		}

		evidence := fmt.Sprintf("Set-Cookie: %s", truncate(cookie, 80))

		// Check missing Secure flag on HTTPS pages
		if isHTTPS && !hasSecure {
			findings = append(findings, Finding{
				Severity: SeverityHigh,
				URL:      page.URL,
				Message:  fmt.Sprintf("Cookie %q missing Secure flag on HTTPS page", cookieName),
				Fix:      "Add the Secure flag to ensure the cookie is only sent over HTTPS",
				Evidence: evidence,
			})
		}

		// Check missing HttpOnly on session cookies
		isSessionCookie := isSessionCookieName(cookieName)
		if isSessionCookie && !hasHttpOnly {
			findings = append(findings, Finding{
				Severity: SeverityHigh,
				URL:      page.URL,
				Message:  fmt.Sprintf("Session cookie %q missing HttpOnly flag", cookieName),
				Fix:      "Add the HttpOnly flag to prevent JavaScript access to session cookies",
				Evidence: evidence,
			})
		}

		// Check missing or incorrect SameSite
		if !hasSameSite {
			findings = append(findings, Finding{
				Severity: SeverityMedium,
				URL:      page.URL,
				Message:  fmt.Sprintf("Cookie %q missing SameSite attribute", cookieName),
				Fix:      "Add SameSite=Lax or SameSite=Strict to protect against CSRF",
				Evidence: evidence,
			})
		} else if sameSiteValue == "none" && !hasSecure {
			findings = append(findings, Finding{
				Severity: SeverityHigh,
				URL:      page.URL,
				Message:  fmt.Sprintf("Cookie %q has SameSite=None without Secure flag", cookieName),
				Fix:      "Cookies with SameSite=None must also have the Secure flag",
				Evidence: evidence,
			})
		}
	}

	return findings
}

func isSessionCookieName(name string) bool {
	lower := strings.ToLower(name)
	for _, pattern := range sessionCookieNames {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

var versionRegex = regexp.MustCompile(`\d+\.\d+`)

func containsVersion(s string) bool {
	return versionRegex.MatchString(s)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
