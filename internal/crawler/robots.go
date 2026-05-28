package crawler

import (
	"bufio"
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RobotsCache caches parsed robots.txt rules per host.
type RobotsCache struct {
	// rules maps origin -> user-agent (lowercased) -> rules
	rules map[string]map[string]*robotsRules
	mu    sync.RWMutex
}

type robotsRules struct {
	disallow   []string
	allow      []string
	crawlDelay time.Duration
}

// NewRobotsCache creates an empty robots.txt cache.
func NewRobotsCache() *RobotsCache {
	return &RobotsCache{rules: make(map[string]map[string]*robotsRules)}
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

	// Collect all sections: each section has one or more user-agents and its rules.
	type section struct {
		userAgents []string
		disallow   []string
		allow      []string
		crawlDelay time.Duration
	}
	var sections []section
	var sitemaps []string
	var currentAgents []string
	var currentDisallow []string
	var currentAllow []string
	var currentCrawlDelay time.Duration
	inUserAgent := false
	inRules := false

	flushSection := func() {
		if len(currentAgents) > 0 {
			sections = append(sections, section{
				userAgents: currentAgents,
				disallow:   currentDisallow,
				allow:      currentAllow,
				crawlDelay: currentCrawlDelay,
			})
		}
		currentAgents = nil
		currentDisallow = nil
		currentAllow = nil
		currentCrawlDelay = 0
		inUserAgent = false
		inRules = false
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			flushSection()
			continue
		}
		if strings.HasPrefix(line, "#") {
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
			// User-agent lines at the start of a section collect agents.
			// If we already have rules, flush and start a new section.
			if inRules {
				flushSection()
			}
			currentAgents = append(currentAgents, strings.ToLower(value))
			inUserAgent = true
		case "disallow":
			if inUserAgent && value != "" {
				currentDisallow = append(currentDisallow, value)
				inRules = true
			}
		case "allow":
			if inUserAgent && value != "" {
				currentAllow = append(currentAllow, value)
				inRules = true
			}
		case "crawl-delay":
			if inUserAgent {
				inRules = true
				if secs, err := strconv.ParseFloat(value, 64); err == nil && secs > 0 {
					currentCrawlDelay = time.Duration(secs * float64(time.Second))
				}
			}
		case "sitemap":
			sitemaps = append(sitemaps, value)
		}
	}
	// Flush any remaining section
	flushSection()

	// Build per-user-agent rule map.
	uaRules := make(map[string]*robotsRules)
	for _, sec := range sections {
		for _, ua := range sec.userAgents {
			uaRules[ua] = &robotsRules{
				disallow:   sec.disallow,
				allow:      sec.allow,
				crawlDelay: sec.crawlDelay,
			}
		}
	}

	// Store sitemaps under a sentinel key so Sitemaps() can retrieve them.
	if len(sitemaps) > 0 {
		uaRules["__sitemaps__"] = &robotsRules{}
	}

	rc.mu.Lock()
	rc.rules[origin] = uaRules
	if len(sitemaps) > 0 {
		// Store sitemaps alongside the rules map for this origin.
		// We reuse the __sitemaps__ entry's allow field to carry sitemap URLs.
		rc.rules[origin]["__sitemaps__"].allow = sitemaps
	}
	rc.mu.Unlock()
}

// matchRules evaluates allow/disallow rules against a path.
// Per the standard, if both Allow and Disallow match a path, the longest
// matching rule wins. If they are the same length, Allow takes precedence.
func matchRules(rules *robotsRules, path string) bool {
	longestAllow := -1
	for _, a := range rules.allow {
		if strings.HasPrefix(path, a) && len(a) > longestAllow {
			longestAllow = len(a)
		}
	}
	longestDisallow := -1
	for _, d := range rules.disallow {
		if strings.HasPrefix(path, d) && len(d) > longestDisallow {
			longestDisallow = len(d)
		}
	}

	// No matching rules: allowed
	if longestAllow == -1 && longestDisallow == -1 {
		return true
	}
	// Allow wins on tie or longer match
	return longestAllow >= longestDisallow
}

// Allowed checks if a URL is permitted by robots.txt rules.
// Bot-specific user-agent sections are matched first (case-insensitive),
// then the wildcard (*) section is used as fallback. If both bot-specific
// and wildcard rules exist, a path is disallowed if either section blocks it.
func (rc *RobotsCache) Allowed(rawURL, userAgent string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return true
	}
	origin := parsed.Scheme + "://" + parsed.Host
	path := parsed.Path

	rc.mu.RLock()
	uaRules, ok := rc.rules[origin]
	rc.mu.RUnlock()

	if !ok {
		return true
	}

	lowerUA := strings.ToLower(userAgent)

	// Check bot-specific rules
	if rules, found := uaRules[lowerUA]; found {
		if !matchRules(rules, path) {
			return false
		}
		// Bot-specific rules allowed; also check wildcard rules
		if wcRules, wcFound := uaRules["*"]; wcFound {
			return matchRules(wcRules, path)
		}
		return true
	}

	// Fall back to wildcard
	if rules, found := uaRules["*"]; found {
		return matchRules(rules, path)
	}

	// No matching user-agent section: allowed
	return true
}

// CrawlDelay returns the crawl-delay directive for the given origin and user-agent,
// or 0 if not set. Bot-specific sections are matched first, then wildcard.
func (rc *RobotsCache) CrawlDelay(origin, userAgent string) time.Duration {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	uaRules, ok := rc.rules[origin]
	if !ok {
		return 0
	}

	lowerUA := strings.ToLower(userAgent)

	// Try bot-specific rules first
	if rules, found := uaRules[lowerUA]; found && rules.crawlDelay > 0 {
		return rules.crawlDelay
	}

	// Fall back to wildcard
	if rules, found := uaRules["*"]; found && rules.crawlDelay > 0 {
		return rules.crawlDelay
	}

	return 0
}

// Sitemaps returns sitemap URLs declared in robots.txt.
func (rc *RobotsCache) Sitemaps(origin string) []string {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	if uaRules, ok := rc.rules[origin]; ok {
		if entry, found := uaRules["__sitemaps__"]; found {
			return entry.allow
		}
	}
	return nil
}
