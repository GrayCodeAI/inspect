// Package crawler implements a concurrent website crawler with rate limiting,
// depth control, URL deduplication, and robots.txt compliance.
package crawler

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
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
	AllowPrivateIPs bool // When true, skip SSRF protection for private IPs
	Logger          *slog.Logger
	MaxPages        int // Maximum number of pages to crawl; 0 means no limit

	// CircuitBreaker, when non-nil, gates requests per host. If a host has
	// accumulated too many consecutive failures the breaker opens and the
	// crawler skips further requests to that host until the cooldown expires.
	CircuitBreaker *CircuitBreakerRegistry

	// Fetcher, when non-nil, overrides the default HTTP page retrieval. It is
	// used to plug in a headless-browser fetcher that renders JavaScript. SSRF
	// validation, rate limiting, retries, and the circuit breaker still run in
	// front of the fetcher.
	Fetcher Fetcher
}

// Fetcher retrieves a single page's content, populating the provided Page
// (StatusCode, Headers, Body, Links, Forms, Doc). The default implementation is
// the crawler's built-in HTTP fetch; a headless-browser implementation can be
// supplied via Config.Fetcher to analyze JavaScript-rendered pages.
type Fetcher interface {
	Fetch(ctx context.Context, page *Page, targetURL string) error
}

// Page represents a single crawled page with its metadata.
type Page struct {
	URL          string
	StatusCode   int
	Headers      http.Header
	Body         []byte
	Links        []Link
	Forms        []Form
	Depth        int
	ParentURL    string
	Duration     time.Duration
	Error        error
	AuthRequired bool       // true when server returned 401/403
	Doc          *html.Node // parsed HTML tree, populated once during fetch
}

// Link represents a hyperlink found on a page.
type Link struct {
	Href     string
	Text     string
	Rel      string
	External bool
	Anchor   bool
	Resource bool   // true for non-anchor resource URLs (img, script, iframe, etc.)
	Tag      string // source element tag (e.g., "img", "script", "iframe")
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
	cfg     Config
	client  *http.Client
	seen    map[string]bool
	mu      sync.Mutex
	robots  *RobotsCache
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

	baseDialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		MaxIdleConns:        cfg.Concurrency * 2,
		MaxIdleConnsPerHost: cfg.Concurrency,
		IdleConnTimeout:     90 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if !cfg.AllowPrivateIPs {
				host, _, err := net.SplitHostPort(addr)
				if err != nil {
					return nil, err
				}
				ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, err
				}
				for _, ip := range ips {
					if isPrivateIP(ip.IP) {
						return nil, fmt.Errorf("SSRF protection: blocked connection to private IP %s", ip.IP)
					}
				}
			}
			return baseDialer.DialContext(ctx, network, addr)
		},
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
		// Apply Crawl-Delay from robots.txt if it's slower than current rate limit
		if delay := c.robots.CrawlDelay(origin, c.cfg.UserAgent); delay > 0 && delay > c.limiter.interval {
			c.limiter.interval = delay
		}
	}

	// Seed with sitemap URLs if available
	sitemapURLs := c.robots.Sitemaps(origin)
	if len(sitemapURLs) == 0 {
		sitemapURLs = []string{origin + "/sitemap.xml"}
	}
	sitemapPages := FetchSitemapURLs(ctx, c.client, sitemapURLs)

	type work struct {
		url    string
		depth  int
		parent string
	}

	var (
		pages        []*Page
		pagesMu      sync.Mutex
		queue        = make(chan work, 10000)
		wg           sync.WaitGroup
		pagesCrawled int
		maxPages     = c.cfg.MaxPages
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
				if c.cfg.Logger != nil {
					c.cfg.Logger.Warn("crawler: URL dropped due to queue overflow", "url", sitemapPage)
				}
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
				pagesCrawled++
				atLimit := maxPages > 0 && pagesCrawled >= maxPages
				pagesMu.Unlock()

				if atLimit {
					active.Done()
					continue
				}

				if page.Error == nil && (c.cfg.MaxDepth == 0 || w.depth < c.cfg.MaxDepth) {
					for _, link := range page.Links {
						if link.External || link.Anchor {
							continue
						}
						resolved := ResolveURL(w.url, link.Href)
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
								if c.cfg.Logger != nil {
									c.cfg.Logger.Warn("crawler: URL dropped due to queue overflow", "url", resolved)
								}
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

	// Check circuit breaker before attempting any request.
	if c.cfg.CircuitBreaker != nil {
		host := extractHost(targetURL)
		if host != "" && !c.cfg.CircuitBreaker.AllowRequest(host) {
			page.Error = fmt.Errorf("circuit breaker open for host %s", host)
			page.Duration = time.Since(start)
			return page
		}
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

		err := c.runFetch(ctx, page, targetURL)
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

	// Record success or failure with the circuit breaker.
	if c.cfg.CircuitBreaker != nil {
		host := extractHost(targetURL)
		if host != "" {
			if page.Error != nil || page.StatusCode >= 500 {
				c.cfg.CircuitBreaker.RecordFailure(host)
			} else {
				c.cfg.CircuitBreaker.RecordSuccess(host)
			}
		}
	}

	page.Duration = time.Since(start)
	return page
}

// runFetch performs SSRF validation, then delegates to the configured Fetcher
// (e.g. headless browser) or the built-in HTTP fetch.
func (c *Crawler) runFetch(ctx context.Context, page *Page, targetURL string) error {
	// SSRF protection: validate URL scheme and resolved IP for both paths.
	if err := c.validateURL(targetURL); err != nil {
		page.Error = err
		return err
	}
	if c.cfg.Fetcher != nil {
		pageCtx, cancel := context.WithTimeout(ctx, c.cfg.PageTimeout)
		defer cancel()
		if err := c.cfg.Fetcher.Fetch(pageCtx, page, targetURL); err != nil {
			page.Error = err
			return err
		}
		return nil
	}
	return c.doFetch(ctx, page, targetURL)
}

func (c *Crawler) doFetch(ctx context.Context, page *Page, targetURL string) error {
	pageCtx, cancel := context.WithTimeout(ctx, c.cfg.PageTimeout)
	defer cancel()

	// Manual redirect handling with loop detection
	const maxRedirects = 10
	visited := make(map[string]bool)
	currentURL := targetURL
	originalParsed, _ := url.Parse(targetURL)
	originalHost := ""
	if originalParsed != nil {
		originalHost = originalParsed.Host
	}

	for redirectCount := 0; ; redirectCount++ {
		if redirectCount > maxRedirects {
			err := fmt.Errorf("too many redirects (max %d)", maxRedirects)
			page.Error = err
			return err
		}
		if visited[currentURL] {
			err := fmt.Errorf("redirect loop detected at %s", currentURL)
			page.Error = err
			return err
		}
		visited[currentURL] = true

		req, err := http.NewRequestWithContext(pageCtx, http.MethodGet, currentURL, nil)
		if err != nil {
			page.Error = err
			return err
		}

		req.Header.Set("User-Agent", c.cfg.UserAgent)
		if c.cfg.AuthHeader != "" {
			// Only send auth header when the target host matches the original
			// host to prevent credential leakage on cross-host redirects.
			reqParsed, _ := url.Parse(currentURL)
			if reqParsed != nil && reqParsed.Host == originalHost {
				req.Header.Set(c.cfg.AuthHeader, c.cfg.AuthValue)
			}
		}

		// Use a client that does not follow redirects automatically
		resp, err := c.noRedirectClient().Do(req)
		if err != nil {
			page.Error = err
			return err
		}

		// Handle auth-required responses as findings rather than errors
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			resp.Body.Close()
			page.StatusCode = resp.StatusCode
			page.Headers = resp.Header
			page.Error = nil
			page.AuthRequired = true
			return nil
		}

		// Handle redirects manually
		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			resp.Body.Close()
			loc := resp.Header.Get("Location")
			if loc == "" {
				page.StatusCode = resp.StatusCode
				page.Headers = resp.Header
				return nil
			}
			resolved := ResolveURL(currentURL, loc)
			if resolved == "" {
				page.StatusCode = resp.StatusCode
				page.Headers = resp.Header
				return nil
			}
			// Validate redirect target for SSRF
			if err := c.validateURL(resolved); err != nil {
				page.Error = err
				return err
			}
			currentURL = resolved
			continue
		}

		// Non-redirect response
		page.StatusCode = resp.StatusCode
		page.Headers = resp.Header
		page.Error = nil

		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/html") {
			resp.Body.Close()
			return nil
		}

		body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
		resp.Body.Close()
		if err != nil {
			page.Error = err
			return err
		}
		page.Body = body

		doc, links, forms, _ := ParseHTMLDoc(currentURL, body)
		page.Doc = doc
		page.Links = links
		page.Forms = forms
		return nil
	}
}

// noRedirectClient returns an HTTP client that does not follow redirects.
func (c *Crawler) noRedirectClient() *http.Client {
	return &http.Client{
		Transport: c.client.Transport,
		Timeout:   c.client.Timeout,
		Jar:       c.client.Jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// validateURL checks the URL for SSRF risks: scheme must be http/https and
// resolved IP must not be in private ranges (unless AllowPrivateIPs is set).
func (c *Crawler) validateURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("disallowed URL scheme %q (only http/https allowed)", parsed.Scheme)
	}
	if c.cfg.AllowPrivateIPs {
		return nil
	}
	host := parsed.Hostname()
	ips, err := net.LookupHost(host)
	if err != nil {
		// DNS resolution failure is not an SSRF issue; let the fetch handle it
		return nil
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}
		if isPrivateIP(ip) {
			return fmt.Errorf("SSRF protection: resolved IP %s for host %q is in a private range", ipStr, host)
		}
	}
	return nil
}

// isPrivateIP checks if an IP is in a private/loopback range.
func isPrivateIP(ip net.IP) bool {
	privateRanges := []struct {
		network *net.IPNet
	}{
		{mustParseCIDR("10.0.0.0/8")},
		{mustParseCIDR("172.16.0.0/12")},
		{mustParseCIDR("192.168.0.0/16")},
		{mustParseCIDR("127.0.0.0/8")},
		{mustParseCIDR("169.254.0.0/16")}, // link-local, incl. cloud metadata (169.254.169.254)
		{mustParseCIDR("100.64.0.0/10")},  // CGNAT shared address space
		{mustParseCIDR("::1/128")},
		{mustParseCIDR("fc00::/7")},
		{mustParseCIDR("fe80::/10")}, // IPv6 link-local
	}
	for _, r := range privateRanges {
		if r.network.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDR(s string) *net.IPNet {
	_, network, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return network
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
