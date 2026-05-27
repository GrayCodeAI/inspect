package crawler

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
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
		AllowPrivateIPs: true,
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
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test-bot",
		AllowPrivateIPs: true,
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

	c := New(Config{MaxDepth: 3, Concurrency: 1, Timeout: 10 * time.Second, PageTimeout: 5 * time.Second, RateLimit: 100, UserAgent: "test", AllowPrivateIPs: true})
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

	c := New(Config{MaxDepth: 3, Concurrency: 2, Timeout: 10 * time.Second, PageTimeout: 5 * time.Second, RateLimit: 100, UserAgent: "test", AllowPrivateIPs: true})
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		RetryAttempts:   3,
		RetryDelay:      10 * time.Millisecond,
		UserAgent:       "test",
		RespectRobots:   true,
		AllowPrivateIPs: true,
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
		{"https://example.com/page", "https://example.com/page"},
		{"https://example.com/#top", "https://example.com/"},
		{"https://example.com/page?key=value#frag", "https://example.com/page?key=value"},
		{"https://example.com/", "https://example.com/"},
	}
	for _, tt := range tests {
		got := normalizeURL(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeURL(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// --- resolveURL tests ---

func TestResolveURL_Absolute(t *testing.T) {
	tests := []struct {
		base, href, expected string
	}{
		{"https://example.com/page", "https://other.com/path", "https://other.com/path"},
		{"https://example.com/dir/page", "/newpath", "https://example.com/newpath"},
		{"https://example.com/dir/page", "relative", "https://example.com/dir/relative"},
		{"https://example.com/dir/page", "../sibling", "https://example.com/sibling"},
		{"https://example.com/dir/page", "./sibling", "https://example.com/dir/sibling"},
		// Fragment-only links return empty
		{"https://example.com/page", "#section", ""},
		// mailto: returns empty
		{"https://example.com/page", "mailto:user@example.com", ""},
		// javascript: returns empty
		{"https://example.com/page", "javascript:alert(1)", ""},
		// Empty href returns empty
		{"https://example.com/page", "", ""},
		// data: URI resolves (resolveURL doesn't filter these, only link extraction does)
		{"https://example.com/page", "data:text/html,<h1>hi</h1>", "data:text/html,<h1>hi</h1>"},
		// Protocol-relative
		{"https://example.com/page", "//cdn.example.com/lib.js", "https://cdn.example.com/lib.js"},
	}
	for _, tt := range tests {
		got := resolveURL(tt.base, tt.href)
		if got != tt.expected {
			t.Errorf("resolveURL(%q, %q) = %q, want %q", tt.base, tt.href, got, tt.expected)
		}
	}
}

func TestResolveURL_InvalidBase(t *testing.T) {
	// url.Parse succeeds for most strings in Go, but let's test edge cases
	got := resolveURL("://bad", "/path")
	// url.Parse("://bad") produces a relative reference, resolveReference still works
	_ = got
}

func TestResolveURL_QueryPreservation(t *testing.T) {
	got := resolveURL("https://example.com/page?k=v", "#anchor")
	if got != "" {
		t.Errorf("expected empty for fragment-only, got %q", got)
	}
}

// --- Rate limiter tests ---

func TestRateLimiter_ThrottlesHighRate(t *testing.T) {
	rl := newRateLimiter(10) // 10 req/sec = 100ms interval
	start := time.Now()
	for i := 0; i < 5; i++ {
		rl.Wait(context.Background())
	}
	elapsed := time.Since(start)
	// 5 requests at 10/sec should take ~400ms (4 intervals between 5 requests)
	if elapsed < 300*time.Millisecond {
		t.Errorf("rate limiter did not throttle enough: %v for 5 requests at 10/sec", elapsed)
	}
}

func TestRateLimiter_ContextCancellation(t *testing.T) {
	rl := newRateLimiter(1) // 1 req/sec = very slow
	rl.Wait(context.Background()) // first request goes through immediately

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		rl.Wait(ctx) // should block ~1s
		close(done)
	}()

	// Cancel after a short delay
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Good: Wait returned after context cancellation
	case <-time.After(500 * time.Millisecond):
		t.Error("rate limiter Wait did not return after context cancellation")
	}
}

func TestRateLimiter_DefaultRate(t *testing.T) {
	// Rate <= 0 should default to 10
	rl := newRateLimiter(0)
	if rl.interval != 100*time.Millisecond {
		t.Errorf("expected 100ms interval for default rate, got %v", rl.interval)
	}

	rl2 := newRateLimiter(-5)
	if rl2.interval != 100*time.Millisecond {
		t.Errorf("expected 100ms interval for negative rate, got %v", rl2.interval)
	}
}

// --- robots.txt tests ---

func TestRobotsCache_Allowed_NoRules(t *testing.T) {
	rc := NewRobotsCache()
	if !rc.Allowed("https://example.com/page", "test") {
		t.Error("should allow when no rules fetched")
	}
}

func TestRobotsCache_Allowed_Disallow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: *
Disallow: /private/
Disallow: /admin
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	if rc.Allowed(srv.URL+"/private/page", "test") {
		t.Error("should disallow /private/page")
	}
	if rc.Allowed(srv.URL+"/admin/settings", "test") {
		t.Error("should disallow /admin/*")
	}
	if !rc.Allowed(srv.URL+"/public/page", "test") {
		t.Error("should allow /public/page")
	}
}

func TestRobotsCache_Allowed_AllowOverridesDisallow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: *
Disallow: /private/
Allow: /private/public
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// /private/public matches Allow (length 15) and Disallow (length 9), Allow wins
	if !rc.Allowed(srv.URL+"/private/public", "test") {
		t.Error("should allow /private/public (longer Allow wins)")
	}
	if rc.Allowed(srv.URL+"/private/secret", "test") {
		t.Error("should disallow /private/secret")
	}
}

func TestRobotsCache_CrawlDelay(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: *
Crawl-delay: 2
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	delay := rc.CrawlDelay(srv.URL)
	if delay != 2*time.Second {
		t.Errorf("expected crawl delay 2s, got %v", delay)
	}

	// Non-fetched origin should return 0
	if rc.CrawlDelay("https://other.com") != 0 {
		t.Error("expected 0 for non-fetched origin")
	}
}

func TestRobotsCache_Sitemaps(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: *
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	sitemaps := rc.Sitemaps(srv.URL)
	if len(sitemaps) != 2 {
		t.Fatalf("expected 2 sitemaps, got %d", len(sitemaps))
	}
	if sitemaps[0] != "https://example.com/sitemap.xml" || sitemaps[1] != "https://example.com/sitemap-news.xml" {
		t.Errorf("unexpected sitemaps: %v", sitemaps)
	}
}

func TestRobotsCache_Fetch_404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// No rules stored, so everything allowed
	if !rc.Allowed(srv.URL+"/anything", "test") {
		t.Error("should allow when robots.txt returns 404")
	}
}

func TestRobotsCache_Fetch_NonWildcardUserAgent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Googlebot
Disallow: /secret/

User-agent: *
Disallow: /blocked/
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// Only * rules apply
	if !rc.Allowed(srv.URL+"/secret/page", "test") {
		t.Error("should allow /secret/ (rules for Googlebot only, not *)")
	}
	if rc.Allowed(srv.URL+"/blocked/page", "test") {
		t.Error("should disallow /blocked/ (rules for *)")
	}
}

func TestRobotsCache_Fetch_Comments(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `# This is a comment
User-agent: *
# Another comment
Disallow: /nope/
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	if rc.Allowed(srv.URL+"/nope/page", "test") {
		t.Error("should disallow /nope/ despite comments")
	}
}

// --- Redirect tests ---

func TestCrawl_FollowsRedirects(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dest", http.StatusFound)
	})
	mux.HandleFunc("/dest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>destination</body></html>`)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		FollowRedirects: 3,
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	foundDest := false
	for _, p := range pages {
		if p.StatusCode == 200 && p.Error == nil {
			foundDest = true
		}
	}
	if !foundDest {
		t.Error("expected to reach redirect destination")
	}
}

func TestCrawl_RedirectLoop(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/loop", http.StatusFound)
	})
	mux.HandleFunc("/loop", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/", http.StatusFound)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		FollowRedirects: 5,
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	// The page should have an error from redirect loop detection
	if pages[0].Error == nil {
		t.Error("expected error for redirect loop")
	}
}

// --- Auth required tests ---

func TestCrawl_AuthRequired_401(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `<html><body>Unauthorized</body></html>`)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	if pages[0].StatusCode != 401 {
		t.Errorf("expected status 401, got %d", pages[0].StatusCode)
	}
	if !pages[0].AuthRequired {
		t.Error("expected AuthRequired=true for 401 response")
	}
	if pages[0].Error != nil {
		t.Errorf("expected no error for auth-required page, got %v", pages[0].Error)
	}
}

func TestCrawl_AuthRequired_403(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, `<html><body>Forbidden</body></html>`)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	if pages[0].StatusCode != 403 {
		t.Errorf("expected status 403, got %d", pages[0].StatusCode)
	}
	if !pages[0].AuthRequired {
		t.Error("expected AuthRequired=true for 403 response")
	}
}

// --- Non-HTML content type ---

func TestCrawl_NonHTMLContentType(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"key":"value"}`)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	// Body should be empty for non-HTML content
	if len(pages[0].Body) != 0 {
		t.Errorf("expected empty body for non-HTML, got %d bytes", len(pages[0].Body))
	}
	if len(pages[0].Links) != 0 {
		t.Errorf("expected no links for non-HTML, got %d", len(pages[0].Links))
	}
}

// --- Exclude patterns ---

func TestCrawl_ExcludePatterns(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>
			<a href="/public">public</a>
			<a href="/admin/secret">admin</a>
		</body></html>`)
	})
	mux.HandleFunc("/public", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>public</body></html>`)
	})
	mux.HandleFunc("/admin/secret", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>secret</body></html>`)
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
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		Exclude:         []string{"/admin"},
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	for _, p := range pages {
		if strings.Contains(p.URL, "/admin") {
			t.Errorf("should not have crawled excluded URL: %s", p.URL)
		}
	}
}

// --- SSRF protection tests ---

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		ip       string
		expected bool
	}{
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.1.1", true},
		{"127.0.0.1", true},
		{"::1", true},
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"93.184.216.34", false}, // example.com
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		if ip == nil {
			t.Fatalf("failed to parse IP: %s", tt.ip)
		}
		got := isPrivateIP(ip)
		if got != tt.expected {
			t.Errorf("isPrivateIP(%s) = %v, want %v", tt.ip, got, tt.expected)
		}
	}
}

func TestValidateURL_SSRFProtection(t *testing.T) {
	c := New(Config{
		AllowPrivateIPs: false,
		UserAgent:       "test",
	})

	// Non-http/https scheme should be rejected
	err := c.validateURL("ftp://example.com/file")
	if err == nil {
		t.Error("expected error for ftp scheme")
	}

	err = c.validateURL("file:///etc/passwd")
	if err == nil {
		t.Error("expected error for file scheme")
	}

	// AllowPrivateIPs=true should skip IP checks
	c2 := New(Config{
		AllowPrivateIPs: true,
		UserAgent:       "test",
	})
	if err := c2.validateURL("http://127.0.0.1/admin"); err != nil {
		t.Errorf("expected no error with AllowPrivateIPs=true, got %v", err)
	}
}

// --- isRetryable tests ---

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		status   int
		expected bool
	}{
		{200, false},
		{301, false},
		{400, false},
		{401, false},
		{403, false},
		{404, false},
		{429, true},
		{500, true},
		{502, true},
		{503, true},
		{504, true},
		{0, true},
	}
	for _, tt := range tests {
		got := isRetryable(tt.status)
		if got != tt.expected {
			t.Errorf("isRetryable(%d) = %v, want %v", tt.status, got, tt.expected)
		}
	}
}

// --- tryMarkSeen deduplication ---

func TestTryMarkSeen_Dedup(t *testing.T) {
	c := New(Config{UserAgent: "test"})

	if !c.tryMarkSeen("https://example.com/page") {
		t.Error("first call should return true")
	}
	if c.tryMarkSeen("https://example.com/page") {
		t.Error("second call should return false (duplicate)")
	}
	// Same URL with different fragment should still be deduplicated
	if c.tryMarkSeen("https://example.com/page#section") {
		t.Error("same URL with fragment should be deduplicated")
	}
}

// --- isExcluded tests ---

func TestIsExcluded(t *testing.T) {
	c := New(Config{
		Exclude: []string{"/admin", ".pdf", "logout"},
	})

	tests := []struct {
		url      string
		expected bool
	}{
		{"https://example.com/page", false},
		{"https://example.com/admin/users", true},
		{"https://example.com/doc.pdf", true},
		{"https://example.com/logout", true},
		{"https://example.com/public", false},
	}
	for _, tt := range tests {
		got := c.isExcluded(tt.url)
		if got != tt.expected {
			t.Errorf("isExcluded(%q) = %v, want %v", tt.url, got, tt.expected)
		}
	}
}

// --- Crawl with robots.txt compliance ---

func TestCrawl_RespectRobots(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>
			<a href="/allowed">ok</a>
			<a href="/blocked">blocked</a>
		</body></html>`)
	})
	mux.HandleFunc("/allowed", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>allowed</body></html>`)
	})
	mux.HandleFunc("/blocked", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>blocked</body></html>`)
	})
	mux.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, "User-agent: *\nDisallow: /blocked\n")
	})
	mux.HandleFunc("/sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		RespectRobots:   true,
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	for _, p := range pages {
		if strings.Contains(p.URL, "/blocked") {
			t.Errorf("should not have crawled robots-disallowed URL: %s", p.URL)
		}
	}
}

// --- Crawl with auth header ---

func TestCrawl_AuthHeader(t *testing.T) {
	var gotHeader string
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("Authorization")
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AuthHeader:      "Authorization",
		AuthValue:       "Bearer secret-token",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	if gotHeader != "Bearer secret-token" {
		t.Errorf("expected auth header 'Bearer secret-token', got %q", gotHeader)
	}
}

// --- Crawl with server error ---

func TestCrawl_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
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
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		RetryAttempts:   0, // no retries for speed
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}
	if pages[0].StatusCode != 500 {
		t.Errorf("expected status 500, got %d", pages[0].StatusCode)
	}
}

// --- Page struct field initialization ---

func TestPage_FieldsInitialized(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("X-Custom", "value")
		fmt.Fprint(w, `<html><body><a href="/child">link</a></body></html>`)
	})
	mux.HandleFunc("/child", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>child</body></html>`)
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
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// Find the root page
	var root *Page
	for _, p := range pages {
		if p.URL == srv.URL+"/" || p.URL == srv.URL {
			root = p
			break
		}
	}
	if root == nil {
		t.Fatal("could not find root page")
	}

	if root.StatusCode != 200 {
		t.Errorf("expected StatusCode 200, got %d", root.StatusCode)
	}
	if root.Depth != 0 {
		t.Errorf("expected Depth 0, got %d", root.Depth)
	}
	if root.ParentURL != "" {
		t.Errorf("expected empty ParentURL, got %q", root.ParentURL)
	}
	if root.Duration <= 0 {
		t.Error("expected positive Duration")
	}
	if root.Error != nil {
		t.Errorf("expected no error, got %v", root.Error)
	}
	if root.Body == nil {
		t.Error("expected non-nil Body")
	}
	if root.Headers == nil {
		t.Error("expected non-nil Headers")
	}
	if root.Headers.Get("X-Custom") != "value" {
		t.Error("expected X-Custom header")
	}
	if root.AuthRequired {
		t.Error("expected AuthRequired=false for 200 response")
	}
}

func TestPage_ChildHasParentURL(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/child">child</a></body></html>`)
	})
	mux.HandleFunc("/child", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>child</body></html>`)
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
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	var child *Page
	for _, p := range pages {
		if strings.HasSuffix(p.URL, "/child") {
			child = p
			break
		}
	}
	if child == nil {
		t.Fatal("could not find /child page")
	}

	if child.Depth != 1 {
		t.Errorf("expected child Depth 1, got %d", child.Depth)
	}
	if child.ParentURL == "" {
		t.Error("expected non-empty ParentURL for child page")
	}
}

// --- New creates sensible defaults ---

func TestNew_Defaults(t *testing.T) {
	c := New(Config{UserAgent: "test"})
	if c.cfg.PageTimeout != 15*time.Second {
		t.Errorf("expected default PageTimeout 15s, got %v", c.cfg.PageTimeout)
	}
	if c.cfg.RetryAttempts != 2 {
		t.Errorf("expected default RetryAttempts 2, got %d", c.cfg.RetryAttempts)
	}
	if c.cfg.RetryDelay != 500*time.Millisecond {
		t.Errorf("expected default RetryDelay 500ms, got %v", c.cfg.RetryDelay)
	}
	if c.client == nil {
		t.Error("expected non-nil client")
	}
	if c.seen == nil {
		t.Error("expected non-nil seen map")
	}
	if c.robots == nil {
		t.Error("expected non-nil robots cache")
	}
	if c.limiter == nil {
		t.Error("expected non-nil limiter")
	}
}

func TestNew_CustomValues(t *testing.T) {
	c := New(Config{
		PageTimeout:   30 * time.Second,
		RetryAttempts: 5,
		RetryDelay:    1 * time.Second,
		UserAgent:     "custom-bot",
	})
	if c.cfg.PageTimeout != 30*time.Second {
		t.Errorf("expected PageTimeout 30s, got %v", c.cfg.PageTimeout)
	}
	if c.cfg.RetryAttempts != 5 {
		t.Errorf("expected RetryAttempts 5, got %d", c.cfg.RetryAttempts)
	}
	if c.cfg.RetryDelay != 1*time.Second {
		t.Errorf("expected RetryDelay 1s, got %v", c.cfg.RetryDelay)
	}
}

// --- Invalid URL for Crawl ---

func TestCrawl_InvalidURL(t *testing.T) {
	c := New(Config{UserAgent: "test"})
	_, err := c.Crawl(context.Background(), "://bad")
	if err == nil {
		t.Error("expected error for invalid URL")
	}
}

func TestCrawl_NoHost(t *testing.T) {
	c := New(Config{UserAgent: "test"})
	_, err := c.Crawl(context.Background(), "http:///path")
	if err == nil {
		t.Error("expected error for URL with no host")
	}
}

// --- Crawl with zero MaxDepth (unlimited) ---

func TestCrawl_ZeroMaxDepthMeansUnlimited(t *testing.T) {
	// With MaxDepth=0, the crawler should follow links without depth limit
	// (until it runs out of links or hits other limits)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/p2">p2</a></body></html>`)
	})
	mux.HandleFunc("/p2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="/p3">p3</a></body></html>`)
	})
	mux.HandleFunc("/p3", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>leaf</body></html>`)
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
		MaxDepth:        0, // unlimited
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) < 3 {
		t.Errorf("expected at least 3 pages with unlimited depth, got %d", len(pages))
	}
}

// --- Crawl with link extraction from HTML ---

func TestCrawl_ExtractsMailtoAndJavaScriptLinks(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>
			<a href="mailto:user@example.com">email</a>
			<a href="javascript:alert(1)">js</a>
			<a href="#fragment">anchor</a>
			<a href="/real">real</a>
		</body></html>`)
	})
	mux.HandleFunc("/real", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>real page</body></html>`)
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
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// Should have extracted mailto and javascript links on the page
	var root *Page
	for _, p := range pages {
		if strings.HasSuffix(p.URL, "/") || p.URL == srv.URL || p.URL == srv.URL+"/" {
			root = p
			break
		}
	}
	if root == nil {
		t.Fatal("could not find root page")
	}

	// Should not have crawled mailto: or javascript: URLs
	for _, p := range pages {
		if strings.HasPrefix(p.URL, "mailto:") || strings.HasPrefix(p.URL, "javascript:") {
			t.Errorf("should not crawl mailto/javascript URL: %s", p.URL)
		}
	}

	// Root page links should include the mailto, javascript, and anchor links
	linkHrefs := map[string]bool{}
	for _, l := range root.Links {
		linkHrefs[l.Href] = true
	}
	if !linkHrefs["mailto:user@example.com"] {
		t.Error("expected mailto link in page links")
	}
	if !linkHrefs["javascript:alert(1)"] {
		t.Error("expected javascript link in page links")
	}
	if !linkHrefs["#fragment"] {
		t.Error("expected anchor link in page links")
	}
}
