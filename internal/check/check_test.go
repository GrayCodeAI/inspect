package check

import (
	"context"
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

// Note: additional tests for the check package live in check_more_test.go
// and check_extra_test.go (split out for file size/clarity).
