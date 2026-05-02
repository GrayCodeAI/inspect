package check

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// LinksCheck detects broken links, redirect chains, and dead anchors.
type LinksCheck struct{}

func (l *LinksCheck) Name() string { return "links" }

func (l *LinksCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	pagesByURL := make(map[string]*crawler.Page)
	for _, p := range pages {
		pagesByURL[normalizeForLookup(p.URL)] = p
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 20)

	for _, page := range pages {
		if page.Error != nil {
			continue
		}

		if page.StatusCode >= 400 {
			findings = append(findings, Finding{
				Severity: severityForStatus(page.StatusCode),
				URL:      page.URL,
				Message:  fmt.Sprintf("Page returns HTTP %d", page.StatusCode),
				Fix:      "Fix or remove links pointing to this page",
				Evidence: fmt.Sprintf("Status: %d, linked from: %s", page.StatusCode, page.ParentURL),
			})
		}

		for _, link := range page.Links {
			if link.Anchor {
				continue
			}
			if link.Href == "" {
				continue
			}

			resolved := resolveLink(page.URL, link.Href)
			if resolved == "" {
				continue
			}

			if _, known := pagesByURL[normalizeForLookup(resolved)]; known {
				continue
			}

			if link.External {
				wg.Add(1)
				go func(pageURL, href, resolved string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()

					f := checkExternalLink(ctx, pageURL, href, resolved)
					if f != nil {
						mu.Lock()
						findings = append(findings, *f)
						mu.Unlock()
					}
				}(page.URL, link.Href, resolved)
			}
		}
	}

	wg.Wait()

	for _, page := range pages {
		if page.StatusCode >= 300 && page.StatusCode < 400 {
			location := page.Headers.Get("Location")
			if location != "" {
				chain := detectRedirectChain(pages, page.URL, pagesByURL)
				if chain > 2 {
					findings = append(findings, Finding{
						Severity: SeverityMedium,
						URL:      page.URL,
						Message:  fmt.Sprintf("Redirect chain of %d hops", chain),
						Fix:      "Update links to point directly to the final destination",
						Evidence: fmt.Sprintf("Redirects to: %s", location),
					})
				}
			}
		}
	}

	return findings
}

func checkExternalLink(ctx context.Context, pageURL, href, resolved string) *Finding {
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, resolved, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "inspect/1.0 (link checker)")

	resp, err := client.Do(req)
	if err != nil {
		return &Finding{
			Severity: SeverityHigh,
			URL:      pageURL,
			Element:  fmt.Sprintf(`<a href="%s">`, href),
			Message:  fmt.Sprintf("External link unreachable: %s", resolved),
			Fix:      "Remove or update the broken link",
			Evidence: err.Error(),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return &Finding{
			Severity: severityForStatus(resp.StatusCode),
			URL:      pageURL,
			Element:  fmt.Sprintf(`<a href="%s">`, href),
			Message:  fmt.Sprintf("External link returns HTTP %d: %s", resp.StatusCode, resolved),
			Fix:      "Remove or update the broken link",
		}
	}
	return nil
}

func detectRedirectChain(pages []*crawler.Page, startURL string, lookup map[string]*crawler.Page) int {
	count := 0
	current := startURL
	seen := make(map[string]bool)
	for count < 10 {
		if seen[current] {
			break
		}
		seen[current] = true
		page, ok := lookup[normalizeForLookup(current)]
		if !ok || page.StatusCode < 300 || page.StatusCode >= 400 {
			break
		}
		location := page.Headers.Get("Location")
		if location == "" {
			break
		}
		current = resolveLink(current, location)
		count++
	}
	return count
}

func resolveLink(base, href string) string {
	if href == "" {
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

func normalizeForLookup(u string) string {
	parsed, err := url.Parse(u)
	if err != nil {
		return u
	}
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func severityForStatus(code int) Severity {
	switch {
	case code == 404:
		return SeverityHigh
	case code >= 500:
		return SeverityCritical
	case code >= 400:
		return SeverityMedium
	default:
		return SeverityLow
	}
}
