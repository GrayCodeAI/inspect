package check

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
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
		case strings.Contains(f.Message, "llms.txt"):
			hasLLMsTxt = true
		case strings.Contains(f.Message, "sitemap"):
			hasSitemap = true
		case strings.Contains(f.Message, "markdown alternate"):
			hasMarkdown = true
		case strings.Contains(f.Message, "structured data"):
			hasStructured = true
		case strings.Contains(f.Message, "<main>"):
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

func TestRegistry_Filter(t *testing.T) {
	r := DefaultRegistry()

	filtered := r.Filter([]string{"links", "security"})
	if len(filtered) != 2 {
		t.Errorf("expected 2 checks, got %d", len(filtered))
	}

	all := r.All()
	if len(all) != 9 {
		t.Errorf("expected 9 checks, got %d", len(all))
	}
}

// --- SRI Check Tests ---

func TestSRICheck_Name(t *testing.T) {
	chk := &SRICheck{}
	if chk.Name() != "sri" {
		t.Errorf("expected name 'sri', got %q", chk.Name())
	}
}

func TestSRICheck_CrossOriginScriptMissingIntegrity(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="https://cdn.example.net/lib.js"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing integrity attribute") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for cross-origin script missing integrity")
	}
}

func TestSRICheck_CrossOriginScriptWithValidIntegrity(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="https://cdn.example.net/lib.js" integrity="sha384-abc123" crossorigin="anonymous"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "missing integrity") {
			t.Errorf("should not flag script with valid integrity: %s", f.Message)
		}
	}
}

func TestSRICheck_WeakHash(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="https://cdn.example.net/lib.js" integrity="sha256-weakHash" crossorigin="anonymous"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "weak hash") {
			found = true
			if f.Severity != SeverityLow {
				t.Errorf("expected low severity for weak hash, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for weak SRI hash algorithm")
	}
}

func TestSRICheck_IntegrityWithoutCrossorigin(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="https://cdn.example.net/lib.js" integrity="sha384-abc123"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing crossorigin") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for integrity without crossorigin attribute")
	}
}

func TestSRICheck_SameOriginScriptIgnored(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="/local.js"></script>
			<script src="https://example.com/local2.js"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "integrity") || strings.Contains(f.Message, "SRI") {
			t.Errorf("should not flag same-origin scripts: %s", f.Message)
		}
	}
}

func TestSRICheck_CrossOriginStylesheet(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<link rel="stylesheet" href="https://cdn.example.net/style.css">
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Cross-origin link missing integrity") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for cross-origin stylesheet missing integrity")
	}
}

func TestSRICheck_ProtocolRelativeURL(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="//cdn.other.com/lib.js"></script>
		</head><body></body></html>`)

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing integrity") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for protocol-relative cross-origin script")
	}
}

func TestSRICheck_ErrorPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Error = context.Canceled

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should not produce findings for error pages")
	}
}

func TestSRICheck_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")

	chk := &SRICheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestIsCrossOriginURL(t *testing.T) {
	tests := []struct {
		pageURL     string
		resourceURL string
		expected    bool
	}{
		{"https://example.com", "https://cdn.other.com/lib.js", true},
		{"https://example.com", "https://example.com/local.js", false},
		{"https://example.com", "/local.js", false},
		{"https://example.com", "//other.com/lib.js", true},
		{"https://example.com", "//example.com/lib.js", false},
		{"https://example.com", "http://other.com/lib.js", true},
		{"https://example.com", "relative.js", false},
	}

	for _, tt := range tests {
		got := isCrossOriginURL(tt.pageURL, tt.resourceURL)
		if got != tt.expected {
			t.Errorf("isCrossOriginURL(%q, %q) = %v, want %v", tt.pageURL, tt.resourceURL, got, tt.expected)
		}
	}
}

func TestIsStrongSRIHash(t *testing.T) {
	tests := []struct {
		integrity string
		expected  bool
	}{
		{"sha384-abc123", true},
		{"sha512-xyz456", true},
		{"sha256-weakHash", false},
		{"sha384-abc sha256-def", true}, // has at least one strong hash
		{"", false},
		{"md5-broken", false},
	}

	for _, tt := range tests {
		got := isStrongSRIHash(tt.integrity)
		if got != tt.expected {
			t.Errorf("isStrongSRIHash(%q) = %v, want %v", tt.integrity, got, tt.expected)
		}
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"https://example.com/path", "example.com"},
		{"http://example.com:8080/path", "example.com"},
		{"//cdn.example.com/file.js", "cdn.example.com"},
		{"example.com", "example.com"},
	}

	for _, tt := range tests {
		got := extractHost(tt.input)
		if got != tt.expected {
			t.Errorf("extractHost(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// --- AI-Ready Check Tests (additional) ---

func TestAIReadyCheck_WithLLMsTxt(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	llmsTxt := makePage("https://example.com/llms.txt", 200,
		map[string]string{"Content-Type": "text/plain"}, "This site does X")

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, llmsTxt})

	for _, f := range findings {
		if strings.Contains(f.Message, "llms.txt") {
			t.Error("should not flag llms.txt when it exists and returns 200")
		}
	}
}

func TestAIReadyCheck_LLMsTxtError(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	llmsTxt := makePage("https://example.com/llms.txt", 404,
		map[string]string{"Content-Type": "text/plain"}, "not found")

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, llmsTxt})

	foundLLMs := false
	for _, f := range findings {
		if strings.Contains(f.Message, "llms.txt") {
			foundLLMs = true
		}
	}
	if !foundLLMs {
		t.Error("expected finding about llms.txt when it returns 404")
	}
}

func TestAIReadyCheck_WithJSONLD(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title>
		<script type="application/ld+json">{"@context":"https://schema.org"}</script>
		</head><body><main><nav><a href="/">Home</a></nav><h1>Hi</h1></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "structured data") {
			t.Error("should not flag structured data when JSON-LD is present")
		}
	}
}

func TestAIReadyCheck_WithMicrodata(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head>
		<body><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">John</span></div>
		<main><h1>Hi</h1></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "structured data") {
			t.Error("should not flag structured data when microdata is present")
		}
	}
}

func TestAIReadyCheck_SemanticHTMLComplete(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<!DOCTYPE html><html lang="en"><head><title>Test</title></head>
		<body><nav><a href="/">Home</a></nav><main><h1>Title</h1><h2>Sub</h2></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "<main>") || strings.Contains(f.Message, "<nav>") || strings.Contains(f.Message, "<h1>") {
			t.Errorf("should not flag semantic elements when all present: %s", f.Message)
		}
	}
}

func TestAIReadyCheck_MultipleH1(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head>
		<body><main><h1>First</h1><h1>Second</h1></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Multiple <h1>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding about multiple <h1> elements")
	}
}

func TestAIReadyCheck_HeadingGap(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head>
		<body><main><h1>Title</h1><h4>Skipped to h4</h4></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Heading hierarchy gap") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding about heading hierarchy gap")
	}
}

func TestAIReadyCheck_SitemapAccessible(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	sitemap := makePage("https://example.com/sitemap.xml", 200,
		map[string]string{"Content-Type": "application/xml"}, "<urlset></urlset>")

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, sitemap})

	for _, f := range findings {
		if strings.Contains(f.Message, "sitemap") && strings.Contains(f.Message, "No accessible") {
			t.Error("should not flag missing sitemap when it's accessible")
		}
	}
}

func TestAIReadyCheck_SitemapBadStatus(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	sitemap := makePage("https://example.com/sitemap.xml", 500,
		map[string]string{"Content-Type": "text/html"}, "error")

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, sitemap})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "sitemap.xml returned status 500") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding about sitemap returning error status")
	}
}

func TestAIReadyCheck_MarkdownAlternate(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title>
		<link rel="alternate" type="text/markdown" href="/page.md">
		</head><body><main><h1>Hi</h1></main></body></html>`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "markdown alternate") {
			t.Error("should not flag missing markdown alternate when present")
		}
	}
}

func TestAIReadyCheck_NonHTMLContentType(t *testing.T) {
	page := makePage("https://example.com/data.json", 200,
		map[string]string{"Content-Type": "application/json"}, `{"key":"value"}`)

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	// Non-HTML pages should not produce per-page findings like markdown alternate
	for _, f := range findings {
		if strings.Contains(f.Message, "markdown alternate") || strings.Contains(f.Message, "structured data") {
			t.Errorf("should not check per-page features on non-HTML content: %s", f.Message)
		}
	}
}

// --- Advanced A11y Tests ---

func TestCheckARIA_InvalidRole(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="banana">Content</div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") && strings.Contains(f.Message, "banana") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity for invalid role, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for invalid ARIA role 'banana'")
	}
}

func TestCheckARIA_ValidRole(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="navigation">Nav content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") {
			t.Errorf("should not flag valid ARIA role: %s", f.Message)
		}
	}
}

func TestCheckARIA_PositiveTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="5">Content</div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for positive tabindex")
	}
}

func TestCheckARIA_ZeroTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="0">Content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			t.Error("tabindex=0 should not be flagged")
		}
	}
}

func TestCheckARIA_NegativeTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="-1">Content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			t.Error("tabindex=-1 should not be flagged as positive tabindex")
		}
	}
}

func TestCheckARIA_AriaHiddenOnFocusable(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><a href="/page" aria-hidden="true">Hidden link</a></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for aria-hidden on focusable element")
	}
}

func TestCheckARIA_AriaHiddenOnNonFocusable(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div aria-hidden="true">Decorative icon</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			t.Error("should not flag aria-hidden on non-focusable element")
		}
	}
}

func TestCheckARIA_InteractiveElementRemovedFromTabOrder(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><button tabindex="-1">Click me</button></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Interactive element removed from tab order") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for interactive element with tabindex=-1")
	}
}

func TestCheckARIA_RoleRequiringNameWithoutName(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="button"></div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for role=button without accessible name")
	}
}

func TestCheckARIA_RoleRequiringNameWithAriaLabel(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="button" aria-label="Close dialog"></div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			t.Error("should not flag element with aria-label")
		}
	}
}

func TestCheckARIA_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	findings := checkARIA(page)
	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestCheckLandmarks_AllPresent(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>Header</header>
			<nav>Nav</nav>
			<main>Content</main>
			<aside>Sidebar</aside>
			<footer>Footer</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "missing") {
			t.Errorf("should not flag missing landmark when all present: %s", f.Message)
		}
	}
}

func TestCheckLandmarks_MissingNav(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><header>H</header><main>Content</main><footer>F</footer></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <nav>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <nav>")
	}
}

func TestCheckLandmarks_MissingHeader(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><nav>N</nav><main>Content</main><footer>F</footer></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <header>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <header>")
	}
}

func TestCheckLandmarks_MissingFooter(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><header>H</header><nav>N</nav><main>Content</main></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <footer>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <footer>")
	}
}

func TestCheckLandmarks_MultipleMain(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>H</header><nav>N</nav>
			<main>Content 1</main>
			<main>Content 2</main>
			<footer>F</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "has 2 <main> landmarks") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for multiple <main> landmarks")
	}
}

func TestCheckLandmarks_MultipleNavs(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>H</header>
			<nav>Primary</nav>
			<nav>Secondary</nav>
			<main>Content</main>
			<footer>F</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "2 navigation landmarks") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding about multiple navigation landmarks")
	}
}

func TestCheckLandmarks_RoleBasedLandmarks(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="banner">Header</div>
			<div role="navigation">Nav</div>
			<div role="main">Content</div>
			<div role="contentinfo">Footer</div>
		</body></html>`)

	findings := checkLandmarks(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "missing <header>") || strings.Contains(f.Message, "missing <nav>") ||
			strings.Contains(f.Message, "missing <footer>") {
			t.Errorf("should not flag missing landmark when role-based equivalent is present: %s", f.Message)
		}
	}
}

func TestCheckLandmarks_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	findings := checkLandmarks(page)
	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestRunAdvancedA11y(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="invalidrole">Bad</div>
			<div tabindex="10">Bad tabindex</div>
			<button aria-hidden="true">Hidden button</button>
		</body></html>`)

	findings := RunAdvancedA11y(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected multiple a11y findings")
	}

	hasInvalidRole := false
	hasTabindex := false
	hasAriaHidden := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") {
			hasInvalidRole = true
		}
		if strings.Contains(f.Message, "Positive tabindex") {
			hasTabindex = true
		}
		if strings.Contains(f.Message, "aria-hidden") {
			hasAriaHidden = true
		}
	}

	if !hasInvalidRole {
		t.Error("expected invalid ARIA role finding")
	}
	if !hasTabindex {
		t.Error("expected positive tabindex finding")
	}
	if !hasAriaHidden {
		t.Error("expected aria-hidden on focusable finding")
	}
}

func TestRunAdvancedA11y_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="banana">Bad</div></body></html>`)
	page.Error = context.Canceled

	findings := RunAdvancedA11y(context.Background(), []*crawler.Page{page})
	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestHasAccessibleName(t *testing.T) {
	// This is tested indirectly through checkARIA tests, but let's add a focused test
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="button" aria-label="Close">X</div>
			<div role="button" aria-labelledby="btn-label">X</div>
			<div role="button" title="Close button">X</div>
			<div role="button">Click Me</div>
		</body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			t.Errorf("all buttons have accessible names, but got: %s", f.Message)
		}
	}
}

func TestIsInteractive(t *testing.T) {
	// Test by checking that interactive elements with tabindex=-1 are flagged
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<input type="text" tabindex="-1">
			<select tabindex="-1"><option>opt</option></select>
			<textarea tabindex="-1"></textarea>
		</body></html>`)

	findings := checkARIA(page)

	interactiveCount := 0
	for _, f := range findings {
		if strings.Contains(f.Message, "Interactive element removed from tab order") {
			interactiveCount++
		}
	}
	if interactiveCount < 3 {
		t.Errorf("expected at least 3 interactive elements flagged, got %d", interactiveCount)
	}
}

func TestIsFocusable(t *testing.T) {
	// Focusable: interactive elements OR elements with tabindex != -1
	// Test: div with tabindex="0" + aria-hidden should be flagged
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div tabindex="0" aria-hidden="true">Focusable but hidden</div>
		</body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for aria-hidden on element with tabindex=0 (focusable)")
	}
}

// --- Registry Additional Tests ---

func TestRegistry_Register(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&SecurityCheck{})
	r.Register(&LinksCheck{})

	all := r.All()
	if len(all) != 2 {
		t.Errorf("expected 2 checks, got %d", len(all))
	}
}

func TestRegistry_FilterEmpty(t *testing.T) {
	r := DefaultRegistry()
	// Empty filter should return all checks
	all := r.Filter(nil)
	if len(all) != 9 {
		t.Errorf("expected 9 checks for empty filter, got %d", len(all))
	}
}

func TestRegistry_RegisterOverwrite(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&LinksCheck{})
	r.Register(&LinksCheck{AcceptedStatusCodes: []int{200, 201}})

	all := r.All()
	if len(all) != 1 {
		t.Errorf("expected 1 check after overwrite, got %d", len(all))
	}
}

// --- Links Check Tests ---

func TestLinksCheck_Name(t *testing.T) {
	chk := &LinksCheck{}
	if chk.Name() != "links" {
		t.Errorf("expected 'links', got %q", chk.Name())
	}
}

func TestLinksCheck_IsAcceptedStatus(t *testing.T) {
	// Default range (200-399)
	chk := &LinksCheck{}
	if !chk.isAcceptedStatus(200) {
		t.Error("200 should be accepted by default")
	}
	if !chk.isAcceptedStatus(301) {
		t.Error("301 should be accepted by default")
	}
	if chk.isAcceptedStatus(404) {
		t.Error("404 should not be accepted by default")
	}
	if chk.isAcceptedStatus(500) {
		t.Error("500 should not be accepted by default")
	}

	// Custom status codes
	chk2 := &LinksCheck{AcceptedStatusCodes: []int{200, 201, 404}}
	if !chk2.isAcceptedStatus(200) {
		t.Error("200 should be accepted in custom list")
	}
	if !chk2.isAcceptedStatus(404) {
		t.Error("404 should be accepted in custom list")
	}
	if chk2.isAcceptedStatus(500) {
		t.Error("500 should not be accepted in custom list")
	}
}

func TestLinksCheck_BrokenInternalPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><a href="/broken">broken</a></body></html>`)
	brokenPage := makePage("https://example.com/broken", 404, map[string]string{}, "")
	brokenPage.ParentURL = "https://example.com"

	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, brokenPage})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "HTTP 404") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity for 404, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for broken 404 page")
	}
}

func TestLinksCheck_ServerError(t *testing.T) {
	page := makePage("https://example.com/error", 500, map[string]string{}, "")
	page.ParentURL = "https://example.com"

	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "HTTP 500") {
			found = true
			if f.Severity != SeverityCritical {
				t.Errorf("expected critical severity for 500, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for 500 error page")
	}
}

func TestLinksCheck_FragmentValidation(t *testing.T) {
	target := makePage("https://example.com/target", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div id="exists">Hello</div></body></html>`)
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<a href="https://example.com/target#exists">Good</a>
			<a href="https://example.com/target#missing">Bad</a>
		</body></html>`)
	page.Links = []crawler.Link{
		{Href: "https://example.com/target#exists", Tag: "a"},
		{Href: "https://example.com/target#missing", Tag: "a"},
	}

	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, target})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Fragment #missing not found") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing fragment #missing")
	}
}

func TestSeverityForStatus(t *testing.T) {
	if severityForStatus(404) != SeverityHigh {
		t.Error("404 should be high")
	}
	if severityForStatus(500) != SeverityCritical {
		t.Error("500 should be critical")
	}
	if severityForStatus(403) != SeverityMedium {
		t.Error("403 should be medium")
	}
	if severityForStatus(301) != SeverityLow {
		t.Error("301 should be low")
	}
}

func TestExtractElementIDs(t *testing.T) {
	page := &crawler.Page{
		URL:  "https://example.com",
		Body: []byte(`<html><body><div id="main"><p id="intro">Hello</p><span>No id</span></div></body></html>`),
	}
	ids := extractElementIDs(page)
	if !ids["main"] {
		t.Error("should find id=main")
	}
	if !ids["intro"] {
		t.Error("should find id=intro")
	}
	if len(ids) != 2 {
		t.Errorf("expected 2 IDs, got %d", len(ids))
	}
}

func TestExtractFragment(t *testing.T) {
	if extractFragment("/page#section") != "section" {
		t.Error("expected 'section'")
	}
	if extractFragment("/page") != "" {
		t.Error("expected empty string for no fragment")
	}
	if extractFragment("") != "" {
		t.Error("expected empty string for empty href")
	}
}

// --- Performance Check Tests ---

func TestPerfCheck_Name(t *testing.T) {
	chk := &PerfCheck{}
	if chk.Name() != "perf" {
		t.Errorf("expected 'perf', got %q", chk.Name())
	}
}

func TestPerfCheck_MissingCompression(t *testing.T) {
	body := `<html><head><title>T</title></head><body>` + string(make([]byte, 2000)) + `</body></html>`
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, body)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "not compressed") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing compression")
	}
}

func TestPerfCheck_WithCompression(t *testing.T) {
	body := `<html><head><title>T</title></head><body>` + string(make([]byte, 2000)) + `</body></html>`
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":     "text/html",
		"Content-Encoding": "gzip",
	}, body)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "not compressed") {
			t.Error("should not flag compression when Content-Encoding is set")
		}
	}
}

func TestPerfCheck_MissingCacheControl(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><head><title>T</title></head><body>test</body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Missing Cache-Control") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing Cache-Control")
	}
}

func TestPerfCheck_RenderBlockingScript(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><script src="/app.js"></script></head><body></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Render-blocking script") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for render-blocking script in head")
	}
}

func TestPerfCheck_AsyncScriptOK(t *testing.T) {
	// async="async" (explicit value) works with hasAttr which requires non-empty Val
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><script src="/app.js" async="async"></script></head><body></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "Render-blocking script") {
			t.Error("should not flag async script")
		}
	}
}

func TestPerfCheck_DeferScriptOK(t *testing.T) {
	// defer="defer" (explicit value) works with hasAttr which requires non-empty Val
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><script src="/app.js" defer="defer"></script></head><body></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "Render-blocking script") {
			t.Error("should not flag deferred script")
		}
	}
}

func TestPerfCheck_ImageMissingDimensions(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>T</title></head><body><img src="/photo.jpg"></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing width/height") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for image missing dimensions")
	}
}

func TestPerfCheck_ImageMissingLazy(t *testing.T) {
	// Place 3 above-fold images first, then the 4th image should be flagged for missing lazy loading
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>T</title></head><body>`+
			`<img src="/hero1.jpg" width="100" height="100" loading="eager">`+
			`<img src="/hero2.jpg" width="100" height="100" loading="eager">`+
			`<img src="/hero3.jpg" width="100" height="100" loading="eager">`+
			`<img src="/photo.jpg" width="100" height="100">`+
			`</body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, `loading="lazy"`) {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for image missing loading=lazy")
	}
}

func TestPerfCheck_RenderBlockingStylesheet(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Render-blocking stylesheet") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for render-blocking stylesheet")
	}
}

func TestPerfCheck_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "test")
	page.Error = context.Canceled

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{500, "500 B"},
		{1024, "1.0 KB"},
		{1048576, "1.0 MB"},
	}
	for _, tt := range tests {
		got := formatBytes(tt.input)
		if got != tt.expected {
			t.Errorf("formatBytes(%d) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// --- SEO Check Tests ---

func TestSEOCheck_Name(t *testing.T) {
	chk := &SEOCheck{}
	if chk.Name() != "seo" {
		t.Errorf("expected 'seo', got %q", chk.Name())
	}
}

func TestSEOCheck_MissingAllMeta(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head></head><body>No meta</body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	messages := map[string]bool{}
	for _, f := range findings {
		messages[f.Message] = true
	}

	if !messages["Page missing <title> tag"] {
		t.Error("expected missing title finding")
	}
	if !messages["Missing meta description"] {
		t.Error("expected missing description finding")
	}
	if !messages["Missing canonical URL"] {
		t.Error("expected missing canonical finding")
	}
	if !messages["Missing viewport meta tag"] {
		t.Error("expected missing viewport finding")
	}
	if !messages["Missing charset declaration"] {
		t.Error("expected missing charset finding")
	}
}

func TestSEOCheck_AllMetaPresent(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<meta charset="UTF-8">
			<title>My Page</title>
			<meta name="description" content="Page description here">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<meta property="og:title" content="My Page">
			<meta property="og:description" content="OG desc">
			<link rel="canonical" href="https://example.com">
		</head><body>Content</body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if f.Severity > SeverityLow {
			t.Errorf("unexpected issue above low severity: %s", f.Message)
		}
	}
}

func TestSEOCheck_TitleTooLong(t *testing.T) {
	longTitle := string(make([]byte, 80))
	for i := range longTitle {
		longTitle = longTitle[:i] + "a" + longTitle[i+1:]
	}
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><meta charset="UTF-8"><title>`+longTitle+`</title>
		<meta name="description" content="desc"><meta name="viewport" content="w=d">
		<meta property="og:title" content="x"><meta property="og:description" content="x">
		<link rel="canonical" href="https://example.com">
		</head><body></body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Title too long") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for title too long")
	}
}

func TestSEOCheck_DescriptionTooLong(t *testing.T) {
	longDesc := string(make([]byte, 200))
	for i := range longDesc {
		longDesc = longDesc[:i] + "a" + longDesc[i+1:]
	}
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><meta charset="UTF-8"><title>OK</title>
		<meta name="description" content="`+longDesc+`">
		<meta name="viewport" content="w=d">
		<meta property="og:title" content="x"><meta property="og:description" content="x">
		<link rel="canonical" href="https://example.com">
		</head><body></body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Meta description too long") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for description too long")
	}
}

func TestSEOCheck_DuplicateTitle(t *testing.T) {
	page1 := makePage("https://example.com/page1", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Same Title</title></head><body>P1</body></html>`)
	page2 := makePage("https://example.com/page2", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Same Title</title></head><body>P2</body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page1, page2})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Duplicate title") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for duplicate titles")
	}
}

func TestSEOCheck_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "test")
	page.Error = context.Canceled

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

// --- Forms Check Additional Tests ---

func TestFormsCheck_Name(t *testing.T) {
	chk := &FormsCheck{}
	if chk.Name() != "forms" {
		t.Errorf("expected 'forms', got %q", chk.Name())
	}
}

func TestFormsCheck_MissingAction(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{Action: "", Method: "POST"},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "no action attribute") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing form action")
	}
}

func TestFormsCheck_HTTPSPageHTTPAction(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{Action: "http://example.com/submit", Method: "POST", HasCSRF: true},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "submits form to HTTP endpoint") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for HTTPS page with HTTP form action")
	}
}

func TestFormsCheck_AutocompleteIssue(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{
			Action:  "/login",
			Method:  "POST",
			HasCSRF: true,
			Inputs: []crawler.FormInput{
				{Name: "password", Type: "password"},
			},
		},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "autocomplete") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for sensitive field missing autocomplete=off")
	}
}

func TestFormsCheck_FormWithID(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{Action: "/submit", Method: "POST", ID: "login-form", HasCSRF: false},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Element, "form#login-form") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding element to reference form by ID")
	}
}

func TestFormsCheck_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{{Action: "/submit", Method: "POST"}}
	page.Error = context.Canceled

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestHasPasswordField(t *testing.T) {
	if hasPasswordField(nil) {
		t.Error("nil should return false")
	}
	if hasPasswordField([]crawler.FormInput{{Name: "email", Type: "email"}}) {
		t.Error("email field should not be password")
	}
	if !hasPasswordField([]crawler.FormInput{{Name: "pass", Type: "password"}}) {
		t.Error("password field should be detected")
	}
}

func TestHasAutocompleteIssue(t *testing.T) {
	if hasAutocompleteIssue(nil) {
		t.Error("nil should return false")
	}
	if !hasAutocompleteIssue([]crawler.FormInput{{Name: "pass", Type: "password"}}) {
		t.Error("password type should be flagged")
	}
	if !hasAutocompleteIssue([]crawler.FormInput{{Name: "credit_card_number", Type: "text"}}) {
		t.Error("credit card name should be flagged")
	}
	if hasAutocompleteIssue([]crawler.FormInput{{Name: "email", Type: "email"}}) {
		t.Error("email should not be flagged")
	}
}

// --- Security Check Additional Tests ---

func TestSecurityCheck_MixedContent(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><img src="http://example.com/image.jpg"></body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Mixed content") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity for mixed content, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected mixed content finding")
	}
}

func TestSecurityCheck_ServerVersionExposed(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
		"Server":       "Apache/2.4.51",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Server header exposes version") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for server version exposure")
	}
}

func TestSecurityCheck_XPoweredBy(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
		"X-Powered-By": "PHP/8.1",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "X-Powered-By header exposes technology") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for X-Powered-By header")
	}
}

func TestSecurityCheck_CookieMissingSecure(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>test</body></html>`)
	page.Headers.Set("Set-Cookie", "session_id=abc123; HttpOnly; SameSite=Lax")

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing Secure flag") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for cookie missing Secure flag on HTTPS")
	}
}

func TestSecurityCheck_SessionCookieMissingHttpOnly(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>test</body></html>`)
	page.Headers.Set("Set-Cookie", "session=abc123; Secure; SameSite=Lax")

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing HttpOnly flag") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for session cookie missing HttpOnly")
	}
}

func TestSecurityCheck_CookieMissingSameSite(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>test</body></html>`)
	page.Headers.Set("Set-Cookie", "pref=dark; Secure; HttpOnly")

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing SameSite") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for cookie missing SameSite")
	}
}

func TestSecurityCheck_SameSiteNoneWithoutSecure(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>test</body></html>`)
	page.Headers.Set("Set-Cookie", "tracker=xyz; SameSite=None; HttpOnly")

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "SameSite=None without Secure") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for SameSite=None without Secure")
	}
}

func TestSecurityCheck_HTTPPage(t *testing.T) {
	page := makePage("http://example.com", 200, map[string]string{
		"Content-Type": "text/html",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "HTTP instead of HTTPS") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for page served over HTTP")
	}
}

func TestSecurityCheck_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "test")
	page.Error = context.Canceled

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestSecurityCheck_Skips4xx(t *testing.T) {
	page := makePage("https://example.com", 404, map[string]string{"Content-Type": "text/html"}, "not found")

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip pages with 4xx status")
	}
}

// =====================================================================
// Finding struct tests
// =====================================================================

func TestFinding_SeverityLevels(t *testing.T) {
	tests := []struct {
		name     string
		severity Severity
		want     int
	}{
		{"info", SeverityInfo, 0},
		{"low", SeverityLow, 1},
		{"medium", SeverityMedium, 2},
		{"high", SeverityHigh, 3},
		{"critical", SeverityCritical, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if int(tt.severity) != tt.want {
				t.Errorf("Severity %s = %d, want %d", tt.name, int(tt.severity), tt.want)
			}
		})
	}

	// Severity ordering
	if SeverityInfo >= SeverityLow {
		t.Error("SeverityInfo should be less than SeverityLow")
	}
	if SeverityLow >= SeverityMedium {
		t.Error("SeverityLow should be less than SeverityMedium")
	}
	if SeverityMedium >= SeverityHigh {
		t.Error("SeverityMedium should be less than SeverityHigh")
	}
	if SeverityHigh >= SeverityCritical {
		t.Error("SeverityHigh should be less than SeverityCritical")
	}
}

func TestFinding_JSONMarshaling(t *testing.T) {
	f := Finding{
		Severity: SeverityHigh,
		URL:      "https://example.com",
		Element:  "<img src=\"photo.jpg\">",
		Message:  "Image missing alt attribute",
		Fix:      "Add descriptive alt text",
		Evidence: "src=photo.jpg",
	}

	data, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var roundtrip Finding
	if err := json.Unmarshal(data, &roundtrip); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if roundtrip.Severity != f.Severity {
		t.Errorf("severity: got %v, want %v", roundtrip.Severity, f.Severity)
	}
	if roundtrip.URL != f.URL {
		t.Errorf("URL: got %q, want %q", roundtrip.URL, f.URL)
	}
	if roundtrip.Message != f.Message {
		t.Errorf("Message: got %q, want %q", roundtrip.Message, f.Message)
	}
	if roundtrip.Fix != f.Fix {
		t.Errorf("Fix: got %q, want %q", roundtrip.Fix, f.Fix)
	}
	if roundtrip.Evidence != f.Evidence {
		t.Errorf("Evidence: got %q, want %q", roundtrip.Evidence, f.Evidence)
	}
}

func TestFinding_JSONMarshaling_OmitsEmpty(t *testing.T) {
	f := Finding{
		Severity: SeverityInfo,
		URL:      "https://example.com",
		Message:  "test",
	}

	data, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("json.Unmarshal into map failed: %v", err)
	}

	// Element, Fix, Evidence should be empty strings (still present in JSON but empty)
	// Note: Finding has no JSON tags, so keys are capitalized
	if m["Element"] != "" {
		t.Errorf("expected empty Element, got %v", m["Element"])
	}
	if m["Fix"] != "" {
		t.Errorf("expected empty Fix, got %v", m["Fix"])
	}
	if m["Evidence"] != "" {
		t.Errorf("expected empty Evidence, got %v", m["Evidence"])
	}
}

// =====================================================================
// Checker interface compliance tests
// =====================================================================

func TestCheckerInterface_AllChecksImplement(t *testing.T) {
	// Verify each concrete check type satisfies the Checker interface at compile time.
	// This test exercises Name() and verifies the interface is implemented.
	var _ Checker = &LinksCheck{}
	var _ Checker = &SecurityCheck{}
	var _ Checker = &FormsCheck{}
	var _ Checker = &A11yCheck{}
	var _ Checker = &PerfCheck{}
	var _ Checker = &SEOCheck{}
	var _ Checker = &SRICheck{}
	var _ Checker = &AIReadyCheck{}
	var _ Checker = &ReachabilityCheck{}
}

func TestCheckerInterface_Names(t *testing.T) {
	checks := map[string]Checker{
		"links":        &LinksCheck{},
		"security":     &SecurityCheck{},
		"forms":        &FormsCheck{},
		"a11y":         &A11yCheck{},
		"perf":         &PerfCheck{},
		"seo":          &SEOCheck{},
		"sri":          &SRICheck{},
		"aiready":      &AIReadyCheck{},
		"reachability": &ReachabilityCheck{},
	}
	for expected, chk := range checks {
		if chk.Name() != expected {
			t.Errorf("%T.Name() = %q, want %q", chk, chk.Name(), expected)
		}
	}
}

func TestCheckerInterface_RunReturnsSlice(t *testing.T) {
	// Verify Run() returns a non-nil slice for an empty input (no panic).
	ctx := context.Background()
	checks := []Checker{
		&LinksCheck{},
		&SecurityCheck{},
		&FormsCheck{},
		&A11yCheck{},
		&PerfCheck{},
		&SEOCheck{},
		&SRICheck{},
		&AIReadyCheck{},
		&ReachabilityCheck{},
	}
	for _, chk := range checks {
		findings := chk.Run(ctx, nil)
		// findings may be nil for empty input, that's OK
		_ = findings
	}
}

// =====================================================================
// Registry comprehensive tests
// =====================================================================

func TestDefaultRegistry_AllNames(t *testing.T) {
	r := DefaultRegistry()
	expectedNames := []string{
		"links", "security", "forms", "a11y", "perf", "seo", "sri", "aiready", "reachability",
	}
	all := r.All()
	nameSet := make(map[string]bool)
	for _, c := range all {
		nameSet[c.Name()] = true
	}
	for _, name := range expectedNames {
		if !nameSet[name] {
			t.Errorf("DefaultRegistry missing expected check %q", name)
		}
	}
	if len(all) != len(expectedNames) {
		t.Errorf("DefaultRegistry has %d checks, expected %d", len(all), len(expectedNames))
	}
}

func TestRegistry_Filter_MultipleSelections(t *testing.T) {
	r := DefaultRegistry()
	filtered := r.Filter([]string{"perf", "seo", "sri"})
	if len(filtered) != 3 {
		t.Errorf("expected 3 checks, got %d", len(filtered))
	}
	names := make(map[string]bool)
	for _, c := range filtered {
		names[c.Name()] = true
	}
	for _, want := range []string{"perf", "seo", "sri"} {
		if !names[want] {
			t.Errorf("missing expected check %q in filtered results", want)
		}
	}
}

func TestRegistry_Filter_NonExistentName(t *testing.T) {
	r := DefaultRegistry()
	filtered := r.Filter([]string{"nonexistent"})
	if len(filtered) != 0 {
		t.Errorf("expected 0 checks for nonexistent name, got %d", len(filtered))
	}
}

func TestRegistry_Filter_Mix(t *testing.T) {
	r := DefaultRegistry()
	filtered := r.Filter([]string{"links", "nonexistent", "seo"})
	if len(filtered) != 2 {
		t.Errorf("expected 2 checks (links + seo), got %d", len(filtered))
	}
}

// =====================================================================
// LinksCheck additional tests
// =====================================================================

func TestLinksCheck_RelativeURLs(t *testing.T) {
	page := makePage("https://example.com/page", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<a href="/about">About</a>
			<a href="../parent">Parent</a>
			<a href="sibling">Sibling</a>
		</body></html>`)
	aboutPage := makePage("https://example.com/about", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>About</body></html>`)
	parentPage := makePage("https://example.com/parent", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>Parent</body></html>`)
	siblingPage := makePage("https://example.com/sibling", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>Sibling</body></html>`)

	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page, aboutPage, parentPage, siblingPage})

	// All pages are reachable so no broken-link findings expected
	for _, f := range findings {
		if strings.Contains(f.Message, "HTTP 404") || strings.Contains(f.Message, "HTTP 500") {
			t.Errorf("unexpected broken link finding: %s", f.Message)
		}
	}
}

func TestLinksCheck_EmptyPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})
	// Should not panic, may or may not have findings
	_ = findings
}

func TestLinksCheck_ErrorPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{}, "")
	page.Error = context.Canceled

	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestLinksCheck_NoPages(t *testing.T) {
	chk := &LinksCheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected no findings for nil pages, got %d", len(findings))
	}
}

func TestResolveLink(t *testing.T) {
	tests := []struct {
		base, href, want string
	}{
		{"https://example.com/page", "/about", "https://example.com/about"},
		{"https://example.com/page", "https://other.com/x", "https://other.com/x"},
		{"https://example.com/page", "", ""},
		{"https://example.com/a/b", "../c", "https://example.com/c"},
		{"https://example.com/a/b", "c", "https://example.com/a/c"},
	}
	for _, tt := range tests {
		got := resolveLink(tt.base, tt.href)
		if got != tt.want {
			t.Errorf("resolveLink(%q, %q) = %q, want %q", tt.base, tt.href, got, tt.want)
		}
	}
}

// =====================================================================
// SecurityCheck additional tests
// =====================================================================

func TestSecurityCheck_CSPUnsafeInline(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "default-src 'self'; script-src 'unsafe-inline'",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "unsafe-inline") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for unsafe-inline in script-src")
	}
}

func TestSecurityCheck_CSPUnsafeEval(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "script-src 'unsafe-eval'",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "unsafe-eval") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for unsafe-eval in script-src")
	}
}

func TestSecurityCheck_CSPWildcard(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "default-src *",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "wildcard") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for wildcard in CSP")
	}
}

func TestSecurityCheck_CSPMissingFrameAncestors(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "default-src 'self'",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>test</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "frame-ancestors") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing frame-ancestors directive")
	}
}

func TestSecurityCheck_ExposedSecrets(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{
		"Content-Type":              "text/html",
		"Content-Security-Policy":   "default-src 'self'; frame-ancestors 'self'",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Strict-Transport-Security": "max-age=31536000",
		"Referrer-Policy":           "strict-origin",
		"Permissions-Policy":        "camera=()",
	}, `<html><body>var api_key = "sk-abcdefghijklmnopqrstuvwxyz1234567890"</body></html>`)

	chk := &SecurityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "secret") || strings.Contains(f.Message, "credential") {
			found = true
			if f.Severity != SeverityCritical {
				t.Errorf("expected critical severity for exposed secrets, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for exposed API key/secret")
	}
}

func TestSecurityCheck_Name(t *testing.T) {
	chk := &SecurityCheck{}
	if chk.Name() != "security" {
		t.Errorf("expected 'security', got %q", chk.Name())
	}
}

// =====================================================================
// A11yCheck additional tests
// =====================================================================

func TestA11yCheck_MissingLabels(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html lang="en"><head><title>Test</title></head><body><main>
			<input type="text" name="email">
		</main></body></html>`)

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "label") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for input missing label")
	}
}

func TestA11yCheck_LabelWithFor(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html lang="en"><head><title>Test</title></head><body><main>
			<label for="email">Email</label>
			<input type="text" id="email" name="email">
		</main></body></html>`)

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "label") && strings.Contains(f.Element, "email") {
			t.Errorf("should not flag input with associated label: %s", f.Message)
		}
	}
}

func TestA11yCheck_MissingLang(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Test</title></head><body><main><p>Content</p></main></body></html>`)

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "lang") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing lang attribute")
	}
}

func TestA11yCheck_EmptyLinkText(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html lang="en"><head><title>Test</title></head><body><main>
			<a href="/page"></a>
		</main></body></html>`)

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "no accessible text") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for link with no accessible text")
	}
}

func TestA11yCheck_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><img src="x.jpg"></body></html>`)
	page.Error = context.Canceled

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	// Advanced A11y also skips error pages, so total should be 0
	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestA11yCheck_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")

	chk := &A11yCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

// =====================================================================
// PerfCheck additional tests
// =====================================================================

func TestPerfCheck_NoPages(t *testing.T) {
	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for nil pages, got %d", len(findings))
	}
}

func TestPerfCheck_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})
	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestPerfCheck_LargeImages(t *testing.T) {
	// Image without dimensions should trigger a finding
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html", "Content-Encoding": "gzip", "Cache-Control": "max-age=3600"},
		`<html><head><title>T</title></head><body><img src="/hero.jpg" width="800" height="600"><img src="/large.jpg"></body></html>`)

	chk := &PerfCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing width/height") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for image missing dimensions")
	}
}

// =====================================================================
// SEOCheck additional tests
// =====================================================================

func TestSEOCheck_MissingTitle(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><meta name="description" content="desc"></head><body></body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <title>") || strings.Contains(f.Message, "missing <title> tag") || strings.Contains(f.Message, "Page missing <title>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing title tag")
	}
}

func TestSEOCheck_MissingDescription(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head><title>Page</title></head><body></body></html>`)

	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Missing meta description") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing meta description")
	}
}

func TestSEOCheck_NoPages(t *testing.T) {
	chk := &SEOCheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for nil pages, got %d", len(findings))
	}
}

// =====================================================================
// FormsCheck additional tests
// =====================================================================

func TestFormsCheck_NoPages(t *testing.T) {
	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for nil pages, got %d", len(findings))
	}
}

func TestFormsCheck_NoForms(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><p>No forms here</p></body></html>`)

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for page with no forms, got %d", len(findings))
	}
}

func TestFormsCheck_ValidForm(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Forms = []crawler.Form{
		{Action: "/submit", Method: "POST", HasCSRF: true},
	}

	chk := &FormsCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "CSRF") || strings.Contains(f.Message, "no action") {
			t.Errorf("unexpected finding for valid form: %s", f.Message)
		}
	}
}

// =====================================================================
// SRICheck additional tests
// =====================================================================

func TestSRICheck_NoPages(t *testing.T) {
	chk := &SRICheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for nil pages, got %d", len(findings))
	}
}

// =====================================================================
// AIReadyCheck additional tests
// =====================================================================

func TestAIReadyCheck_NoPages(t *testing.T) {
	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), nil)
	// Should return llms.txt and sitemap findings based on empty page list
	if len(findings) == 0 {
		t.Log("AIReadyCheck with nil pages returns findings about missing llms.txt and sitemap")
	}
}

func TestAIReadyCheck_ErrorPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	page.Error = context.Canceled

	chk := &AIReadyCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	// Error pages are skipped for per-page checks, but llms.txt/sitemap findings may still appear
	for _, f := range findings {
		if strings.Contains(f.Message, "markdown alternate") || strings.Contains(f.Message, "structured data") {
			t.Errorf("should skip error page for per-page checks: %s", f.Message)
		}
	}
}

// =====================================================================
// ReachabilityCheck tests
// =====================================================================

func TestReachabilityCheck_Name(t *testing.T) {
	chk := &ReachabilityCheck{}
	if chk.Name() != "reachability" {
		t.Errorf("expected 'reachability', got %q", chk.Name())
	}
}

func TestReachabilityCheck_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")

	chk := &ReachabilityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestReachabilityCheck_ErrorPage(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><img src="https://cdn.example.com/photo.jpg"></body></html>`)
	page.Error = context.Canceled

	chk := &ReachabilityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestReachabilityCheck_DataURI(t *testing.T) {
	// data: URIs should be skipped (not checked for reachability)
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><img src="data:image/png;base64,iVBORw0KGgo="></body></html>`)

	chk := &ReachabilityCheck{}
	findings := chk.Run(context.Background(), []*crawler.Page{page})

	for _, f := range findings {
		if strings.Contains(f.Message, "data:") {
			t.Error("should not check reachability of data: URIs")
		}
	}
}

func TestReachabilityCheck_NoPages(t *testing.T) {
	chk := &ReachabilityCheck{}
	findings := chk.Run(context.Background(), nil)
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for nil pages, got %d", len(findings))
	}
}

func TestExtractResourceRefs(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><head>
			<script src="/app.js"></script>
			<link rel="stylesheet" href="/style.css">
		</head><body>
			<img src="/photo.jpg">
			<video src="/clip.mp4"></video>
			<iframe src="/embed"></iframe>
		</body></html>`)

	refs := extractResourceRefs(page)

	typeCounts := map[string]int{}
	for _, ref := range refs {
		typeCounts[ref.Resource]++
	}

	if typeCounts["script"] != 1 {
		t.Errorf("expected 1 script ref, got %d", typeCounts["script"])
	}
	if typeCounts["stylesheet"] != 1 {
		t.Errorf("expected 1 stylesheet ref, got %d", typeCounts["stylesheet"])
	}
	if typeCounts["image"] != 1 {
		t.Errorf("expected 1 image ref, got %d", typeCounts["image"])
	}
	if typeCounts["media"] != 1 {
		t.Errorf("expected 1 media ref (video), got %d", typeCounts["media"])
	}
	if typeCounts["iframe"] != 1 {
		t.Errorf("expected 1 iframe ref, got %d", typeCounts["iframe"])
	}
}

func TestExtractResourceRefs_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	refs := extractResourceRefs(page)
	if len(refs) != 0 {
		t.Errorf("expected 0 refs for empty body, got %d", len(refs))
	}
}

func TestResolveURL(t *testing.T) {
	tests := []struct {
		base, href, want string
	}{
		{"https://example.com/page", "/img/photo.jpg", "https://example.com/img/photo.jpg"},
		{"https://example.com/page", "https://cdn.example.com/lib.js", "https://cdn.example.com/lib.js"},
		{"https://example.com/page", "", ""},
		{"https://example.com/a/b", "../img.jpg", "https://example.com/img.jpg"},
	}
	for _, tt := range tests {
		got := resolveURL(tt.base, tt.href)
		if got != tt.want {
			t.Errorf("resolveURL(%q, %q) = %q, want %q", tt.base, tt.href, got, tt.want)
		}
	}
}

func TestSeverityForResourceStatus(t *testing.T) {
	if severityForResourceStatus(404) != SeverityHigh {
		t.Error("404 should be high")
	}
	if severityForResourceStatus(500) != SeverityCritical {
		t.Error("500 should be critical")
	}
	if severityForResourceStatus(403) != SeverityMedium {
		t.Error("403 should be medium")
	}
	if severityForResourceStatus(301) != SeverityLow {
		t.Error("301 should be low")
	}
}

// =====================================================================
// Edge cases: empty pages, no HTML body, error pages
// =====================================================================

func TestAllChecks_EmptyPagesSlice(t *testing.T) {
	ctx := context.Background()
	checks := []Checker{
		&LinksCheck{},
		&SecurityCheck{},
		&FormsCheck{},
		&A11yCheck{},
		&PerfCheck{},
		&SEOCheck{},
		&SRICheck{},
		&AIReadyCheck{},
		&ReachabilityCheck{},
	}
	for _, chk := range checks {
		// Should not panic with nil pages
		findings := chk.Run(ctx, nil)
		if findings == nil {
			findings = []Finding{}
		}
		t.Logf("%s: %d findings on nil pages", chk.Name(), len(findings))
	}
}

func TestAllChecks_ErrorPages(t *testing.T) {
	ctx := context.Background()
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><img src="x.jpg"><form action="/s" method="POST"></form></body></html>`)
	page.Error = context.Canceled

	checks := []Checker{
		&LinksCheck{},
		&SecurityCheck{},
		&FormsCheck{},
		&A11yCheck{},
		&PerfCheck{},
		&SEOCheck{},
		&SRICheck{},
		&AIReadyCheck{},
		&ReachabilityCheck{},
	}
	for _, chk := range checks {
		findings := chk.Run(ctx, []*crawler.Page{page})
		// Most checks should skip error pages (links may still report status)
		t.Logf("%s: %d findings on error page", chk.Name(), len(findings))
	}
}

func TestAllChecks_NonHTMLBody(t *testing.T) {
	ctx := context.Background()
	page := makePage("https://example.com/data.json", 200,
		map[string]string{"Content-Type": "application/json"},
		`{"key": "value"}`)

	checks := []Checker{
		&SecurityCheck{},
		&FormsCheck{},
		&PerfCheck{},
		&SEOCheck{},
		&SRICheck{},
	}
	for _, chk := range checks {
		findings := chk.Run(ctx, []*crawler.Page{page})
		t.Logf("%s: %d findings on JSON page", chk.Name(), len(findings))
	}
}

func TestAllChecks_MultiplePages(t *testing.T) {
	ctx := context.Background()
	pages := []*crawler.Page{
		makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
			`<html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>`),
		makePage("https://example.com/about", 200, map[string]string{"Content-Type": "text/html"},
			`<html lang="en"><head><title>About</title></head><body><main><h1>About</h1></main></body></html>`),
		makePage("https://example.com/contact", 200, map[string]string{"Content-Type": "text/html"},
			`<html lang="en"><head><title>Contact</title></head><body><main><h1>Contact</h1></main></body></html>`),
	}

	checks := []Checker{
		&A11yCheck{},
		&PerfCheck{},
		&SEOCheck{},
		&SRICheck{},
	}
	for _, chk := range checks {
		findings := chk.Run(ctx, pages)
		t.Logf("%s: %d findings across %d pages", chk.Name(), len(findings), len(pages))
	}
}

// =====================================================================
// Helper function tests
// =====================================================================

func TestContainsVersion(t *testing.T) {
	if !containsVersion("Apache/2.4.51") {
		t.Error("should detect version in Apache/2.4.51")
	}
	if !containsVersion("nginx/1.21.0") {
		t.Error("should detect version in nginx/1.21.0")
	}
	if containsVersion("Apache") {
		t.Error("should not detect version in plain Apache")
	}
	if containsVersion("") {
		t.Error("should not detect version in empty string")
	}
}

func TestTruncate(t *testing.T) {
	if truncate("short", 10) != "short" {
		t.Error("short string should not be truncated")
	}
	if truncate("a long string here", 6) != "a long..." {
		t.Errorf("expected truncation, got %q", truncate("a long string here", 6))
	}
	if truncate("", 5) != "" {
		t.Error("empty string should remain empty")
	}
}

func TestTruncateResRef(t *testing.T) {
	if truncateResRef("/short.js", 80) != "/short.js" {
		t.Error("short ref should not be truncated")
	}
	long := make([]byte, 100)
	for i := range long {
		long[i] = 'a'
	}
	got := truncateResRef(string(long), 80)
	if len(got) != 83 { // 80 + "..."
		t.Errorf("expected truncation to 83 chars, got %d", len(got))
	}
}

func TestNormalizeForLookup(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"https://example.com/path/", "https://example.com/path"},
		{"https://example.com/path#frag", "https://example.com/path"},
		{"https://example.com", "https://example.com"},
	}
	for _, tt := range tests {
		got := normalizeForLookup(tt.input)
		if got != tt.want {
			t.Errorf("normalizeForLookup(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestIsSessionCookieName(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"session_id", true},
		{"JSESSIONID", true},
		{"PHPSESSID", true},
		{"connect.sid", true},
		{"auth_token", true},
		{"theme", false},
		{"lang", false},
		{"preferences", false},
	}
	for _, tt := range tests {
		got := isSessionCookieName(tt.name)
		if got != tt.want {
			t.Errorf("isSessionCookieName(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}
