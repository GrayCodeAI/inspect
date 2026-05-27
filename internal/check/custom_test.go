package check

import (
	"context"
	"net/http"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// --- Test doubles ---

type fakeChecker struct {
	name     string
	findings []Finding
}

func (f *fakeChecker) Name() string { return f.name }

func (f *fakeChecker) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	return f.findings
}

type countingChecker struct {
	name    string
	called  int
	results []Finding
}

func (c *countingChecker) Name() string { return c.name }

func (c *countingChecker) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	c.called++
	return c.results
}

// --- Registering a custom check ---

func TestRegistry_RegisterCustomCheck(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "custom-a"})

	all := r.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 check, got %d", len(all))
	}
	if all[0].Name() != "custom-a" {
		t.Errorf("expected name 'custom-a', got %q", all[0].Name())
	}
}

func TestRegistry_RegisterMultipleCustomChecks(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "alpha"})
	r.Register(&fakeChecker{name: "beta"})
	r.Register(&fakeChecker{name: "gamma"})

	all := r.All()
	if len(all) != 3 {
		t.Fatalf("expected 3 checks, got %d", len(all))
	}

	names := make(map[string]bool)
	for _, c := range all {
		names[c.Name()] = true
	}
	for _, want := range []string{"alpha", "beta", "gamma"} {
		if !names[want] {
			t.Errorf("expected check %q to be registered", want)
		}
	}
}

func TestRegistry_RegisterOverwritesExisting(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "dup", findings: []Finding{{Message: "first"}}})
	r.Register(&fakeChecker{name: "dup", findings: []Finding{{Message: "second"}}})

	all := r.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 check after overwrite, got %d", len(all))
	}
}

func TestRegistry_RegisterMixedBuiltinAndCustom(t *testing.T) {
	r := DefaultRegistry()
	r.Register(&fakeChecker{name: "my-custom"})

	all := r.All()
	if len(all) != 10 {
		t.Fatalf("expected 10 checks (9 built-in + 1 custom), got %d", len(all))
	}

	found := false
	for _, c := range all {
		if c.Name() == "my-custom" {
			found = true
		}
	}
	if !found {
		t.Error("expected custom check 'my-custom' to be in registry")
	}
}

// --- Custom check execution ---

func TestRegistry_CustomCheckExecution(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	chk := &countingChecker{
		name:    "exec-test",
		results: []Finding{{Severity: SeverityHigh, Message: "bad"}},
	}
	r.Register(chk)

	page := makeTestPage("https://example.com", 200, nil, "body")

	all := r.All()
	if len(all) != 1 {
		t.Fatal("expected 1 check")
	}

	findings := all[0].Run(context.Background(), []*crawler.Page{page})

	if chk.called != 1 {
		t.Errorf("expected Run to be called once, got %d", chk.called)
	}
	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(findings))
	}
	if findings[0].Severity != SeverityHigh {
		t.Errorf("expected high severity, got %v", findings[0].Severity)
	}
	if findings[0].Message != "bad" {
		t.Errorf("expected message 'bad', got %q", findings[0].Message)
	}
}

func TestRegistry_CustomCheckNoFindings(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "clean", findings: nil})

	page := makeTestPage("https://example.com", 200, nil, "ok")
	findings := r.All()[0].Run(context.Background(), []*crawler.Page{page})

	if len(findings) != 0 {
		t.Errorf("expected no findings, got %d", len(findings))
	}
}

func TestRegistry_CustomCheckReceivesMultiplePages(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}

	var received []*crawler.Page
	capture := &captureChecker{
		name: "capture",
		runFn: func(ctx context.Context, pages []*crawler.Page) []Finding {
			received = pages
			return nil
		},
	}
	r.Register(capture)

	pages := []*crawler.Page{
		makeTestPage("https://a.com", 200, nil, "a"),
		makeTestPage("https://b.com", 200, nil, "b"),
		makeTestPage("https://c.com", 200, nil, "c"),
	}

	r.All()[0].Run(context.Background(), pages)

	if len(received) != 3 {
		t.Errorf("expected checker to receive 3 pages, got %d", len(received))
	}
}

// --- Custom check filtering ---

func TestRegistry_FilterIncludesCustomChecks(t *testing.T) {
	r := DefaultRegistry()
	r.Register(&fakeChecker{name: "custom-filter"})

	filtered := r.Filter([]string{"links", "custom-filter"})
	if len(filtered) != 2 {
		t.Fatalf("expected 2 checks, got %d", len(filtered))
	}

	names := make(map[string]bool)
	for _, c := range filtered {
		names[c.Name()] = true
	}
	if !names["links"] {
		t.Error("expected 'links' in filtered results")
	}
	if !names["custom-filter"] {
		t.Error("expected 'custom-filter' in filtered results")
	}
}

func TestRegistry_FilterCustomOnly(t *testing.T) {
	r := DefaultRegistry()
	r.Register(&fakeChecker{name: "only-me"})

	filtered := r.Filter([]string{"only-me"})
	if len(filtered) != 1 {
		t.Fatalf("expected 1 check, got %d", len(filtered))
	}
	if filtered[0].Name() != "only-me" {
		t.Errorf("expected 'only-me', got %q", filtered[0].Name())
	}
}

func TestRegistry_FilterExcludesUnmatched(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "a"})
	r.Register(&fakeChecker{name: "b"})
	r.Register(&fakeChecker{name: "c"})

	filtered := r.Filter([]string{"a", "nonexistent"})
	if len(filtered) != 1 {
		t.Fatalf("expected 1 check, got %d", len(filtered))
	}
	if filtered[0].Name() != "a" {
		t.Errorf("expected 'a', got %q", filtered[0].Name())
	}
}

func TestRegistry_FilterEmptyReturnsAll(t *testing.T) {
	r := DefaultRegistry()
	r.Register(&fakeChecker{name: "extra"})

	filtered := r.Filter(nil)
	if len(filtered) != 10 {
		t.Errorf("expected 10 checks for nil filter, got %d", len(filtered))
	}

	filtered = r.Filter([]string{})
	if len(filtered) != 10 {
		t.Errorf("expected 10 checks for empty filter, got %d", len(filtered))
	}
}

// --- Error handling for invalid checks ---

func TestRegistry_NilCheckerPanics(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	defer func() {
		if recover() == nil {
			t.Error("expected panic when registering nil checker")
		}
	}()
	r.Register(nil)
}

func TestRegistry_EmptyNameCheck(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: ""})

	// Should still be registered, just with empty name
	all := r.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 check, got %d", len(all))
	}
	if all[0].Name() != "" {
		t.Errorf("expected empty name, got %q", all[0].Name())
	}
}

func TestRegistry_DuplicateNamesLastWins(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "dup", findings: []Finding{{Message: "old"}}})
	r.Register(&fakeChecker{name: "dup", findings: []Finding{{Message: "new"}}})

	all := r.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 check after duplicate, got %d", len(all))
	}

	findings := all[0].Run(context.Background(), nil)
	if len(findings) != 1 || findings[0].Message != "new" {
		t.Error("expected last registered check to win")
	}
}

func TestRegistry_FilterWithEmptyString(t *testing.T) {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&fakeChecker{name: "real"})
	r.Register(&fakeChecker{name: ""})

	// Filtering for empty string should match the empty-name check
	filtered := r.Filter([]string{""})
	if len(filtered) != 1 {
		t.Fatalf("expected 1 check, got %d", len(filtered))
	}
}

// --- captureChecker is a test helper that captures the pages slice ---

type captureChecker struct {
	name  string
	runFn func(ctx context.Context, pages []*crawler.Page) []Finding
}

func (c *captureChecker) Name() string { return c.name }

func (c *captureChecker) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	if c.runFn != nil {
		return c.runFn(ctx, pages)
	}
	return nil
}

// --- makeTestPage is a local helper for creating test pages ---

func makeTestPage(url string, status int, headers map[string]string, body string) *crawler.Page {
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
	return p
}
