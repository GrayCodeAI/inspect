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

// --- ResolveURL tests ---

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
		// data: URI resolves (ResolveURL doesn't filter these, only link extraction does)
		{"https://example.com/page", "data:text/html,<h1>hi</h1>", "data:text/html,<h1>hi</h1>"},
		// Protocol-relative
		{"https://example.com/page", "//cdn.example.com/lib.js", "https://cdn.example.com/lib.js"},
	}
	for _, tt := range tests {
		got := ResolveURL(tt.base, tt.href)
		if got != tt.expected {
			t.Errorf("ResolveURL(%q, %q) = %q, want %q", tt.base, tt.href, got, tt.expected)
		}
	}
}

func TestResolveURL_InvalidBase(t *testing.T) {
	// url.Parse succeeds for most strings in Go, but let's test edge cases
	got := ResolveURL("://bad", "/path")
	// url.Parse("://bad") produces a relative reference, resolveReference still works
	_ = got
}

func TestResolveURL_QueryPreservation(t *testing.T) {
	got := ResolveURL("https://example.com/page?k=v", "#anchor")
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
	rl := newRateLimiter(1)       // 1 req/sec = very slow
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

	delay := rc.CrawlDelay(srv.URL, "test")
	if delay != 2*time.Second {
		t.Errorf("expected crawl delay 2s, got %v", delay)
	}

	// Non-fetched origin should return 0
	if rc.CrawlDelay("https://other.com", "test") != 0 {
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

func TestRobotsCache_BotSpecificSections(t *testing.T) {
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

	// Googlebot should follow its own rules
	if rc.Allowed(srv.URL+"/secret/page", "Googlebot") {
		t.Error("Googlebot should disallow /secret/")
	}
	if rc.Allowed(srv.URL+"/blocked/page", "Googlebot") {
		t.Error("Googlebot should also disallow /blocked/ (wildcard fallback)")
	}

	// Other bots should follow wildcard rules
	if !rc.Allowed(srv.URL+"/secret/page", "test") {
		t.Error("test bot should allow /secret/ (no bot-specific rule)")
	}
	if rc.Allowed(srv.URL+"/blocked/page", "test") {
		t.Error("test bot should disallow /blocked/ (wildcard)")
	}
}

func TestRobotsCache_CaseInsensitiveUserAgent(t *testing.T) {
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

	// Case-insensitive matching
	if rc.Allowed(srv.URL+"/secret/page", "googlebot") {
		t.Error("googlebot (lowercase) should match Googlebot rules")
	}
	if rc.Allowed(srv.URL+"/secret/page", "GOOGLEBOT") {
		t.Error("GOOGLEBOT (uppercase) should match Googlebot rules")
	}
	if rc.Allowed(srv.URL+"/secret/page", "GoogleBot") {
		t.Error("GoogleBot (mixed case) should match Googlebot rules")
	}
}

func TestRobotsCache_BotSpecificCrawlDelay(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Googlebot
Crawl-delay: 5

User-agent: *
Crawl-delay: 1
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// Bot-specific crawl delay
	if delay := rc.CrawlDelay(srv.URL, "Googlebot"); delay != 5*time.Second {
		t.Errorf("expected crawl delay 5s for Googlebot, got %v", delay)
	}

	// Wildcard crawl delay
	if delay := rc.CrawlDelay(srv.URL, "test"); delay != 1*time.Second {
		t.Errorf("expected crawl delay 1s for test, got %v", delay)
	}
}

func TestRobotsCache_CrawlDelay_CaseInsensitive(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Baiduspider
Crawl-delay: 3

User-agent: *
Crawl-delay: 1
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	if delay := rc.CrawlDelay(srv.URL, "baiduspider"); delay != 3*time.Second {
		t.Errorf("expected crawl delay 3s for baiduspider, got %v", delay)
	}
	if delay := rc.CrawlDelay(srv.URL, "BAIDUSPIDER"); delay != 3*time.Second {
		t.Errorf("expected crawl delay 3s for BAIDUSPIDER, got %v", delay)
	}
}

func TestRobotsCache_BotSpecificNoWildcard(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Googlebot
Disallow: /secret/
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// Googlebot should be blocked
	if rc.Allowed(srv.URL+"/secret/page", "Googlebot") {
		t.Error("Googlebot should disallow /secret/")
	}

	// Other bots should be allowed (no wildcard section)
	if !rc.Allowed(srv.URL+"/secret/page", "test") {
		t.Error("test bot should allow /secret/ (no wildcard or bot-specific rule)")
	}
}

func TestRobotsCache_BlankLineSeparators(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Googlebot
Disallow: /a/

User-agent: Bingbot
Disallow: /b/

User-agent: *
Disallow: /c/
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	if rc.Allowed(srv.URL+"/a/page", "Googlebot") {
		t.Error("Googlebot should disallow /a/")
	}
	if !rc.Allowed(srv.URL+"/a/page", "Bingbot") {
		t.Error("Bingbot should allow /a/")
	}

	if rc.Allowed(srv.URL+"/b/page", "Bingbot") {
		t.Error("Bingbot should disallow /b/")
	}
	if !rc.Allowed(srv.URL+"/b/page", "Googlebot") {
		t.Error("Googlebot should allow /b/")
	}

	if rc.Allowed(srv.URL+"/c/page", "test") {
		t.Error("test bot should disallow /c/ (wildcard)")
	}
}

func TestRobotsCache_MultipleUserAgentsPerSection(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `User-agent: Googlebot
User-agent: Bingbot
Disallow: /shared/

User-agent: *
Disallow: /blocked/
`)
	}))
	defer srv.Close()

	rc := NewRobotsCache()
	rc.Fetch(context.Background(), srv.Client(), srv.URL)

	// Both bots in the same section should share rules
	if rc.Allowed(srv.URL+"/shared/page", "Googlebot") {
		t.Error("Googlebot should disallow /shared/")
	}
	if rc.Allowed(srv.URL+"/shared/page", "Bingbot") {
		t.Error("Bingbot should disallow /shared/")
	}
	if !rc.Allowed(srv.URL+"/shared/page", "test") {
		t.Error("test bot should allow /shared/")
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

// Note: additional tests for the crawler package live in crawler_more_test.go
// (split out for file size/clarity).
