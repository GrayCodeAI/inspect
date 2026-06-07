package checks

import (
	"crypto/tls"
	"testing"
	"time"

	"github.com/GrayCodeAI/inspect"
)

func TestTLSCheck_Name(t *testing.T) {
	check := &TLSCheck{}
	if got := check.Name(); got != "tls" {
		t.Errorf("Name() = %q, want %q", got, "tls")
	}
}

// findingFor returns the first finding whose Element matches, or nil.
func findingFor(findings []inspect.Finding, element string) *inspect.Finding {
	for i := range findings {
		if findings[i].Element == element {
			return &findings[i]
		}
	}
	return nil
}

func TestTLSCheck_Version(t *testing.T) {
	tests := []struct {
		name         string
		version      uint16
		wantElement  string // "" means no "TLS Version" finding expected
		wantSeverity inspect.Severity
	}{
		{"tls10_critical", tls.VersionTLS10, "TLS Version", inspect.SeverityCritical},
		{"tls11_high", tls.VersionTLS11, "TLS Version", inspect.SeverityHigh},
		{"tls12_ok", tls.VersionTLS12, "", 0},
		{"tls13_ok", tls.VersionTLS13, "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check := &TLSCheck{}
			resp := &Response{
				URL:      "https://example.com",
				TLSState: &tls.ConnectionState{Version: tt.version},
				// CertExpiry left zero so only the version branch fires.
			}
			findings := check.Run(resp)
			f := findingFor(findings, "TLS Version")

			if tt.wantElement == "" {
				if f != nil {
					t.Errorf("expected no TLS Version finding for %s, got %+v", tt.name, *f)
				}
				return
			}

			if f == nil {
				t.Fatalf("expected a TLS Version finding for %s, got none", tt.name)
			}
			if f.Severity != tt.wantSeverity {
				t.Errorf("severity = %v, want %v", f.Severity, tt.wantSeverity)
			}
			if f.Check != "tls" {
				t.Errorf("Check = %q, want %q", f.Check, "tls")
			}
			if f.URL != resp.URL {
				t.Errorf("URL = %q, want %q", f.URL, resp.URL)
			}
		})
	}
}

func TestTLSCheck_CertExpiry(t *testing.T) {
	tests := []struct {
		name         string
		expiry       time.Time
		wantElement  bool // expect a "Certificate" finding
		wantSeverity inspect.Severity
	}{
		{"expired_critical", time.Now().Add(-24 * time.Hour), true, inspect.SeverityCritical},
		{"expiring_soon_high", time.Now().Add(10 * 24 * time.Hour), true, inspect.SeverityHigh},
		{"valid_far_future", time.Now().Add(365 * 24 * time.Hour), false, 0},
		{"zero_expiry_skipped", time.Time{}, false, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check := &TLSCheck{}
			resp := &Response{
				URL: "https://example.com",
				// TLS 1.2 so the version branch never contributes a finding.
				TLSState:   &tls.ConnectionState{Version: tls.VersionTLS12},
				CertExpiry: tt.expiry,
			}
			findings := check.Run(resp)
			f := findingFor(findings, "Certificate")

			if !tt.wantElement {
				if f != nil {
					t.Errorf("expected no Certificate finding for %s, got %+v", tt.name, *f)
				}
				return
			}

			if f == nil {
				t.Fatalf("expected a Certificate finding for %s, got none", tt.name)
			}
			if f.Severity != tt.wantSeverity {
				t.Errorf("severity = %v, want %v", f.Severity, tt.wantSeverity)
			}
			if f.Evidence == "" {
				t.Error("expected Evidence to be populated for certificate finding")
			}
		})
	}
}

// Boundary: a cert expiring in ~29 days is < 30 and must be flagged High;
// ~31 days is >= 30 and must not be flagged.
func TestTLSCheck_CertExpiry_Boundary(t *testing.T) {
	check := &TLSCheck{}

	respUnder := &Response{
		URL:        "https://example.com",
		TLSState:   &tls.ConnectionState{Version: tls.VersionTLS12},
		CertExpiry: time.Now().Add(29 * 24 * time.Hour),
	}
	if f := findingFor(check.Run(respUnder), "Certificate"); f == nil {
		t.Error("expected Certificate finding for cert expiring in 29 days")
	} else if f.Severity != inspect.SeverityHigh {
		t.Errorf("severity = %v, want High", f.Severity)
	}

	respOver := &Response{
		URL:        "https://example.com",
		TLSState:   &tls.ConnectionState{Version: tls.VersionTLS12},
		CertExpiry: time.Now().Add(31 * 24 * time.Hour),
	}
	if f := findingFor(check.Run(respOver), "Certificate"); f != nil {
		t.Errorf("expected no Certificate finding for cert expiring in 31 days, got %+v", *f)
	}
}

// nil TLSState (e.g. plain HTTP response) must short-circuit to zero findings,
// even if CertExpiry is somehow set.
func TestTLSCheck_NilTLSState(t *testing.T) {
	check := &TLSCheck{}
	resp := &Response{
		URL:        "http://example.com",
		TLSState:   nil,
		CertExpiry: time.Now().Add(-24 * time.Hour), // would be "expired" if reached
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings when TLSState is nil, got %d: %+v", len(findings), findings)
	}
}

// Fully healthy TLS: modern version + far-future cert => no findings.
func TestTLSCheck_WellConfigured(t *testing.T) {
	check := &TLSCheck{}
	resp := &Response{
		URL:        "https://example.com",
		TLSState:   &tls.ConnectionState{Version: tls.VersionTLS13},
		CertExpiry: time.Now().Add(180 * 24 * time.Hour),
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings for well-configured TLS, got %d: %+v", len(findings), findings)
	}
}

// Both problems at once: old TLS version AND expired cert => two findings.
func TestTLSCheck_MultipleFindings(t *testing.T) {
	check := &TLSCheck{}
	resp := &Response{
		URL:        "https://example.com",
		TLSState:   &tls.ConnectionState{Version: tls.VersionTLS10},
		CertExpiry: time.Now().Add(-1 * time.Hour),
	}
	findings := check.Run(resp)
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings (version + cert), got %d: %+v", len(findings), findings)
	}
	if findingFor(findings, "TLS Version") == nil {
		t.Error("missing TLS Version finding")
	}
	if findingFor(findings, "Certificate") == nil {
		t.Error("missing Certificate finding")
	}
}
