package checks

import (
	"net/http"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestAllChecks(t *testing.T) {
	checks := AllChecks()
	if len(checks) != 6 {
		t.Errorf("expected 6 registered checks, got %d", len(checks))
	}
	names := map[string]bool{}
	for _, c := range checks {
		names[c.Name()] = true
	}
	expected := []string{"security-headers", "cookie-security", "tls", "mixed-content", "meta-tags", "accessibility"}
	for _, name := range expected {
		if !names[name] {
			t.Errorf("missing check: %s", name)
		}
	}
}

func TestSecurityHeadersCheck_MissingHeaders(t *testing.T) {
	check := &SecurityHeadersCheck{}
	resp := &Response{
		URL:     "https://example.com",
		Headers: http.Header{},
	}
	findings := check.Run(resp)
	if len(findings) == 0 {
		t.Fatal("expected findings for missing security headers")
	}

	found := false
	for _, f := range findings {
		if f.Element == "Strict-Transport-Security" {
			found = true
			if f.Severity != inspect.SeverityHigh {
				t.Errorf("HSTS missing should be high severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for missing HSTS header")
	}
}

func TestSecurityHeadersCheck_AllPresent(t *testing.T) {
	check := &SecurityHeadersCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Strict-Transport-Security": []string{"max-age=31536000"},
			"Content-Security-Policy":   []string{"default-src 'self'"},
			"X-Content-Type-Options":    []string{"nosniff"},
			"Referrer-Policy":           []string{"strict-origin"},
			"Permissions-Policy":        []string{"camera=()"},
		},
	}
	findings := check.Run(resp)
	for _, f := range findings {
		if f.Message != "" && f.Element == "Strict-Transport-Security" {
			t.Error("should not flag present HSTS header")
		}
	}
}

func TestSecurityHeadersCheck_UnsafeInline(t *testing.T) {
	check := &SecurityHeadersCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Content-Security-Policy": []string{"script-src 'unsafe-inline'"},
		},
	}
	findings := check.Run(resp)
	found := false
	for _, f := range findings {
		if f.Element == "Content-Security-Policy" && f.Severity == inspect.SeverityHigh {
			found = true
		}
	}
	if !found {
		t.Error("expected high severity finding for unsafe-inline CSP")
	}
}

func TestSecurityHeadersCheck_InfoDisclosure(t *testing.T) {
	check := &SecurityHeadersCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Server":       []string{"nginx/1.19"},
			"X-Powered-By": []string{"Express"},
		},
	}
	findings := check.Run(resp)
	serverFound := false
	for _, f := range findings {
		if f.Element == "Server" {
			serverFound = true
		}
	}
	if !serverFound {
		t.Error("expected info disclosure finding for Server header")
	}
}

func TestCookieSecurityCheck_InsecureCookie(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{"session=abc123; Path=/"},
		},
	}
	findings := check.Run(resp)
	if len(findings) == 0 {
		t.Fatal("expected findings for insecure cookie")
	}

	hasSecure, hasHttpOnly, hasSameSite := false, false, false
	for _, f := range findings {
		if f.Element == "session" {
			switch {
			case contains(f.Message, "Secure"):
				hasSecure = true
			case contains(f.Message, "HttpOnly"):
				hasHttpOnly = true
			case contains(f.Message, "SameSite"):
				hasSameSite = true
			}
		}
	}
	if !hasSecure {
		t.Error("expected finding for missing Secure flag")
	}
	if !hasHttpOnly {
		t.Error("expected finding for missing HttpOnly flag")
	}
	if !hasSameSite {
		t.Error("expected finding for missing SameSite attribute")
	}
}

func TestCookieSecurityCheck_SecureCookie(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{"session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"},
		},
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings for secure cookie, got %d", len(findings))
	}
}

func TestCookieSecurityCheck_NoCookies(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL:     "https://example.com",
		Headers: http.Header{},
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings when no cookies set, got %d", len(findings))
	}
}

func TestExtractCookieName(t *testing.T) {
	tests := []struct {
		input  string
		expect string
	}{
		{"session=abc123; Path=/", "session"},
		{"token=xyz; Secure", "token"},
		{"nocookie", "nocookie"},
	}
	for _, tt := range tests {
		got := extractCookieName(tt.input)
		if got != tt.expect {
			t.Errorf("extractCookieName(%q) = %q, want %q", tt.input, got, tt.expect)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
