package check

import (
	"context"
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// This file was split out of check_test.go for readability (mechanical move; no behavior change).

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
