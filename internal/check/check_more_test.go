package check

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// This file was split out of check_test.go for readability (mechanical move; no behavior change).

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
