package check

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// SRICheck validates that cross-origin scripts and stylesheets have
// Subresource Integrity (SRI) attributes with strong hashes.
type SRICheck struct{}

func (s *SRICheck) Name() string { return "sri" }

func (s *SRICheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		findings = append(findings, s.checkPage(page)...)
	}

	return findings
}

func (s *SRICheck) checkPage(page *crawler.Page) []Finding {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var findings []Finding
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "script":
				src := getAttr(n, "src")
				if src != "" && isCrossOriginURL(page.URL, src) {
					findings = append(findings, s.checkSRI(page.URL, n, "script", src)...)
				}
			case "link":
				rel := getAttr(n, "rel")
				if rel == "stylesheet" {
					href := getAttr(n, "href")
					if href != "" && isCrossOriginURL(page.URL, href) {
						findings = append(findings, s.checkSRI(page.URL, n, "link", href)...)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	return findings
}

func (s *SRICheck) checkSRI(pageURL string, n *html.Node, tag, src string) []Finding {
	var findings []Finding
	integrity := getAttr(n, "integrity")
	crossorigin := getAttr(n, "crossorigin")

	element := fmt.Sprintf(`<%s src="%s">`, tag, truncateStr(src, 60))
	if tag == "link" {
		element = fmt.Sprintf(`<link href="%s">`, truncateStr(src, 60))
	}

	if integrity == "" {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      pageURL,
			Element:  element,
			Message:  fmt.Sprintf("Cross-origin %s missing integrity attribute (SRI)", tag),
			Fix:      "Add an integrity attribute with a SHA-384 or SHA-512 hash",
			Evidence: fmt.Sprintf("Source: %s", src),
		})
	} else {
		// Check hash strength: must be SHA-384 or SHA-512
		if !isStrongSRIHash(integrity) {
			findings = append(findings, Finding{
				Severity: SeverityLow,
				URL:      pageURL,
				Element:  element,
				Message:  fmt.Sprintf("SRI integrity uses weak hash algorithm on %s", tag),
				Fix:      "Use SHA-384 or SHA-512 for the integrity attribute",
				Evidence: fmt.Sprintf("integrity=%q", truncateStr(integrity, 60)),
			})
		}

		// If integrity is present, crossorigin must also be present
		if crossorigin == "" {
			findings = append(findings, Finding{
				Severity: SeverityMedium,
				URL:      pageURL,
				Element:  element,
				Message:  fmt.Sprintf("Cross-origin %s has integrity but missing crossorigin attribute", tag),
				Fix:      `Add crossorigin="anonymous" to enable SRI verification`,
				Evidence: fmt.Sprintf("Source: %s", src),
			})
		}
	}

	return findings
}

// isCrossOriginURL checks if a resource URL is cross-origin relative to the page URL.
func isCrossOriginURL(pageURL, resourceURL string) bool {
	// Absolute URLs starting with // or http(s):// to a different host
	if strings.HasPrefix(resourceURL, "//") || strings.HasPrefix(resourceURL, "http://") || strings.HasPrefix(resourceURL, "https://") {
		pageHost := extractHost(pageURL)
		resourceHost := extractHost(resourceURL)
		return resourceHost != "" && resourceHost != pageHost
	}
	return false
}

func extractHost(u string) string {
	// Simple host extraction without net/url for speed
	u = strings.TrimPrefix(u, "https://")
	u = strings.TrimPrefix(u, "http://")
	u = strings.TrimPrefix(u, "//")
	if idx := strings.IndexByte(u, '/'); idx >= 0 {
		u = u[:idx]
	}
	if idx := strings.IndexByte(u, ':'); idx >= 0 {
		u = u[:idx]
	}
	return u
}

// isStrongSRIHash checks that the integrity attribute uses SHA-384 or SHA-512.
func isStrongSRIHash(integrity string) bool {
	// integrity can have multiple space-separated hashes
	hashes := strings.Fields(integrity)
	for _, h := range hashes {
		if strings.HasPrefix(h, "sha384-") || strings.HasPrefix(h, "sha512-") {
			return true
		}
	}
	return false
}
