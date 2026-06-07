package checks

import (
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestMixedContentCheck_Name(t *testing.T) {
	check := &MixedContentCheck{}
	if got := check.Name(); got != "mixed-content" {
		t.Errorf("Name() = %q, want %q", got, "mixed-content")
	}
}

func TestMixedContentCheck_Run(t *testing.T) {
	tests := []struct {
		name         string
		url          string
		body         string
		wantCount    int
		wantElement  string // expected Element on the (first) finding, "" to skip
		wantSeverity inspect.Severity
		checkSev     bool
	}{
		{
			name:      "non-https page yields no findings",
			url:       "http://example.com",
			body:      `<img src="http://cdn.example.com/a.png">`,
			wantCount: 0,
		},
		{
			name:      "https page with no http resources",
			url:       "https://example.com",
			body:      `<img src="https://cdn.example.com/a.png"><a href="https://example.com/x">x</a>`,
			wantCount: 0,
		},
		{
			name:      "empty body yields no findings",
			url:       "https://example.com",
			body:      "",
			wantCount: 0,
		},
		{
			name:         "http img src is medium severity",
			url:          "https://example.com",
			body:         `<img src="http://cdn.example.com/a.png">`,
			wantCount:    1,
			wantElement:  `src="http://cdn.example.com/a.png"`,
			wantSeverity: inspect.SeverityMedium,
			checkSev:     true,
		},
		{
			name:         "http href is medium severity",
			url:          "https://example.com",
			body:         `<a href="http://example.com/page">link</a>`,
			wantCount:    1,
			wantElement:  `href="http://example.com/page"`,
			wantSeverity: inspect.SeverityMedium,
			checkSev:     true,
		},
		{
			name:         "http script src .js is high severity (blockable)",
			url:          "https://example.com",
			body:         `<script src="http://cdn.example.com/app.js"></script>`,
			wantCount:    1,
			wantElement:  `src="http://cdn.example.com/app.js"`,
			wantSeverity: inspect.SeverityHigh,
			checkSev:     true,
		},
		{
			name:         "http link .css src is high severity (blockable)",
			url:          "https://example.com",
			body:         `<link src="http://cdn.example.com/style.css">`,
			wantCount:    1,
			wantSeverity: inspect.SeverityHigh,
			checkSev:     true,
		},
		{
			name:         "http form action is high severity (blockable)",
			url:          "https://example.com",
			body:         `<form action="http://example.com/submit">`,
			wantCount:    1,
			wantElement:  `action="http://example.com/submit"`,
			wantSeverity: inspect.SeverityHigh,
			checkSev:     true,
		},
		{
			name:      "duplicate http urls are deduplicated",
			url:       "https://example.com",
			body:      `<img src="http://cdn.example.com/a.png"><img src="http://cdn.example.com/a.png">`,
			wantCount: 1,
		},
		{
			name:      "multiple distinct http resources each reported",
			url:       "https://example.com",
			body:      `<img src="http://cdn.example.com/a.png"><script src="http://cdn.example.com/b.js"></script>`,
			wantCount: 2,
		},
		{
			name:        "case-insensitive attribute and scheme matching",
			url:         "https://example.com",
			body:        `<IMG SRC="HTTP://cdn.example.com/a.png">`,
			wantCount:   1, // pattern uses (?i): uppercase SRC and HTTP:// still match
			wantElement: `SRC="HTTP://cdn.example.com/a.png"`,
		},
		{
			name:      "single quotes are matched",
			url:       "https://example.com",
			body:      `<img src='http://cdn.example.com/a.png'>`,
			wantCount: 1,
		},
		{
			name:         "src non-asset extension is medium not high",
			url:          "https://example.com",
			body:         `<img src="http://cdn.example.com/photo.png">`,
			wantCount:    1,
			wantSeverity: inspect.SeverityMedium,
			checkSev:     true,
		},
	}

	check := &MixedContentCheck{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := &Response{
				URL:  tt.url,
				Body: []byte(tt.body),
			}
			findings := check.Run(resp)
			if len(findings) != tt.wantCount {
				t.Fatalf("Run() returned %d findings, want %d: %+v", len(findings), tt.wantCount, findings)
			}
			if tt.wantCount == 0 {
				return
			}
			for _, f := range findings {
				if f.Check != "mixed-content" {
					t.Errorf("finding Check = %q, want %q", f.Check, "mixed-content")
				}
				if f.URL != tt.url {
					t.Errorf("finding URL = %q, want %q", f.URL, tt.url)
				}
			}
			if tt.wantElement != "" {
				found := false
				for _, f := range findings {
					if f.Element == tt.wantElement {
						found = true
					}
				}
				if !found {
					t.Errorf("no finding with Element %q; got %+v", tt.wantElement, findings)
				}
			}
			if tt.checkSev {
				if findings[0].Severity != tt.wantSeverity {
					t.Errorf("Severity = %v, want %v", findings[0].Severity, tt.wantSeverity)
				}
			}
		})
	}
}
