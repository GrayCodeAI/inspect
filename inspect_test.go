package inspect_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
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

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.Quick)
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

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("security"), inspect.WithDepth(1))
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

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("forms"), inspect.WithDepth(1))
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

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("a11y"), inspect.WithDepth(1))
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
		_, err := inspect.Scan(context.Background(), srv.URL, preset, inspect.WithDepth(1))
		if err != nil {
			t.Errorf("preset scan failed: %v", err)
		}
	}
}
