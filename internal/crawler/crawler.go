// Package crawler implements a concurrent website crawler with rate limiting,
// depth control, URL deduplication, and robots.txt compliance.
package crawler

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Config controls crawler behavior.
type Config struct {
	MaxDepth        int
	Concurrency     int
	Timeout         time.Duration
	PageTimeout     time.Duration
	RateLimit       int
	RetryAttempts   int
	RetryDelay      time.Duration
	UserAgent       string
	FollowRedirects int
	RespectRobots   bool
	Exclude         []string
	AuthHeader      string
	AuthValue       string
	CookieJar       http.CookieJar
}

// Page represents a single crawled page with its metadata.
type Page struct {
	URL        string
	StatusCode int
	Headers    http.Header
	Body       []byte
	Links      []Link
	Forms      []Form
	Depth      int
	ParentURL  string
	Duration   time.Duration
	Error      error
}

// Link represents a hyperlink found on a page.
type Link struct {
	Href     string
	Text     string
	Rel      string
	External bool
	Anchor   bool
}

// Form represents an HTML form found on a page.
type Form struct {
	Action  string
	Method  string
	ID      string
	Inputs  []FormInput
	HasCSRF bool
}

// FormInput represents a form field.
type FormInput struct {
	Name     string
	Type     string
	Required bool
	Value    string
}

// Crawler performs concurrent crawling with rate limiting.
type Crawler struct {
	cfg    Config
	client *http.Client
	seen   map[string]bool
	mu     sync.Mutex
	robots *RobotsCache
	limiter *rateLimiter
}

// New creates a configured Crawler.
func New(cfg Config) *Crawler {
	if cfg.PageTimeout == 0 {
		cfg.PageTimeout = 15 * time.Second
	}
	if cfg.RetryAttempts == 0 {
		cfg.RetryAttempts = 2
	}
	if cfg.RetryDelay == 0 {
		cfg.RetryDelay = 500 * time.Millisecond
	}

	transport := &http.Transport{
		MaxIdleConns:        cfg.Concurrency * 2,
		MaxIdleConnsPerHost: cfg.Concurrency,
		IdleConnTimeout:     90 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   cfg.Timeout,
		Jar:       cfg.CookieJar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= cfg.FollowRedirects {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	return &Crawler{
		cfg:     cfg,
		client:  client,
		seen:    make(map[string]bool),
		robots:  NewRobotsCache(),
		limiter: newRateLimiter(cfg.RateLimit),
	}
}

// Crawl starts from the given URL and discovers pages up to MaxDepth.
// Returns all crawled pages. Safe for concurrent use via internal locking.
func (c *Crawler) Crawl(ctx context.Context, startURL string) ([]*Page, error) {
	if startURL == "" {
		return nil, fmt.Errorf("empty URL")
	}
	parsed, err := url.Parse(startURL)
	if err != nil {
		return nil, err
	}
	if parsed.Host == "" {
		return nil, fmt.Errorf("invalid URL: no host in %q", startURL)
	}

	baseHost := parsed.Host

	origin := parsed.Scheme + "://" + parsed.Host

	if c.cfg.RespectRobots {
		c.robots.Fetch(ctx, c.client, origin)
	}

	// Seed with sitemap URLs if available
	sitemapURLs := c.robots.Sitemaps(origin)
	if len(sitemapURLs) == 0 {
		sitemapURLs = []string{origin + "/sitemap.xml"}
	}
	sitemapPages := FetchSitemapURLs(ctx, c.client, sitemapURLs)

	type work struct {
		url   string
		depth int
		parent string
	}

	var (
		pages   []*Page
		pagesMu sync.Mutex
		queue   = make(chan work, 10000)
		wg      sync.WaitGroup
	)

	c.markSeen(startURL)

	workers := c.cfg.Concurrency
	if workers < 1 {
		workers = 1
	}

	var active sync.WaitGroup
	active.Add(1)
	queue <- work{url: startURL, depth: 0, parent: ""}

	// Seed from sitemap
	for _, sitemapPage := range sitemapPages {
		if c.tryMarkSeen(sitemapPage) {
			active.Add(1)
			select {
			case queue <- work{url: sitemapPage, depth: 1, parent: "sitemap"}:
			default:
				active.Done()
			}
		}
	}

	// Close queue when all work is done
	go func() {
		active.Wait()
		close(queue)
	}()

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for w := range queue {
				if ctx.Err() != nil {
					active.Done()
					continue
				}

				page := c.fetch(ctx, w.url, w.depth, w.parent)
				pagesMu.Lock()
				pages = append(pages, page)
				pagesMu.Unlock()

				if page.Error == nil && (c.cfg.MaxDepth == 0 || w.depth < c.cfg.MaxDepth) {
					for _, link := range page.Links {
						if link.External || link.Anchor {
							continue
						}
						resolved := resolveURL(w.url, link.Href)
						if resolved == "" {
							continue
						}
						linkParsed, err := url.Parse(resolved)
						if err != nil || linkParsed.Host != baseHost {
							continue
						}
						if c.isExcluded(resolved) {
							continue
						}
						if c.cfg.RespectRobots && !c.robots.Allowed(resolved, c.cfg.UserAgent) {
							continue
						}
						if c.tryMarkSeen(resolved) {
							active.Add(1)
							select {
							case queue <- work{url: resolved, depth: w.depth + 1, parent: w.url}:
							default:
								active.Done()
							}
						}
					}
				}

				active.Done()
			}
		}()
	}

	wg.Wait()
	return pages, nil
}

func (c *Crawler) fetch(ctx context.Context, targetURL string, depth int, parent string) *Page {
	c.limiter.Wait(ctx)

	start := time.Now()
	page := &Page{
		URL:       targetURL,
		Depth:     depth,
		ParentURL: parent,
	}

	var lastErr error
	for attempt := 0; attempt <= c.cfg.RetryAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				page.Error = ctx.Err()
				page.Duration = time.Since(start)
				return page
			case <-time.After(c.cfg.RetryDelay * time.Duration(attempt)):
			}
		}

		err := c.doFetch(ctx, page, targetURL)
		if err != nil {
			lastErr = err
			if !isRetryable(page.StatusCode) {
				break
			}
			continue
		}
		if !isRetryable(page.StatusCode) {
			break
		}
	}

	if page.StatusCode == 0 && lastErr != nil {
		page.Error = lastErr
	}

	page.Duration = time.Since(start)
	return page
}

func (c *Crawler) doFetch(ctx context.Context, page *Page, targetURL string) error {
	pageCtx, cancel := context.WithTimeout(ctx, c.cfg.PageTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(pageCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		page.Error = err
		return err
	}

	req.Header.Set("User-Agent", c.cfg.UserAgent)
	if c.cfg.AuthHeader != "" {
		req.Header.Set(c.cfg.AuthHeader, c.cfg.AuthValue)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		page.Error = err
		return err
	}
	defer resp.Body.Close()

	page.StatusCode = resp.StatusCode
	page.Headers = resp.Header
	page.Error = nil

	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		page.Error = err
		return err
	}
	page.Body = body

	page.Links = extractLinks(targetURL, body)
	page.Forms = extractForms(body)
	return nil
}

func isRetryable(statusCode int) bool {
	return statusCode == 429 || statusCode == 500 || statusCode == 502 ||
		statusCode == 503 || statusCode == 504 || statusCode == 0
}

func (c *Crawler) markSeen(u string) {
	c.mu.Lock()
	c.seen[normalizeURL(u)] = true
	c.mu.Unlock()
}

func (c *Crawler) tryMarkSeen(u string) bool {
	normalized := normalizeURL(u)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.seen[normalized] {
		return false
	}
	c.seen[normalized] = true
	return true
}

func (c *Crawler) isExcluded(u string) bool {
	for _, pattern := range c.cfg.Exclude {
		if strings.Contains(u, pattern) {
			return true
		}
	}
	return false
}

func normalizeURL(u string) string {
	parsed, err := url.Parse(u)
	if err != nil {
		return u
	}
	parsed.Fragment = ""
	parsed.RawQuery = parsed.Query().Encode()
	return parsed.String()
}

func resolveURL(base, href string) string {
	if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(href, "mailto:") || strings.HasPrefix(href, "javascript:") {
		return ""
	}
	baseParsed, err := url.Parse(base)
	if err != nil {
		return ""
	}
	hrefParsed, err := url.Parse(href)
	if err != nil {
		return ""
	}
	return baseParsed.ResolveReference(hrefParsed).String()
}
