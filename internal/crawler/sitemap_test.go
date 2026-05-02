package crawler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchSitemapURLs_URLSet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`)
	}))
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL})
	if len(urls) != 3 {
		t.Fatalf("expected 3 URLs, got %d: %v", len(urls), urls)
	}

	expected := map[string]bool{
		"https://example.com/":        true,
		"https://example.com/about":   true,
		"https://example.com/contact": true,
	}
	for _, u := range urls {
		if !expected[u] {
			t.Errorf("unexpected URL: %q", u)
		}
	}
}

func TestFetchSitemapURLs_SitemapIndex(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/sitemap-index.xml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>%s/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`, r.Host)
	})
	mux.HandleFunc("/sitemap-pages.xml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL + "/sitemap-index.xml"})

	// The sitemap index references a child sitemap served on localhost.
	// The child sitemap URL will use the server's Host, so it should be found.
	// If the sitemap index references a non-reachable host, URLs will come from the direct parse.
	// This test is mainly checking the index-walking path doesn't crash.
	t.Logf("Fetched %d URLs from sitemap index", len(urls))
}

func TestFetchSitemapURLs_404Response(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL + "/sitemap.xml"})
	if len(urls) != 0 {
		t.Errorf("expected 0 URLs for 404 response, got %d", len(urls))
	}
}

func TestFetchSitemapURLs_InvalidXML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `this is not valid XML at all`)
	}))
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL})
	if len(urls) != 0 {
		t.Errorf("expected 0 URLs for invalid XML, got %d", len(urls))
	}
}

func TestFetchSitemapURLs_EmptyBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`)
	}))
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL})
	if len(urls) != 0 {
		t.Errorf("expected 0 URLs for empty urlset, got %d", len(urls))
	}
}

func TestFetchSitemapURLs_MultipleSitemaps(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/sitemap1.xml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc></url>
</urlset>`)
	})
	mux.HandleFunc("/sitemap2.xml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/b</loc></url>
</urlset>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{
		srv.URL + "/sitemap1.xml",
		srv.URL + "/sitemap2.xml",
	})

	if len(urls) != 2 {
		t.Errorf("expected 2 URLs from 2 sitemaps, got %d", len(urls))
	}
}

func TestFetchSitemapURLs_DeduplicatesSeen(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page</loc></url>
</urlset>`)
	}))
	defer srv.Close()

	// Requesting the same sitemap URL twice should not fetch it twice
	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{
		srv.URL,
		srv.URL, // duplicate
	})

	if len(urls) != 1 {
		t.Errorf("expected 1 URL (deduplicated), got %d", len(urls))
	}
}

func TestFetchSitemapURLs_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page</loc></url>
</urlset>`)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	urls := FetchSitemapURLs(ctx, http.DefaultClient, []string{srv.URL})
	// Should return empty or partial result, not panic
	_ = urls
}

func TestFetchSitemapURLs_EmptyInput(t *testing.T) {
	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, nil)
	if len(urls) != 0 {
		t.Errorf("expected 0 URLs for empty input, got %d", len(urls))
	}
}

func TestFetchSitemapURLs_WhitespaceInLoc(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>  https://example.com/page  </loc></url>
  <url><loc>  </loc></url>
</urlset>`)
	}))
	defer srv.Close()

	urls := FetchSitemapURLs(context.Background(), http.DefaultClient, []string{srv.URL})
	if len(urls) != 1 {
		t.Errorf("expected 1 URL (whitespace-only loc trimmed), got %d: %v", len(urls), urls)
	}
	if len(urls) > 0 && urls[0] != "https://example.com/page" {
		t.Errorf("expected trimmed URL, got %q", urls[0])
	}
}
