package checks

import (
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestAccessibilityCheck_Name(t *testing.T) {
	check := &AccessibilityCheck{}
	if got := check.Name(); got != "accessibility" {
		t.Errorf("Name() = %q, want %q", got, "accessibility")
	}
}

// hasFinding reports whether findings contains an entry matching element and severity.
func hasFinding(findings []inspect.Finding, element string, severity inspect.Severity) bool {
	for _, f := range findings {
		if f.Element == element && f.Severity == severity {
			return true
		}
	}
	return false
}

func TestAccessibilityCheck_Run(t *testing.T) {
	tests := []struct {
		name         string
		body         string
		wantElement  string
		wantSeverity inspect.Severity
		wantFinding  bool // whether wantElement/wantSeverity should be present
		wantCount    int  // expected total findings; -1 to skip count assertion
	}{
		{
			name:         "image without alt is flagged medium",
			body:         `<html><body><img src="logo.png"></body></html>`,
			wantElement:  `img[src="logo.png"]`,
			wantSeverity: inspect.SeverityMedium,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:        "image with alt is not flagged",
			body:        `<html><body><img src="logo.png" alt="Company logo"></body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
		{
			name:         "empty button is flagged medium",
			body:         `<html><body><button></button></body></html>`,
			wantElement:  "button",
			wantSeverity: inspect.SeverityMedium,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:         "empty link is flagged medium",
			body:         `<html><body><a href="/home"></a></body></html>`,
			wantElement:  "a",
			wantSeverity: inspect.SeverityMedium,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:         "skipped heading level is flagged low",
			body:         `<html><body><h1>Title</h1><h3>Sub</h3></body></html>`,
			wantElement:  "h3",
			wantSeverity: inspect.SeverityLow,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:         "missing h1 is flagged medium",
			body:         `<html><body><h2>First</h2><h3>Second</h3></body></html>`,
			wantElement:  "h1",
			wantSeverity: inspect.SeverityMedium,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:        "proper heading hierarchy starting at h1 is not flagged",
			body:        `<html><body><h1>Title</h1><h2>Sub</h2><h3>Deep</h3></body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
		{
			name:         "text input without label is flagged medium",
			body:         `<html><body><form><input type="text" name="q"></form></body></html>`,
			wantElement:  "input",
			wantSeverity: inspect.SeverityMedium,
			wantFinding:  true,
			wantCount:    1,
		},
		{
			name:        "text input with aria-label is not flagged",
			body:        `<html><body><form><input type="text" name="q" aria-label="Search"></form></body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
		{
			name:        "non-text input type is ignored",
			body:        `<html><body><form><input type="checkbox" name="agree"></form></body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
		{
			name: "well-formed accessible page yields no findings",
			body: `<html><body>
				<h1>Welcome</h1>
				<h2>About</h2>
				<img src="hero.png" alt="A scenic view">
				<a href="/contact">Contact us</a>
				<button>Submit</button>
				<form><input type="text" name="q" aria-label="Search"></form>
			</body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
		{
			name:        "empty body yields no findings",
			body:        "",
			wantFinding: false,
			wantCount:   0,
		},
		{
			name:        "body with no headings does not trigger missing-h1",
			body:        `<html><body><p>Just a paragraph.</p></body></html>`,
			wantFinding: false,
			wantCount:   0,
		},
	}

	check := &AccessibilityCheck{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := &Response{
				URL:  "https://example.com",
				Body: []byte(tt.body),
			}
			findings := check.Run(resp)

			if tt.wantCount >= 0 && len(findings) != tt.wantCount {
				t.Errorf("got %d findings, want %d: %+v", len(findings), tt.wantCount, findings)
			}

			if tt.wantFinding {
				if !hasFinding(findings, tt.wantElement, tt.wantSeverity) {
					t.Errorf("expected finding with Element=%q Severity=%v, got %+v",
						tt.wantElement, tt.wantSeverity, findings)
				}
			}

			// Every emitted finding must be attributed to this check and carry the URL.
			for _, f := range findings {
				if f.Check != "accessibility" {
					t.Errorf("finding Check = %q, want %q", f.Check, "accessibility")
				}
				if f.URL != resp.URL {
					t.Errorf("finding URL = %q, want %q", f.URL, resp.URL)
				}
			}
		})
	}
}

// TestAccessibilityCheck_NilTLSAndHeaders verifies the check ignores
// transport-level fields (nil TLSState, nil Headers) and only reads Body.
func TestAccessibilityCheck_NilTLSAndHeaders(t *testing.T) {
	check := &AccessibilityCheck{}
	resp := &Response{
		URL:      "https://example.com",
		Body:     []byte(`<img src="x.png">`),
		TLSState: nil,
		Headers:  nil,
	}
	findings := check.Run(resp)
	if !hasFinding(findings, `img[src="x.png"]`, inspect.SeverityMedium) {
		t.Errorf("expected image-without-alt finding regardless of nil TLS/Headers, got %+v", findings)
	}
}

// TestAccessibilityCheck_MultipleImages confirms one finding per offending image.
func TestAccessibilityCheck_MultipleImages(t *testing.T) {
	check := &AccessibilityCheck{}
	resp := &Response{
		URL:  "https://example.com",
		Body: []byte(`<img src="a.png"><img src="b.png" alt="ok"><img src="c.png">`),
	}
	findings := check.Run(resp)
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings (a.png, c.png), got %d: %+v", len(findings), findings)
	}
	if !hasFinding(findings, `img[src="a.png"]`, inspect.SeverityMedium) {
		t.Error("missing finding for a.png")
	}
	if !hasFinding(findings, `img[src="c.png"]`, inspect.SeverityMedium) {
		t.Error("missing finding for c.png")
	}
}
