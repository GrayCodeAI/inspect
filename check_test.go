package inspect_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

// testChecker is a custom Checker implementation for testing.
type testChecker struct {
	name     string
	findings []inspect.Finding
}

func (c *testChecker) Name() string { return c.name }

func (c *testChecker) Run(ctx context.Context, pages []*inspect.Page) []inspect.Finding {
	return c.findings
}

func TestRegisterCheck_CustomChecker(t *testing.T) {
	defer inspect.ClearCustomChecks()

	checker := &testChecker{
		name: "my-custom-check",
		findings: []inspect.Finding{
			{
				Severity: inspect.SeverityHigh,
				URL:      "https://example.com",
				Message:  "Custom finding",
				Fix:      "Fix it",
			},
		},
	}

	inspect.RegisterCheck(checker)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Test</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="test"></head><body><main><h1>Hello</h1></main></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("my-custom-check"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	hasCustom := false
	for _, f := range report.Findings {
		if f.Check == "my-custom-check" && f.Message == "Custom finding" {
			hasCustom = true
		}
	}
	if !hasCustom {
		t.Error("expected to find custom check finding in report")
	}
}

func TestClearCustomChecks(t *testing.T) {
	checker := &testChecker{
		name: "to-be-cleared",
		findings: []inspect.Finding{
			{Severity: inspect.SeverityLow, Message: "temp"},
		},
	}
	inspect.RegisterCheck(checker)
	inspect.ClearCustomChecks()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("to-be-cleared"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	for _, f := range report.Findings {
		if f.Check == "to-be-cleared" {
			t.Error("should not find cleared check in report")
		}
	}
}

func TestRegisterRule_HeaderMissing(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "custom-header-check",
		RuleSeverity:  inspect.SeverityMedium,
		Description:   "Missing X-Custom header",
		HeaderMissing: []string{"X-Custom-Header"},
		FixSuggestion: "Add X-Custom-Header",
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("custom-header-check"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	found := false
	for _, f := range report.Findings {
		if f.Check == "custom-header-check" && strings.Contains(f.Message, "X-Custom-Header") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing X-Custom-Header")
	}
}

func TestRegisterRule_BodyMatch(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "no-todo-comments",
		RuleSeverity:  inspect.SeverityLow,
		Description:   "TODO comment in page source",
		BodyMatch:     []string{`(?i)<!--\s*TODO`},
		FixSuggestion: "Remove TODO comments before production",
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><body><!-- TODO: fix this later --><h1>Hi</h1></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("no-todo-comments"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	found := false
	for _, f := range report.Findings {
		if f.Check == "no-todo-comments" {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for TODO comment in body")
	}
}

func TestRegisterRule_BodyMissing(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "requires-analytics",
		RuleSeverity:  inspect.SeverityLow,
		Description:   "Analytics script required",
		BodyMissing:   []string{`google-analytics\.com|gtag`},
		FixSuggestion: "Add analytics tracking code",
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><body><h1>No analytics</h1></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("requires-analytics"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	found := false
	for _, f := range report.Findings {
		if f.Check == "requires-analytics" && strings.Contains(f.Message, "expected pattern not found") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing analytics pattern")
	}
}

func TestRegisterRule_HeaderMatch(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "no-server-version",
		RuleSeverity:  inspect.SeverityMedium,
		Description:   "Server exposes version",
		HeaderMatch:   map[string]string{"Server": `\d+\.\d+`},
		FixSuggestion: "Remove version from Server header",
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Server", "Apache/2.4.51")
		fmt.Fprint(w, `<!DOCTYPE html><html><body><h1>Hi</h1></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("no-server-version"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	found := false
	for _, f := range report.Findings {
		if f.Check == "no-server-version" && strings.Contains(f.Evidence, "Apache/2.4.51") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for Server version header match")
	}
}

func TestRegisterRule_URLMatch(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "api-check",
		RuleSeverity:  inspect.SeverityHigh,
		Description:   "API endpoint missing auth header",
		HeaderMissing: []string{"Authorization"},
		URLMatch:      `/api/`,
		FixSuggestion: "Ensure API endpoints require auth",
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><body><h1>Home</h1></body></html>`)
	}))
	defer srv.Close()

	// The scan URL does not contain /api/, so the rule should not fire
	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("api-check"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	for _, f := range report.Findings {
		if f.Check == "api-check" {
			t.Error("should not trigger api-check on non-API URL")
		}
	}
}

func TestRegisterRule_StatusCodes(t *testing.T) {
	defer inspect.ClearCustomChecks()

	inspect.RegisterRule(inspect.RuleCheck{
		RuleName:      "redirect-check",
		RuleSeverity:  inspect.SeverityLow,
		Description:   "Redirect detected",
		StatusCodes:   []int{301, 302},
		HeaderMissing: []string{"X-Irrelevant"},
		FixSuggestion: "Check redirect",
	})

	// 200 response should not match the rule (which requires 301/302)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><body><h1>Hi</h1></body></html>`)
	}))
	defer srv.Close()

	report, err := inspect.Scan(context.Background(), srv.URL, inspect.WithChecks("redirect-check"), inspect.WithDepth(1))
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	for _, f := range report.Findings {
		if f.Check == "redirect-check" {
			t.Error("should not fire redirect-check on 200 status")
		}
	}
}

