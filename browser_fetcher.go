package inspect

import (
	"context"
	"net/http"
	"time"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// browserFetcher adapts a BrowserEngine into a crawler.Fetcher so the crawler
// can retrieve fully JavaScript-rendered pages instead of raw HTTP responses.
// SSRF validation, rate limiting, retries, and the circuit breaker are applied
// by the crawler before this fetcher runs.
type browserFetcher struct {
	engine    BrowserEngine
	userAgent string
	timeout   time.Duration
}

// newBrowserFetcher wraps a BrowserEngine for use as a crawler fetcher.
func newBrowserFetcher(engine BrowserEngine, userAgent string, timeout time.Duration) *browserFetcher {
	return &browserFetcher{engine: engine, userAgent: userAgent, timeout: timeout}
}

// Fetch renders targetURL with the browser engine and populates page with the
// rendered HTML, discovered links, and forms.
func (f *browserFetcher) Fetch(ctx context.Context, page *crawler.Page, targetURL string) error {
	data, err := f.engine.RenderPage(ctx, targetURL, BrowserOpts{
		Timeout:   f.timeout,
		UserAgent: f.userAgent,
	})
	if err != nil {
		return err
	}

	finalURL := data.FinalURL
	if finalURL == "" {
		finalURL = targetURL
	}
	body := []byte(data.RenderedHTML)

	page.StatusCode = http.StatusOK
	page.Headers = http.Header{"Content-Type": []string{"text/html; charset=utf-8"}}
	page.Body = body
	page.Duration = data.LoadTime

	// Reuse the crawler's HTML parser so links/forms are extracted identically
	// to the HTTP path.
	doc, links, forms, _ := crawler.ParseHTMLDoc(finalURL, body)
	page.Doc = doc
	page.Links = links
	page.Forms = forms
	return nil
}
