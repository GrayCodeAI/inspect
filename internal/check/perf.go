package check

import (
	"bytes"
	"context"
	"fmt"
	"strconv"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// PerfCheck detects performance issues: large resources, render-blocking scripts,
// missing compression, excessive DOM size.
type PerfCheck struct{}

func (p *PerfCheck) Name() string { return "perf" }

func (p *PerfCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		findings = append(findings, p.checkPage(page)...)
	}

	return findings
}

func (p *PerfCheck) checkPage(page *crawler.Page) []Finding {
	var findings []Finding

	if !hasCompression(page) && len(page.Body) > 1024 {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Message:  "Response not compressed (no Content-Encoding header)",
			Fix:      "Enable gzip or brotli compression on the server",
			Evidence: fmt.Sprintf("Response size: %d bytes", len(page.Body)),
		})
	}

	if !hasCacheControl(page) {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Missing Cache-Control header",
			Fix:      "Add appropriate Cache-Control headers to reduce repeat requests",
		})
	}

	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return findings
	}

	var nodeCount int
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			nodeCount++

			switch n.Data {
			case "script":
				if !hasAttr(n, "async") && !hasAttr(n, "defer") && !hasAttr(n, "type") {
					src := getAttr(n, "src")
					if src != "" && isInHead(n) {
						findings = append(findings, Finding{
							Severity: SeverityMedium,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<script src="%s">`, truncateStr(src, 60)),
							Message:  "Render-blocking script in <head> without async or defer",
							Fix:      "Add async or defer attribute, or move to end of <body>",
						})
					}
				}
			case "link":
				rel := getAttr(n, "rel")
				if rel == "stylesheet" && isInHead(n) && !hasAttr(n, "media") {
					href := getAttr(n, "href")
					findings = append(findings, Finding{
						Severity: SeverityLow,
						URL:      page.URL,
						Element:  fmt.Sprintf(`<link href="%s">`, truncateStr(href, 60)),
						Message:  "Render-blocking stylesheet without media query",
						Fix:      "Add media attribute for non-critical CSS or load asynchronously",
					})
				}
			case "img":
				width := getAttr(n, "width")
				height := getAttr(n, "height")
				if width == "" || height == "" {
					src := getAttr(n, "src")
					if src != "" {
						findings = append(findings, Finding{
							Severity: SeverityLow,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<img src="%s">`, truncateStr(src, 60)),
							Message:  "Image missing width/height attributes (causes layout shift)",
							Fix:      "Add explicit width and height attributes to prevent CLS",
						})
					}
				}
				if !hasAttr(n, "loading") && !isAboveFold(n) {
					src := getAttr(n, "src")
					if src != "" {
						findings = append(findings, Finding{
							Severity: SeverityLow,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<img src="%s">`, truncateStr(src, 60)),
							Message:  "Image missing loading=\"lazy\" attribute",
							Fix:      "Add loading=\"lazy\" for below-fold images",
						})
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if nodeCount > 1500 {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Message:  fmt.Sprintf("Excessive DOM size: %d elements", nodeCount),
			Fix:      "Reduce DOM complexity; consider lazy-loading sections or virtualizing lists",
		})
	}

	if len(page.Body) > 500*1024 {
		findings = append(findings, Finding{
			Severity: SeverityHigh,
			URL:      page.URL,
			Message:  fmt.Sprintf("Page size exceeds 500KB (%s)", formatBytes(len(page.Body))),
			Fix:      "Reduce page size by optimizing images, minifying assets, and removing unused code",
		})
	}

	return findings
}

func hasCompression(page *crawler.Page) bool {
	encoding := page.Headers.Get("Content-Encoding")
	return encoding != "" && encoding != "identity"
}

func hasCacheControl(page *crawler.Page) bool {
	return page.Headers.Get("Cache-Control") != ""
}

func isInHead(n *html.Node) bool {
	for p := n.Parent; p != nil; p = p.Parent {
		if p.Type == html.ElementNode && p.Data == "head" {
			return true
		}
	}
	return false
}

func isAboveFold(n *html.Node) bool {
	return false
}

func formatBytes(b int) string {
	const unit = 1024
	if b < unit {
		return strconv.Itoa(b) + " B"
	}
	div, exp := unit, 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

