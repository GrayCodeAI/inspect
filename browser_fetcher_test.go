package inspect

import (
	"context"
	"testing"
	"time"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// fakeBrowser is a BrowserEngine that returns canned rendered HTML.
type fakeBrowser struct {
	html   string
	final  string
	err    error
	closed bool
}

func (f *fakeBrowser) RenderPage(_ context.Context, url string, _ BrowserOpts) (*PageData, error) {
	if f.err != nil {
		return nil, f.err
	}
	final := f.final
	if final == "" {
		final = url
	}
	return &PageData{
		FinalURL:     final,
		RenderedHTML: f.html,
		LoadTime:     5 * time.Millisecond,
	}, nil
}

func (f *fakeBrowser) Close() error { f.closed = true; return nil }

func TestBrowserFetcher_PopulatesRenderedPage(t *testing.T) {
	eng := &fakeBrowser{
		html:  `<html><body><a href="/next">next</a><a href="https://ext.example.com">ext</a></body></html>`,
		final: "https://example.com/",
	}
	f := newBrowserFetcher(eng, "test-agent", 5*time.Second)

	page := &crawler.Page{URL: "https://example.com/"}
	if err := f.Fetch(context.Background(), page, "https://example.com/"); err != nil {
		t.Fatalf("fetch: %v", err)
	}

	if page.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", page.StatusCode)
	}
	if len(page.Body) == 0 {
		t.Errorf("expected rendered body to be populated")
	}
	if len(page.Links) == 0 {
		t.Errorf("expected links extracted from rendered HTML")
	}
	if page.Doc == nil {
		t.Errorf("expected parsed HTML doc")
	}
}

func TestBrowserFetcher_PropagatesError(t *testing.T) {
	eng := &fakeBrowser{err: context.DeadlineExceeded}
	f := newBrowserFetcher(eng, "test-agent", time.Second)
	page := &crawler.Page{URL: "https://example.com/"}
	if err := f.Fetch(context.Background(), page, "https://example.com/"); err == nil {
		t.Errorf("expected error to propagate from browser engine")
	}
}

// compile-time assertion that browserFetcher satisfies the crawler seam.
var _ crawler.Fetcher = (*browserFetcher)(nil)
