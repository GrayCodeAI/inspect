package checks

import (
	"net/http"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestCookieSecurityCheck_Name(t *testing.T) {
	check := &CookieSecurityCheck{}
	if got := check.Name(); got != "cookie-security" {
		t.Errorf("Name() = %q, want %q", got, "cookie-security")
	}
}

// TestCookieSecurityCheck_Severities asserts the exact severity assigned to
// each individual missing-flag finding (Secure -> High, HttpOnly -> Medium,
// SameSite -> Medium), which the existing tests do not pin down.
func TestCookieSecurityCheck_Severities(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{"session=abc123; Path=/"},
		},
	}
	findings := check.Run(resp)

	wantSeverity := map[string]inspect.Severity{
		"Secure":   inspect.SeverityHigh,
		"HttpOnly": inspect.SeverityMedium,
		"SameSite": inspect.SeverityMedium,
	}
	gotSeverity := map[string]inspect.Severity{}
	for _, f := range findings {
		if f.Element != "session" {
			t.Errorf("unexpected Element %q, want %q", f.Element, "session")
		}
		switch {
		case contains(f.Message, "Secure"):
			gotSeverity["Secure"] = f.Severity
		case contains(f.Message, "HttpOnly"):
			gotSeverity["HttpOnly"] = f.Severity
		case contains(f.Message, "SameSite"):
			gotSeverity["SameSite"] = f.Severity
		}
	}
	for flag, want := range wantSeverity {
		got, ok := gotSeverity[flag]
		if !ok {
			t.Errorf("missing finding for %s flag", flag)
			continue
		}
		if got != want {
			t.Errorf("%s flag severity = %v, want %v", flag, got, want)
		}
	}
}

// TestCookieSecurityCheck_SameSiteNone covers the special SameSite=None edge
// cases that the existing checks_test.go does not exercise.
func TestCookieSecurityCheck_SameSiteNone(t *testing.T) {
	tests := []struct {
		name              string
		cookie            string
		wantSameSiteNone  bool // expect the "SameSite=None without Secure" High finding
		wantSecureMissing bool // expect a generic "missing Secure" High finding
	}{
		{
			// SameSite=None present but Secure missing: emits the dedicated
			// "SameSite=None without Secure" High finding AND the generic
			// missing-Secure High finding. SameSite IS present so no
			// missing-SameSite finding.
			name:              "none without secure",
			cookie:            "sid=1; SameSite=None; HttpOnly",
			wantSameSiteNone:  true,
			wantSecureMissing: true,
		},
		{
			// SameSite=None with Secure: no missing-Secure finding and no
			// dedicated None-without-Secure finding. Fully configured.
			name:              "none with secure",
			cookie:            "sid=1; SameSite=None; Secure; HttpOnly",
			wantSameSiteNone:  false,
			wantSecureMissing: false,
		},
	}

	check := &CookieSecurityCheck{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := &Response{
				URL: "https://example.com",
				Headers: http.Header{
					"Set-Cookie": []string{tt.cookie},
				},
			}
			findings := check.Run(resp)

			gotSameSiteNone := false
			gotSecureMissing := false
			gotMissingSameSite := false
			for _, f := range findings {
				switch {
				case contains(f.Message, "SameSite=None without Secure"):
					gotSameSiteNone = true
					if f.Severity != inspect.SeverityHigh {
						t.Errorf("SameSite=None-without-Secure severity = %v, want High", f.Severity)
					}
				case contains(f.Message, "missing Secure"):
					gotSecureMissing = true
				case contains(f.Message, "missing SameSite attribute"):
					gotMissingSameSite = true
				}
			}
			if gotSameSiteNone != tt.wantSameSiteNone {
				t.Errorf("SameSite=None-without-Secure finding = %v, want %v", gotSameSiteNone, tt.wantSameSiteNone)
			}
			if gotSecureMissing != tt.wantSecureMissing {
				t.Errorf("missing-Secure finding = %v, want %v", gotSecureMissing, tt.wantSecureMissing)
			}
			// SameSite attribute is present in both cases, so the generic
			// missing-SameSite finding must never appear.
			if gotMissingSameSite {
				t.Error("did not expect missing-SameSite finding when SameSite is present")
			}
		})
	}
}

// TestCookieSecurityCheck_MultipleCookies verifies each Set-Cookie header is
// audited independently and findings carry the correct per-cookie Element.
func TestCookieSecurityCheck_MultipleCookies(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{
				"good=1; Secure; HttpOnly; SameSite=Lax",
				"bad=2; Path=/",
			},
		},
	}
	findings := check.Run(resp)

	for _, f := range findings {
		if f.Element == "good" {
			t.Errorf("well-configured cookie should produce no findings, got: %s", f.Message)
		}
		if f.Element != "bad" {
			t.Errorf("unexpected Element %q, want %q", f.Element, "bad")
		}
	}
	// The "bad" cookie is missing Secure, HttpOnly, and SameSite -> 3 findings.
	if len(findings) != 3 {
		t.Errorf("expected 3 findings for the single misconfigured cookie, got %d", len(findings))
	}
}

// TestCookieSecurityCheck_MalformedCookieName covers a Set-Cookie value with
// no '=' so extractCookieName falls back to the whole string, used as Element.
func TestCookieSecurityCheck_MalformedCookieName(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{"justaname"},
		},
	}
	findings := check.Run(resp)
	if len(findings) == 0 {
		t.Fatal("expected findings for cookie lacking security flags")
	}
	for _, f := range findings {
		if f.Element != "justaname" {
			t.Errorf("Element = %q, want %q (fallback to whole value)", f.Element, "justaname")
		}
	}
}

// TestCookieSecurityCheck_CaseInsensitive verifies flag matching is
// case-insensitive (the check lowercases the header before comparing).
func TestCookieSecurityCheck_CaseInsensitive(t *testing.T) {
	check := &CookieSecurityCheck{}
	resp := &Response{
		URL: "https://example.com",
		Headers: http.Header{
			"Set-Cookie": []string{"sid=1; SECURE; HTTPONLY; SAMESITE=Strict"},
		},
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings for upper-cased flags, got %d", len(findings))
	}
}
