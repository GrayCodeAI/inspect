package check

import (
	"context"
	"net/http"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

func makePage(url string, status int, headers map[string]string, body string) *crawler.Page {
	h := make(http.Header)
	for k, v := range headers {
		h.Set(k, v)
	}
	p := &crawler.Page{
		URL:        url,
		StatusCode: status,
		Headers:    h,
		Body:       []byte(body),
	}
	p.Links = nil
	p.Forms = nil
	return p
}

func TestSecurityCheck_MissingHeaders(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>hi</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected security findings for missing headers")
	}

	foundCSP := false
	for _, f := range findings {
		if f.Message == "Missing security header: Content-Security-Policy" {
			foundCSP = true
		}
	}
	if !foundCSP {
		t.Error("expected missing CSP finding")
	}
}

func TestSecurityCheck_AllHeadersPresent(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "default-src 'self'",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>secure</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if f.Message[:len("Missing security header")] == "Missing security header" {
			t.Errorf("unexpected missing header finding: %s", f.Message)
		}
	}
}

func TestFormsCheck_MissingCSRF(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{Action: "/submit", Method: "POST", HasCSRF: false},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected CSRF finding")
	}
	if findings[0].Severity != SeverityHigh {
		t.Errorf("expected high severity, got %v", findings[0].Severity)
	}
}

func TestFormsCheck_GETWithPassword(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{
			Action: "/login",
			Method: "GET",
			Inputs: []crawler.FormInput{
				{Name: "password", Type: "password"},
			},
		},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	hasCritical := false
	for _, f := range findings {
		if f.Severity == SeverityCritical {
			hasCritical = true
		}
	}
	if !hasCritical {
		t.Error("expected critical finding for GET form with password")
	}
}

func TestA11yCheck_MissingAlt(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html lang="en"><head><title>Test</title></head><body><main><img src="photo.jpg"></main></body></html>`)

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	hasAlt := false
	for _, f := range findings {
		if f.Message == "Image missing alt attribute" {
			hasAlt = true
		}
	}
	if !hasAlt {
		t.Error("expected missing alt attribute finding")
	}
}

func TestSEOCheck_MissingMeta(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head></head><body>no meta</body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected SEO findings for missing meta")
	}
}

func TestPerfCheck_LargeBody(t *testing.T) {
	largeBody := make([]byte, 600*1024)
	for i := range largeBody {
		largeBody[i] = 'a'
	}
	body := `<html><head><title>T</title></head><body><main>` + string(largeBody) + `</main></body></html>`

	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, body)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	hasSize := false
	for _, f := range findings {
		if f.Severity == SeverityHigh {
			hasSize = true
		}
	}
	if !hasSize {
		t.Error("expected high severity finding for large page")
	}
}

func TestAIReadyCheck_MissingFeatures(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><p>No semantic structure</p></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected AI-ready findings for page missing features")
	}

	foundMessages := make(map[string]bool)
	for _, f := range findings {
		foundMessages[f.Message] = true
	}

	// Should find missing llms.txt, sitemap, markdown alternate, structured data, semantic HTML issues
	hasLLMsTxt := false
	hasSitemap := false
	hasMarkdown := false
	hasStructured := false
	hasMain := false
	for _, f := range findings {
		switch {
		case contains(f.Message, "llms.txt"):
			hasLLMsTxt = true
		case contains(f.Message, "sitemap"):
			hasSitemap = true
		case contains(f.Message, "markdown alternate"):
			hasMarkdown = true
		case contains(f.Message, "structured data"):
			hasStructured = true
		case contains(f.Message, "<main>"):
			hasMain = true
		}
	}

	if !hasLLMsTxt {
		t.Error("expected finding about missing llms.txt")
	}
	if !hasSitemap {
		t.Error("expected finding about missing sitemap")
	}
	if !hasMarkdown {
		t.Error("expected finding about missing markdown alternate")
	}
	if !hasStructured {
		t.Error("expected finding about missing structured data")
	}
	if !hasMain {
		t.Error("expected finding about missing <main> landmark")
	}
}

func TestAIReadyCheck_WellStructuredPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<!DOCTYPE html>
<html lang="en">
<head>
	<title>Test</title>
	<link rel="alternate" type="text/markdown" href="/page.md">
	<script type="application/ld+json">{"@context":"https://schema.org"}</script>
</head>
<body>
	<nav><a href="/">Home</a></nav>
	<main><h1>Welcome</h1><p>Content</p></main>
</body>
</html>`)

	// Also provide a llms.txt and sitemap page
	llmsTxt := makePage("https://example.com/llms.txt", 200,
		map[string]string{"Content-Type": "text/plain"}, "Site description")
	sitemap := makePage("https://example.com/sitemap.xml", 200,
		map[string]string{"Content-Type": "application/xml"}, "<urlset></urlset>")

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, llmsTxt, sitemap})

	// Should have no findings for this well-structured page
	for _, f := range findings {
		if f.Severity > SeverityInfo {
			t.Errorf("unexpected finding above info severity: %s", f.Message)
		}
	}
}

func TestAIReadyCheck_Name(t *testing.T) {
	chk := &AIReadyCheck{}
	if chk.Name() != "aiready" {
		t.Errorf("expected name 'aiready', got %q", chk.Name())
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchSubstring(s, substr)
}

func searchSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestRegistry_Filter(t *testing.T) {
	r := DefaultRegistry()

	filtered := r.Filter([]string{"links", "security"})
	if len(filtered) != 2 {
		t.Errorf("expected 2 checks, got %d", len(filtered))
	}

	all := r.All()
	if len(all) != 8 {
		t.Errorf("expected 8 checks, got %d", len(all))
	}
}
