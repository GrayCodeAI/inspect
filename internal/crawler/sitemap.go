package crawler

import (
	"context"
	"encoding/xml"
	"io"
	"net/http"
	"strings"
)

// SitemapURL represents a single URL entry in a sitemap.
type SitemapURL struct {
	Loc        string `xml:"loc"`
	Lastmod    string `xml:"lastmod,omitempty"`
	Changefreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

type sitemapIndex struct {
	Sitemaps []struct {
		Loc string `xml:"loc"`
	} `xml:"sitemap"`
}

type urlset struct {
	URLs []SitemapURL `xml:"url"`
}

// FetchSitemapURLs fetches and parses sitemap(s) from the given URLs.
// Supports both sitemap index files and direct URL sets.
func FetchSitemapURLs(ctx context.Context, client *http.Client, sitemapURLs []string) []string {
	var allURLs []string
	seen := make(map[string]bool)

	for _, sitemapURL := range sitemapURLs {
		urls := fetchSingleSitemap(ctx, client, sitemapURL, seen)
		allURLs = append(allURLs, urls...)
	}

	return allURLs
}

func fetchSingleSitemap(ctx context.Context, client *http.Client, sitemapURL string, seen map[string]bool) []string {
	if seen[sitemapURL] {
		return nil
	}
	seen[sitemapURL] = true

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sitemapURL, nil)
	if err != nil {
		return nil
	}

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return nil
	}

	// Try as sitemap index first
	var idx sitemapIndex
	if err := xml.Unmarshal(body, &idx); err == nil && len(idx.Sitemaps) > 0 {
		var urls []string
		for _, s := range idx.Sitemaps {
			urls = append(urls, fetchSingleSitemap(ctx, client, s.Loc, seen)...)
		}
		return urls
	}

	// Try as URL set
	var us urlset
	if err := xml.Unmarshal(body, &us); err == nil {
		urls := make([]string, 0, len(us.URLs))
		for _, u := range us.URLs {
			loc := strings.TrimSpace(u.Loc)
			if loc != "" {
				urls = append(urls, loc)
			}
		}
		return urls
	}

	return nil
}
