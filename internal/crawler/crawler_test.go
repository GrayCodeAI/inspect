package crawler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCrawl_Basic(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/page2">link</a></body></html>`)
	})
	mux.HandleFunc("/page2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><h1>Page 2</h1></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{
		MaxDepth:        3,
		Concurrency:     2,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test-bot",
		FollowRedirects: 3,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}
	if len(pages) < 2 {
		t.Errorf("expected at least 2 pages, got %d", len(pages))
	}
}

func TestCrawl_DepthLimit(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/a">A</a></body></html>`)
	})
	mux.HandleFunc("/a", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/b">B</a></body></html>`)
	})
	mux.HandleFunc("/b", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/c">C</a></body></html>`)
	})
	mux.HandleFunc("/c", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><h1>Deep</h1></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{
		MaxDepth:    2,
		Concurrency: 1,
		Timeout:     10 * time.Second,
		PageTimeout: 5 * time.Second,
		RateLimit:   100,
		UserAgent:   "test-bot",
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}
	// Should get: /, /a, /b — but NOT /c (depth=3)
	for _, p := range pages {
		if p.URL == srv.URL+"/c" {
			t.Error("should not have crawled /c (beyond max depth)")
		}
	}
}

func TestCrawl_ExternalLinksNotFollowed(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="https://external.example.com">ext</a><a href="/local">local</a></body></html>`)
	})
	mux.HandleFunc("/local", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>local</body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{MaxDepth: 3, Concurrency: 1, Timeout: 10 * time.Second, PageTimeout: 5 * time.Second, RateLimit: 100, UserAgent: "test"})
	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	for _, p := range pages {
		if p.URL == "https://external.example.com" {
			t.Error("should not have crawled external link")
		}
	}
}

func TestCrawl_EmptyURL(t *testing.T) {
	c := New(Config{Concurrency: 1, Timeout: 5 * time.Second, PageTimeout: 5 * time.Second, RateLimit: 10, UserAgent: "test"})
	_, err := c.Crawl(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty URL")
	}
}

func TestCrawl_ContextCancellation(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/slow">slow</a></body></html>`)
	})
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>slow</body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	c := New(Config{MaxDepth: 3, Concurrency: 2, Timeout: 10 * time.Second, PageTimeout: 5 * time.Second, RateLimit: 100, UserAgent: "test"})
	_, err := c.Crawl(ctx, srv.URL)
	// Should not hang — should return within timeout
	if err != nil {
		t.Logf("Got expected error: %v", err)
	}
}

func TestCrawl_Retry(t *testing.T) {
	attempts := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts <= 2 {
			w.WriteHeader(503)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>ok</body></html>`)
	})
	mux.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})
	mux.HandleFunc("/sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{
		MaxDepth:      1,
		Concurrency:   1,
		Timeout:       10 * time.Second,
		PageTimeout:   5 * time.Second,
		RateLimit:     100,
		RetryAttempts: 3,
		RetryDelay:    10 * time.Millisecond,
		UserAgent:     "test",
		RespectRobots: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}
	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	if pages[0].StatusCode != 200 {
		t.Errorf("expected 200 after retry, got %d (attempts: %d)", pages[0].StatusCode, attempts)
	}
}

func TestRateLimiter(t *testing.T) {
	rl := newRateLimiter(100) // 100 req/sec
	start := time.Now()
	for i := 0; i < 5; i++ {
		rl.Wait(context.Background())
	}
	elapsed := time.Since(start)
	if elapsed > 200*time.Millisecond {
		t.Errorf("rate limiter too slow for 100 req/sec: %v", elapsed)
	}
}

func TestNormalizeURL(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"https://example.com/page#section", "https://example.com/page"},
		{"https://example.com/page?b=2&a=1", "https://example.com/page?a=1&b=2"},
	}
	for _, tt := range tests {
		got := normalizeURL(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeURL(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
