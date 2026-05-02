package check

import (
	"context"
	"net/http"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

func BenchmarkSecurityCheck(b *testing.B) {
	page := &crawler.Page{
		URL:        "https://example.com",
		StatusCode: 200,
		Headers:    make(http.Header),
		Body:       []byte(`<html><head><title>Test</title></head><body><script src="http://cdn.example.com/app.js"></script></body></html>`),
	}
	chk := &SecurityCheck{}
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		chk.Run(ctx, []*crawler.Page{page})
	}
}

func BenchmarkA11yCheck(b *testing.B) {
	body := `<html lang="en"><head><title>Bench</title></head><body><main>
		<img src="a.jpg"><img src="b.jpg" alt="b"><img src="c.jpg">
		<a href="/x"></a><a href="/y">Y</a>
		<h1>H1</h1><h3>H3</h3>
		<input name="email" type="email">
	</main></body></html>`
	page := &crawler.Page{
		URL:        "https://example.com",
		StatusCode: 200,
		Headers:    make(http.Header),
		Body:       []byte(body),
	}
	chk := &A11yCheck{}
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		chk.Run(ctx, []*crawler.Page{page})
	}
}

func BenchmarkSEOCheck(b *testing.B) {
	body := `<html><head><meta charset="UTF-8"><title>SEO Test Page With A Reasonably Long Title That Might Be Too Long</title><meta name="description" content="A description"></head><body><h1>Title</h1></body></html>`
	page := &crawler.Page{
		URL:        "https://example.com",
		StatusCode: 200,
		Headers:    make(http.Header),
		Body:       []byte(body),
	}
	chk := &SEOCheck{}
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		chk.Run(ctx, []*crawler.Page{page})
	}
}
