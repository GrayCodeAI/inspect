package inspect

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

func TestBrowserOpts_Defaults(t *testing.T) {
	opts := BrowserOpts{}
	if opts.Viewport.Width != 0 {
		t.Error("expected zero default width")
	}
	if opts.InjectAxe {
		t.Error("expected InjectAxe false by default")
	}
	if opts.Screenshot {
		t.Error("expected Screenshot false by default")
	}
}

func TestBrowserOpts_ConfigureAll(t *testing.T) {
	opts := BrowserOpts{
		Viewport: Viewport{
			Width:  1920,
			Height: 1080,
			Mobile: false,
		},
		WaitFor:    "#content",
		Timeout:    15 * time.Second,
		InjectAxe:  true,
		Screenshot: true,
		UserAgent:  "test-bot/1.0",
	}

	if opts.Viewport.Width != 1920 || opts.Viewport.Height != 1080 {
		t.Error("unexpected viewport dimensions")
	}
	if opts.WaitFor != "#content" {
		t.Errorf("expected WaitFor '#content', got %q", opts.WaitFor)
	}
	if opts.Timeout != 15*time.Second {
		t.Errorf("expected 15s timeout, got %v", opts.Timeout)
	}
	if !opts.InjectAxe {
		t.Error("expected InjectAxe true")
	}
	if !opts.Screenshot {
		t.Error("expected Screenshot true")
	}
	if opts.UserAgent != "test-bot/1.0" {
		t.Errorf("expected UserAgent 'test-bot/1.0', got %q", opts.UserAgent)
	}
}

func TestViewport_Mobile(t *testing.T) {
	v := Viewport{Width: 375, Height: 812, Mobile: true}
	if !v.Mobile {
		t.Error("expected Mobile true")
	}
	if v.Width != 375 || v.Height != 812 {
		t.Error("unexpected mobile viewport dimensions")
	}
}

func TestPageData_Fields(t *testing.T) {
	data := &PageData{
		FinalURL:     "https://example.com/page",
		Title:        "Test Page",
		RenderedHTML: "<html><body>rendered</body></html>",
		AccessTree: []AXNode{
			{Role: "heading", Name: "Main Title", Properties: map[string]string{"level": "1"}},
			{Role: "link", Name: "About", Properties: map[string]string{}},
		},
		AxeViolations: []AxeViolation{
			{
				ID:          "color-contrast",
				Impact:      "serious",
				Description: "Elements must have sufficient color contrast",
				Help:        "Ensure contrast ratio meets WCAG AA",
				HelpURL:     "https://dequeuniversity.com/rules/axe/4.7/color-contrast",
				Nodes: []AxeNode{
					{
						HTML:           "<span style='color:#aaa'>low contrast</span>",
						Target:         []string{".low-contrast"},
						FailureSummary: "Element has insufficient color contrast",
					},
				},
			},
		},
		ConsoleErrors: []string{"TypeError: undefined is not a function"},
		NetworkLog: []NetworkEntry{
			{URL: "https://example.com/app.js", Method: "GET", Status: 200, MimeType: "application/javascript", Size: 1024, Duration: 50 * time.Millisecond},
			{URL: "https://example.com/missing.css", Method: "GET", Status: 404, Failed: true, FailReason: "Not Found"},
		},
		Screenshot: []byte{0x89, 0x50, 0x4E, 0x47}, // PNG magic bytes
		LoadTime:   1500 * time.Millisecond,
	}

	if data.FinalURL != "https://example.com/page" {
		t.Errorf("unexpected FinalURL: %s", data.FinalURL)
	}
	if data.Title != "Test Page" {
		t.Errorf("unexpected Title: %s", data.Title)
	}
	if len(data.AccessTree) != 2 {
		t.Errorf("expected 2 access tree nodes, got %d", len(data.AccessTree))
	}
	if data.AccessTree[0].Role != "heading" {
		t.Errorf("expected heading role, got %q", data.AccessTree[0].Role)
	}
	if len(data.AxeViolations) != 1 {
		t.Errorf("expected 1 axe violation, got %d", len(data.AxeViolations))
	}
	if data.AxeViolations[0].ID != "color-contrast" {
		t.Errorf("expected color-contrast violation, got %q", data.AxeViolations[0].ID)
	}
	if len(data.ConsoleErrors) != 1 {
		t.Errorf("expected 1 console error, got %d", len(data.ConsoleErrors))
	}
	if len(data.NetworkLog) != 2 {
		t.Errorf("expected 2 network entries, got %d", len(data.NetworkLog))
	}
	if !data.NetworkLog[1].Failed {
		t.Error("expected second network entry to be failed")
	}
	if data.LoadTime != 1500*time.Millisecond {
		t.Errorf("unexpected load time: %v", data.LoadTime)
	}
}

func TestAXNode_Nested(t *testing.T) {
	node := AXNode{
		Role: "navigation",
		Name: "Main Navigation",
		Children: []AXNode{
			{Role: "link", Name: "Home"},
			{Role: "link", Name: "About"},
			{
				Role: "menu",
				Name: "More",
				Children: []AXNode{
					{Role: "menuitem", Name: "Settings"},
				},
			},
		},
	}

	if len(node.Children) != 3 {
		t.Fatalf("expected 3 children, got %d", len(node.Children))
	}
	if node.Children[2].Children[0].Role != "menuitem" {
		t.Errorf("expected nested menuitem, got %q", node.Children[2].Children[0].Role)
	}
}

func TestAxeViolation_MultipleNodes(t *testing.T) {
	v := AxeViolation{
		ID:     "image-alt",
		Impact: "critical",
		Nodes: []AxeNode{
			{HTML: "<img src='a.jpg'>", Target: []string{"#img1"}, FailureSummary: "Missing alt"},
			{HTML: "<img src='b.jpg'>", Target: []string{"#img2"}, FailureSummary: "Missing alt"},
			{HTML: "<img src='c.jpg'>", Target: []string{"#img3"}, FailureSummary: "Missing alt"},
		},
	}

	if len(v.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(v.Nodes))
	}
}

func TestNetworkEntry_FailedWithReason(t *testing.T) {
	entry := NetworkEntry{
		URL:        "https://example.com/resource",
		Method:     "GET",
		Status:     0,
		Failed:     true,
		FailReason: "net::ERR_CONNECTION_REFUSED",
		Duration:   5 * time.Second,
	}

	if !entry.Failed {
		t.Error("expected Failed true")
	}
	if entry.FailReason != "net::ERR_CONNECTION_REFUSED" {
		t.Errorf("unexpected fail reason: %s", entry.FailReason)
	}
	if entry.Status != 0 {
		t.Errorf("expected status 0 for failed request, got %d", entry.Status)
	}
}

// TestBrowserCrawler_LinkDiscovery tests link extraction from HTML that a
// browser crawler would render, using the real crawler infrastructure.
func TestBrowserCrawler_LinkDiscovery(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Home</title></head>
<body>
	<nav>
		<a href="/about">About</a>
		<a href="/products">Products</a>
		<a href="/contact">Contact</a>
		<a href="https://external.example.com">External</a>
	</nav>
	<main>
		<h1>Welcome</h1>
		<img src="/hero.jpg" alt="Hero image">
		<script src="/app.js"></script>
	</main>
</body>
</html>`)
	})

	mux.HandleFunc("/about", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>About</title></head>
<body>
	<h1>About Us</h1>
	<a href="/">Home</a>
	<a href="/team">Our Team</a>
</body>
</html>`)
	})

	mux.HandleFunc("/products", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Products</title></head>
<body>
	<h1>Products</h1>
	<a href="/">Home</a>
	<a href="/products/widget">Widget</a>
</body>
</html>`)
	})

	mux.HandleFunc("/contact", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Contact</title></head>
<body>
	<h1>Contact</h1>
	<form action="/submit" method="POST">
		<input name="email" type="email" required>
		<input name="_csrf" type="hidden" value="token123">
		<button type="submit">Send</button>
	</form>
</body>
</html>`)
	})

	mux.HandleFunc("/team", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Team</title></head>
<body><h1>Our Team</h1></body>
</html>`)
	})

	mux.HandleFunc("/products/widget", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Widget</title></head>
<body><h1>Widget</h1><a href="/products">Back to Products</a></body>
</html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        2,
		Concurrency:     2,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) < 3 {
		t.Errorf("expected at least 3 pages, got %d", len(pages))
	}

	// Verify link extraction worked on crawled pages
	totalLinks := 0
	for _, p := range pages {
		totalLinks += len(p.Links)
	}
	if totalLinks < 5 {
		t.Errorf("expected at least 5 total links across all pages, got %d", totalLinks)
	}
}

// TestBrowserCrawler_FormDetection tests that forms are detected from
// HTML responses during crawling.
func TestBrowserCrawler_FormDetection(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head><title>Login</title></head>
<body>
	<form action="/login" method="POST" id="login-form">
		<input name="username" type="text" required>
		<input name="password" type="password" required>
		<input name="_csrf" type="hidden" value="abc123">
		<button type="submit">Login</button>
	</form>
	<form action="/search" method="GET">
		<input name="q" type="text">
		<button type="submit">Search</button>
	</form>
</body>
</html>`)
	})

	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>Logged in</body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) == 0 {
		t.Fatal("expected at least 1 page")
	}

	// Find the home page and check forms
	homePage := pages[0]
	if len(homePage.Forms) != 2 {
		t.Fatalf("expected 2 forms on home page, got %d", len(homePage.Forms))
	}

	// Check CSRF detection
	foundCSRF := false
	for _, f := range homePage.Forms {
		if f.HasCSRF {
			foundCSRF = true
		}
	}
	if !foundCSRF {
		t.Error("expected at least one form with CSRF token")
	}

	// Check form methods
	methods := map[string]bool{}
	for _, f := range homePage.Forms {
		methods[f.Method] = true
	}
	if !methods["POST"] || !methods["GET"] {
		t.Error("expected both POST and GET forms")
	}
}

// TestBrowserCrawler_RedirectHandling tests that the crawler properly
// follows redirects and records final status codes.
func TestBrowserCrawler_RedirectHandling(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Home</title></head>
		<body><a href="/old-page">Old Page</a></body></html>`)
	})

	mux.HandleFunc("/old-page", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/new-page", http.StatusMovedPermanently)
	})

	mux.HandleFunc("/new-page", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>New Page</title></head>
		<body><h1>Moved here</h1></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		FollowRedirects: 5,
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// Should have encountered the redirect page
	foundOldPage := false
	for _, p := range pages {
		if p.URL == srv.URL+"/old-page" {
			foundOldPage = true
			// The crawler follows redirects, so we should see the final URL
			// or the redirect status code
		}
		if p.URL == srv.URL+"/new-page" {
			foundOldPage = true
		}
	}
	if !foundOldPage {
		// At minimum, the crawler should have discovered the old-page link
		t.Error("expected to encounter /old-page or /new-page in crawl results")
	}
}

// TestBrowserCrawler_NonHTMLIgnored tests that non-HTML resources are
// recorded but not followed for links.
func TestBrowserCrawler_NonHTMLIgnored(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Home</title></head>
		<body><a href="/image.png">Image</a></body></html>`)
	})

	mux.HandleFunc("/image.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte{0x89, 0x50, 0x4E, 0x47})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// Find the image page
	for _, p := range pages {
		if p.URL == srv.URL+"/image.png" {
			if len(p.Links) != 0 {
				t.Error("non-HTML page should have no extracted links")
			}
			if p.StatusCode != 200 {
				t.Errorf("expected 200 for image, got %d", p.StatusCode)
			}
		}
	}
}

// TestBrowserCrawler_ExcludePatterns tests URL exclusion during crawling.
func TestBrowserCrawler_ExcludePatterns(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Home</title></head>
		<body>
			<a href="/admin">Admin</a>
			<a href="/public">Public</a>
		</body></html>`)
	})

	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Admin</title></head>
		<body><h1>Admin Panel</h1></body></html>`)
	})

	mux.HandleFunc("/public", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Public</title></head>
		<body><h1>Public Page</h1></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		Exclude:         []string{"/admin"},
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	for _, p := range pages {
		if p.URL == srv.URL+"/admin" {
			t.Error("should not have crawled excluded /admin page")
		}
	}
}

// TestBrowserCrawler_EmptyPage tests crawling a page with no links or forms.
func TestBrowserCrawler_EmptyPage(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Empty</title></head>
		<body><h1>Nothing here</h1></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) != 1 {
		t.Fatalf("expected exactly 1 page, got %d", len(pages))
	}

	if len(pages[0].Links) != 0 {
		t.Errorf("expected 0 links on empty page, got %d", len(pages[0].Links))
	}
	if len(pages[0].Forms) != 0 {
		t.Errorf("expected 0 forms on empty page, got %d", len(pages[0].Forms))
	}
}

// TestBrowserCrawler_MixedContent tests pages with various HTML elements
// including images, iframes, and scripts.
func TestBrowserCrawler_MixedContent(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html lang="en">
<head>
	<title>Mixed Content</title>
	<link rel="stylesheet" href="/style.css">
	<script src="/app.js"></script>
</head>
<body>
	<h1>Page with Mixed Content</h1>
	<a href="/page2">Link</a>
	<img src="/photo.jpg" alt="Photo">
	<iframe src="/embed"></iframe>
	<video>
		<track src="/subs.vtt" kind="subtitles">
	</video>
</body>
</html>`)
	})

	mux.HandleFunc("/page2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><head><title>Page 2</title></head><body>Page 2</body></html>`)
	})

	mux.HandleFunc("/embed", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body>Embedded content</body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := crawler.New(crawler.Config{
		MaxDepth:        2,
		Concurrency:     1,
		Timeout:         10 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       100,
		UserAgent:       "inspect-test",
		AllowPrivateIPs: true,
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	if len(pages) < 2 {
		t.Errorf("expected at least 2 pages, got %d", len(pages))
	}

	// Home page should have many links (a, img, iframe, track, script)
	homePage := pages[0]
	hasImg := false
	hasScript := false
	for _, l := range homePage.Links {
		if l.Tag == "img" {
			hasImg = true
		}
		if l.Tag == "script" {
			hasScript = true
		}
	}
	if !hasImg {
		t.Error("expected img link on home page")
	}
	if !hasScript {
		t.Error("expected script link on home page")
	}
}
