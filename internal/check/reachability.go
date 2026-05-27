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

// ReachabilityCheck verifies that embedded resources (images, scripts,
// stylesheets, fonts, media) referenced in HTML are actually reachable.
type ReachabilityCheck struct{}

func (r *ReachabilityCheck) Name() string { return "reachability" }

// resourceRef represents a resource reference found in HTML.
type resourceRef struct {
	URL      string
	Element  string // e.g. <img src="...">
	PageURL  string
	Resource string // "image", "script", "stylesheet", "font", "media"
}

func (r *ReachabilityCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	// Collect all resource references from all pages
	var refs []resourceRef
	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		refs = append(refs, extractResourceRefs(page)...)
	}

	if len(refs) == 0 {
		return nil
	}

	// Deduplicate by resolved URL
	seen := make(map[string]bool)
	var uniqueRefs []resourceRef
	for _, ref := range refs {
		resolved := resolveURL(ref.PageURL, ref.URL)
		if resolved == "" || seen[resolved] {
			continue
		}
		seen[resolved] = true
		ref.URL = resolved
		uniqueRefs = append(uniqueRefs, ref)
	}

	// Check reachability concurrently
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 20)
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	for _, ref := range uniqueRefs {
		// Skip data URIs and fragment-only references
		if strings.HasPrefix(ref.URL, "data:") || strings.HasPrefix(ref.URL, "#") {
			continue
		}
		// Skip javascript: URIs
		if strings.HasPrefix(ref.URL, "javascript:") {
			continue
		}

		wg.Add(1)
		go func(ref resourceRef) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			f := checkResourceReachable(ctx, client, ref)
			if f != nil {
				mu.Lock()
				findings = append(findings, *f)
				mu.Unlock()
			}
		}(ref)
	}

	wg.Wait()
	return findings
}

func checkResourceReachable(ctx context.Context, client *http.Client, ref resourceRef) *Finding {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, ref.URL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "inspect/1.0 (reachability check)")

	resp, err := client.Do(req)
	if err != nil {
		return &Finding{
			Severity: SeverityMedium,
			URL:      ref.PageURL,
			Element:  ref.Element,
			Message:  fmt.Sprintf("Unreachable %s resource: %s", ref.Resource, ref.URL),
			Fix:      "Fix or remove the broken resource reference",
			Evidence: err.Error(),
		}
	}
	defer resp.Body.Close()

	// If HEAD is rejected, try GET
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusForbidden {
		getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, ref.URL, nil)
		if err == nil {
			getReq.Header.Set("User-Agent", "inspect/1.0 (reachability check)")
			getResp, err := client.Do(getReq)
			if err == nil {
				io.CopyN(io.Discard, getResp.Body, 1)
				getResp.Body.Close()
				if getResp.StatusCode >= 200 && getResp.StatusCode < 400 {
					return nil
				}
				return &Finding{
					Severity: severityForResourceStatus(getResp.StatusCode),
					URL:      ref.PageURL,
					Element:  ref.Element,
					Message:  fmt.Sprintf("%s resource returns HTTP %d: %s", ref.Resource, getResp.StatusCode, ref.URL),
					Fix:      "Fix or remove the broken resource reference",
				}
			}
		}
	}

	if resp.StatusCode >= 400 {
		return &Finding{
			Severity: severityForResourceStatus(resp.StatusCode),
			URL:      ref.PageURL,
			Element:  ref.Element,
			Message:  fmt.Sprintf("%s resource returns HTTP %d: %s", ref.Resource, resp.StatusCode, ref.URL),
			Fix:      "Fix or remove the broken resource reference",
		}
	}

	return nil
}

func severityForResourceStatus(code int) Severity {
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

// extractResourceRefs parses HTML and extracts all resource references.
func extractResourceRefs(page *crawler.Page) []resourceRef {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var refs []resourceRef
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			tag := n.Data
			switch tag {
			case "img":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<img src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "image",
					})
				}
			case "script":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<script src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "script",
					})
				}
			case "link":
				rel := getAttr(n, "rel")
				if rel == "stylesheet" {
					if href := getAttr(n, "href"); href != "" {
						refs = append(refs, resourceRef{
							URL:      href,
							Element:  fmt.Sprintf(`<link rel="stylesheet" href="%s">`, truncateResRef(href, 80)),
							PageURL:  page.URL,
							Resource: "stylesheet",
						})
					}
				}
				if rel == "preload" || rel == "prefetch" {
					if href := getAttr(n, "href"); href != "" {
						refs = append(refs, resourceRef{
							URL:      href,
							Element:  fmt.Sprintf(`<link rel="%s" href="%s">`, rel, truncateResRef(href, 80)),
							PageURL:  page.URL,
							Resource: "preload",
						})
					}
				}
			case "video":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<video src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "media",
					})
				}
			case "audio":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<audio src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "media",
					})
				}
			case "source":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<source src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "media",
					})
				}
			case "iframe":
				if src := getAttr(n, "src"); src != "" {
					refs = append(refs, resourceRef{
						URL:      src,
						Element:  fmt.Sprintf(`<iframe src="%s">`, truncateResRef(src, 80)),
						PageURL:  page.URL,
						Resource: "iframe",
					})
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return refs
}

func resolveURL(base, href string) string {
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

func truncateResRef(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
