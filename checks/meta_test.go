package checks

import (
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestMetaTagsCheck_Name(t *testing.T) {
	check := &MetaTagsCheck{}
	if got := check.Name(); got != "meta-tags" {
		t.Errorf("Name() = %q, want %q", got, "meta-tags")
	}
}

// wellConfiguredHTML satisfies every rule MetaTagsCheck enforces, so it should
// produce zero findings.
const wellConfiguredHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A concise and useful description of the page.">
<title>A Good Page Title</title>
</head>
<body>Hello</body>
</html>`

func findingForElement(findings []inspect.Finding, element string) (inspect.Finding, bool) {
	for _, f := range findings {
		if f.Element == element {
			return f, true
		}
	}
	return inspect.Finding{}, false
}

func TestMetaTagsCheck_WellConfigured(t *testing.T) {
	check := &MetaTagsCheck{}
	resp := &Response{
		URL:  "https://example.com",
		Body: []byte(wellConfiguredHTML),
	}
	findings := check.Run(resp)
	if len(findings) != 0 {
		t.Errorf("expected no findings for well-configured HTML, got %d: %+v", len(findings), findings)
	}
}

func TestMetaTagsCheck_MissingElements(t *testing.T) {
	tests := []struct {
		name        string
		body        string
		wantElement string
		wantSev     inspect.Severity
	}{
		{
			name:        "missing title",
			body:        `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="d"></head></html>`,
			wantElement: "title",
			wantSev:     inspect.SeverityMedium,
		},
		{
			name:        "empty title",
			body:        `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="d"><title>   </title></head></html>`,
			wantElement: "title",
			wantSev:     inspect.SeverityMedium,
		},
		{
			name:        "missing meta description",
			body:        `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><title>Good Title</title></head></html>`,
			wantElement: "meta description",
			wantSev:     inspect.SeverityLow,
		},
		{
			name:        "missing viewport",
			body:        `<html lang="en"><head><meta charset="utf-8"><meta name="description" content="d"><title>Good Title</title></head></html>`,
			wantElement: "viewport",
			wantSev:     inspect.SeverityMedium,
		},
		{
			name:        "missing charset",
			body:        `<html lang="en"><head><meta name="viewport" content="x"><meta name="description" content="d"><title>Good Title</title></head></html>`,
			wantElement: "charset",
			wantSev:     inspect.SeverityLow,
		},
		{
			name:        "missing lang",
			body:        `<html><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="d"><title>Good Title</title></head></html>`,
			wantElement: "html lang",
			wantSev:     inspect.SeverityMedium,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check := &MetaTagsCheck{}
			resp := &Response{URL: "https://example.com", Body: []byte(tt.body)}
			findings := check.Run(resp)

			f, ok := findingForElement(findings, tt.wantElement)
			if !ok {
				t.Fatalf("expected a finding with Element %q, got findings: %+v", tt.wantElement, findings)
			}
			if f.Severity != tt.wantSev {
				t.Errorf("Element %q severity = %v, want %v", tt.wantElement, f.Severity, tt.wantSev)
			}
			if f.Check != "meta-tags" {
				t.Errorf("Check = %q, want %q", f.Check, "meta-tags")
			}
		})
	}
}

func TestMetaTagsCheck_TitleTooLong(t *testing.T) {
	longTitle := strings.Repeat("a", 61)
	body := `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="d"><title>` + longTitle + `</title></head></html>`
	check := &MetaTagsCheck{}
	resp := &Response{URL: "https://example.com", Body: []byte(body)}
	findings := check.Run(resp)

	f, ok := findingForElement(findings, "title")
	if !ok {
		t.Fatalf("expected a 'title' finding for over-long title, got: %+v", findings)
	}
	if f.Severity != inspect.SeverityLow {
		t.Errorf("long title severity = %v, want %v", f.Severity, inspect.SeverityLow)
	}
	if f.Evidence != longTitle {
		t.Errorf("Evidence = %q, want the title text %q", f.Evidence, longTitle)
	}
}

func TestMetaTagsCheck_TitleBoundary60(t *testing.T) {
	// Exactly 60 chars is allowed (rule is > 60), so no title finding.
	title := strings.Repeat("a", 60)
	body := `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="d"><title>` + title + `</title></head></html>`
	check := &MetaTagsCheck{}
	resp := &Response{URL: "https://example.com", Body: []byte(body)}
	findings := check.Run(resp)

	if _, ok := findingForElement(findings, "title"); ok {
		t.Errorf("did not expect a 'title' finding for a 60-char title, got: %+v", findings)
	}
}

func TestMetaTagsCheck_DescriptionTooLong(t *testing.T) {
	longDesc := strings.Repeat("x", 161)
	body := `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"><meta name="description" content="` + longDesc + `"><title>Good Title</title></head></html>`
	check := &MetaTagsCheck{}
	resp := &Response{URL: "https://example.com", Body: []byte(body)}
	findings := check.Run(resp)

	f, ok := findingForElement(findings, "meta description")
	if !ok {
		t.Fatalf("expected a 'meta description' finding for over-long description, got: %+v", findings)
	}
	if f.Severity != inspect.SeverityInfo {
		t.Errorf("long description severity = %v, want %v", f.Severity, inspect.SeverityInfo)
	}
}

func TestMetaTagsCheck_EmptyBody(t *testing.T) {
	// An empty body fails every rule: title, description, viewport, charset, lang.
	check := &MetaTagsCheck{}
	resp := &Response{URL: "https://example.com", Body: []byte("")}
	findings := check.Run(resp)

	wantElements := []string{"title", "meta description", "viewport", "charset", "html lang"}
	if len(findings) != len(wantElements) {
		t.Errorf("empty body: got %d findings, want %d: %+v", len(findings), len(wantElements), findings)
	}
	for _, el := range wantElements {
		if _, ok := findingForElement(findings, el); !ok {
			t.Errorf("empty body: missing expected finding for element %q", el)
		}
	}
}

func TestMetaTagsCheck_NilBody(t *testing.T) {
	// A nil Body must not panic; string(nil) is "", so all rules fire.
	check := &MetaTagsCheck{}
	resp := &Response{URL: "https://example.com"}
	findings := check.Run(resp)
	if len(findings) == 0 {
		t.Error("expected findings for nil body, got none")
	}
}
