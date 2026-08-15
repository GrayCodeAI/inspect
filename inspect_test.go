package inspect_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

func TestScan_BasicSite(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="description" content="Test site for inspect">
	<title>Test Site</title>
</head>
<body>
	<main>
		<h1>Welcome</h1>
		<a href="/about">About</a>
		<a href="/broken">Broken Link</a>
		<img src="/logo.png" alt="Logo">
	</main>
</body>
</html>`)
	})
	mux.HandleFunc("/about", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>About</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="About page"></head>
<body><main><h1>About</h1><a href="/">Home</a></main></body>
</html>`)
	})
	mux.HandleFunc("/broken", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.Quick, inspect.WithAllowPrivateIPs())
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	if report.CrawledURLs < 2 {
		t.Errorf("expected at least 2 crawled URLs, got %d", report.CrawledURLs)
	}

	hasLinkFinding := false
	for _, f := range report.Findings {
		if f.Check == "links" && f.Severity == inspect.SeverityHigh {
			hasLinkFinding = true
		}
	}
	if !hasLinkFinding {
		t.Error("expected to find broken link finding")
	}
}

func TestScan_SecurityHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Test</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="test"></head><body><main><h1>Hello</h1></main></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("security"), inspect.WithDepth(1), inspect.WithAllowPrivateIPs())
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	if report.Stats.FindingsTotal == 0 {
		t.Error("expected security findings for missing headers")
	}

	hasCSP := false
	for _, f := range report.Findings {
		if f.Check == "security" && f.Message == "Missing security header: Content-Security-Policy" {
			hasCSP = true
		}
	}
	if !hasCSP {
		t.Error("expected missing CSP header finding")
	}
}

func TestScan_FormCSRF(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Forms</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="forms test"></head>
<body><main>
	<h1>Login</h1>
	<form method="POST" action="/login">
		<input name="email" type="email" required>
		<input name="password" type="password" required>
		<button type="submit">Login</button>
	</form>
</main></body>
</html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("forms"), inspect.WithDepth(1), inspect.WithAllowPrivateIPs())
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	hasCSRF := false
	for _, f := range report.Findings {
		if f.Check == "forms" && f.Severity == inspect.SeverityHigh {
			hasCSRF = true
		}
	}
	if !hasCSRF {
		t.Error("expected missing CSRF token finding")
	}
}

func TestScan_Accessibility(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html>
<head><title>A11y Test</title></head>
<body>
	<h1>Title</h1>
	<img src="/photo.jpg">
	<h3>Skipped heading</h3>
	<a href="/page"></a>
</body>
</html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("a11y"), inspect.WithDepth(1), inspect.WithAllowPrivateIPs())
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	checks := map[string]bool{}
	for _, f := range report.Findings {
		checks[f.Message] = true
	}

	if !checks["Image missing alt attribute"] {
		t.Error("expected missing alt attribute finding")
	}
	if !checks["Page missing lang attribute on <html> element"] {
		t.Error("expected missing lang finding")
	}
}

func TestReport_Failed(t *testing.T) {
	r := &inspect.Report{
		FailOn: inspect.SeverityHigh,
		Findings: []inspect.Finding{
			{Severity: inspect.SeverityLow, Message: "minor issue"},
		},
	}
	if r.Failed() {
		t.Error("should not fail on low finding when threshold is high")
	}

	r.Findings = append(r.Findings, inspect.Finding{
		Severity: inspect.SeverityHigh, Message: "major issue",
	})
	if !r.Failed() {
		t.Error("should fail when finding meets threshold")
	}
}

func TestReport_MaxSeverity(t *testing.T) {
	r := &inspect.Report{
		Findings: []inspect.Finding{
			{Severity: inspect.SeverityLow},
			{Severity: inspect.SeverityCritical},
			{Severity: inspect.SeverityMedium},
		},
	}
	if r.MaxSeverity() != inspect.SeverityCritical {
		t.Errorf("expected critical, got %v", r.MaxSeverity())
	}
}

func TestScan_EmptyURL(t *testing.T) {
	_, err := inspect.Scan(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty URL")
	}
}

func TestScan_Presets(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>X</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="x"></head><body><main><h1>X</h1></main></body></html>`)
	}))
	defer srv.Close()

	presets := []inspect.Option{inspect.Quick, inspect.Standard, inspect.Deep, inspect.SecurityOnly, inspect.CI}
	for _, preset := range presets {
		_, err := inspect.Scan(context.Background(), srv.URL, preset, inspect.WithDepth(1), inspect.WithAllowPrivateIPs())
		if err != nil {
			t.Errorf("preset scan failed: %v", err)
		}
	}
}

// TestScanDir_DefaultOptions is a regression test: ScanDir serves the
// directory on an ephemeral loopback listener and must exempt exactly that
// listener from the crawler's SSRF protection (enabled by default), so the
// scan works without WithAllowPrivateIPs.
func TestScanDir_DefaultOptions(t *testing.T) {
	dir := t.TempDir()
	html := `<!DOCTYPE html><html><head><title>Local</title></head><body><h1>Hello</h1><img src="logo.png"></body></html>`
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}

	s := inspect.NewScanner() // default options: SSRF protection ON, no WithAllowPrivateIPs
	report, err := s.ScanDir(context.Background(), dir)
	if err != nil {
		t.Fatalf("ScanDir failed with default options: %v", err)
	}
	if report.CrawledURLs < 1 {
		t.Fatalf("expected at least 1 crawled URL, got %d", report.CrawledURLs)
	}

	// The page must actually have been fetched and analyzed. Before the
	// fix, SSRF protection rejected the scanner's own file server and the
	// report came back silently empty. The img without an alt attribute
	// produces a deterministic a11y finding that requires a parsed body.
	hasAltFinding := false
	for _, f := range report.Findings {
		if f.Check == "a11y" && strings.Contains(f.Message, "alt") {
			hasAltFinding = true
		}
	}
	if !hasAltFinding {
		t.Errorf("expected the local page to be analyzed (image alt finding); got %d findings — scan likely blocked by its own SSRF guard", len(report.Findings))
	}
}

// TestScan_LoopbackNotAllowlistedStillBlocked asserts the flip side of the
// ScanDir exemption: a loopback server that is NOT registered in the
// crawl's private-IP allowlist stays rejected under default options.
func TestScan_LoopbackNotAllowlistedStillBlocked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>X</title></head><body><main><h1>X</h1></main></body></html>`)
	}))
	defer srv.Close()

	s := inspect.NewScanner(inspect.Quick) // default SSRF protection, no WithAllowPrivateIPs
	report, err := s.Scan(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	// Every page fetch is rejected by SSRF protection, so no check can
	// analyze page content and the report must carry no findings. (When
	// the page is fetched, the Quick preset reports the broken img link,
	// and the full check set reports missing headers/meta — so findings
	// would be non-empty on a successful fetch.)
	if len(report.Findings) != 0 {
		for _, f := range report.Findings {
			t.Errorf("unexpected finding from blocked scan: [%s] %s", f.Check, f.Message)
		}
	}
}
