package check

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// LinksCheck detects broken links, redirect chains, and dead anchors.
type LinksCheck struct {
	// AcceptedStatusCodes is the set of HTTP status codes considered acceptable.
	// If empty, defaults to 200-399.
	AcceptedStatusCodes []int
}

func (l *LinksCheck) Name() string { return "links" }

func (l *LinksCheck) isAcceptedStatus(code int) bool {
	if len(l.AcceptedStatusCodes) > 0 {
		for _, c := range l.AcceptedStatusCodes {
			if c == code {
				return true
			}
		}
		return false
	}
	// Default: 200-399
	return code >= 200 && code < 400
}

func (l *LinksCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	pagesByURL := make(map[string]*crawler.Page)
	for _, p := range pages {
		pagesByURL[normalizeForLookup(p.URL)] = p
	}

	// Build a map of page URL -> set of element IDs for fragment validation
	pageIDs := make(map[string]map[string]bool)
	for _, p := range pages {
		if p.Error != nil || len(p.Body) == 0 {
			continue
		}
		ids := extractElementIDs(p.Body)
		pageIDs[normalizeForLookup(p.URL)] = ids
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 20)

	for _, page := range pages {
		if page.Error != nil {
			continue
		}

		if !l.isAcceptedStatus(page.StatusCode) {
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

			// Fragment validation: check that the target page has an element with the fragment ID
			if fragment := extractFragment(link.Href); fragment != "" {
				targetNorm := normalizeForLookup(resolved)
				if ids, ok := pageIDs[targetNorm]; ok {
					if !ids[fragment] {
						findings = append(findings, Finding{
							Severity: SeverityMedium,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<a href="%s">`, truncateHref(link.Href, 80)),
							Message:  fmt.Sprintf("Fragment #%s not found on target page", fragment),
							Fix:      "Add an element with id=\"" + fragment + "\" on the target page, or fix the link",
							Evidence: fmt.Sprintf("Target: %s", resolved),
						})
					}
				}
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

					f := l.checkExternalLink(ctx, pageURL, href, resolved)
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

// extractElementIDs parses HTML and returns all id attribute values.
func extractElementIDs(body []byte) map[string]bool {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}
	ids := make(map[string]bool)
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for _, attr := range n.Attr {
				if attr.Key == "id" && attr.Val != "" {
					ids[attr.Val] = true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return ids
}

// extractFragment returns the fragment part of a URL (without #).
func extractFragment(href string) string {
	parsed, err := url.Parse(href)
	if err != nil {
		return ""
	}
	return parsed.Fragment
}

func truncateHref(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func (l *LinksCheck) checkExternalLink(ctx context.Context, pageURL, href, resolved string) *Finding {
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

	// If the server rejects HEAD (405 or 403), retry with GET as a fallback.
	// Some servers block HEAD requests but respond normally to GET.
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusForbidden {
		getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, resolved, nil)
		if err == nil {
			getReq.Header.Set("User-Agent", "inspect/1.0 (link checker)")
			getResp, err := client.Do(getReq)
			if err == nil {
				// Read at most 1 byte -- we only need the status code.
				io.CopyN(io.Discard, getResp.Body, 1)
				getResp.Body.Close()
				// Use the GET response status instead.
				if l.isAcceptedStatus(getResp.StatusCode) {
					return nil
				}
				return &Finding{
					Severity: severityForStatus(getResp.StatusCode),
					URL:      pageURL,
					Element:  fmt.Sprintf(`<a href="%s">`, href),
					Message:  fmt.Sprintf("External link returns HTTP %d: %s", getResp.StatusCode, resolved),
					Fix:      "Remove or update the broken link",
				}
			}
		}
	}

	if !l.isAcceptedStatus(resp.StatusCode) {
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
