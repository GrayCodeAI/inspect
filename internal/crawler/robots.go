package crawler

import (
	"bufio"
	"context"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// RobotsCache caches parsed robots.txt rules per host.
type RobotsCache struct {
	rules map[string]*robotsRules
	mu    sync.RWMutex
}

type robotsRules struct {
	disallow []string
	allow    []string
	sitemaps []string
}

// NewRobotsCache creates an empty robots.txt cache.
func NewRobotsCache() *RobotsCache {
	return &RobotsCache{rules: make(map[string]*robotsRules)}
}

// Fetch downloads and parses robots.txt for the given origin.
func (rc *RobotsCache) Fetch(ctx context.Context, client *http.Client, origin string) {
	robotsURL := origin + "/robots.txt"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, robotsURL, nil)
	if err != nil {
		return
	}

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return
	}
	defer resp.Body.Close()

	rules := &robotsRules{}
	scanner := bufio.NewScanner(resp.Body)
	inUserAgent := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		field := strings.TrimSpace(strings.ToLower(parts[0]))
		value := strings.TrimSpace(parts[1])

		switch field {
		case "user-agent":
			inUserAgent = value == "*"
		case "disallow":
			if inUserAgent && value != "" {
				rules.disallow = append(rules.disallow, value)
			}
		case "allow":
			if inUserAgent && value != "" {
				rules.allow = append(rules.allow, value)
			}
		case "sitemap":
			rules.sitemaps = append(rules.sitemaps, value)
		}
	}

	rc.mu.Lock()
	rc.rules[origin] = rules
	rc.mu.Unlock()
}

// Allowed checks if a URL is permitted by robots.txt rules.
func (rc *RobotsCache) Allowed(rawURL, userAgent string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return true
	}
	origin := parsed.Scheme + "://" + parsed.Host
	path := parsed.Path

	rc.mu.RLock()
	rules, ok := rc.rules[origin]
	rc.mu.RUnlock()

	if !ok {
		return true
	}

	for _, a := range rules.allow {
		if strings.HasPrefix(path, a) {
			return true
		}
	}
	for _, d := range rules.disallow {
		if strings.HasPrefix(path, d) {
			return false
		}
	}
	return true
}

// Sitemaps returns sitemap URLs declared in robots.txt.
func (rc *RobotsCache) Sitemaps(origin string) []string {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	if rules, ok := rc.rules[origin]; ok {
		return rules.sitemaps
	}
	return nil
}
