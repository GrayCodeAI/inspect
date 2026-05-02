package check

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// AIReadyCheck verifies that a site is AI-agent-friendly by checking for
// emerging standards and best practices that help LLMs and AI agents
// understand and navigate the site effectively.
//
// Checks performed:
//   - /llms.txt endpoint (emerging standard for LLM-readable site descriptions)
//   - <link rel="alternate" type="text/markdown"> for markdown alternatives
//   - Structured data (JSON-LD, microdata)
//   - Clean semantic HTML (proper heading hierarchy, landmarks)
//   - Sitemap.xml accessibility
type AIReadyCheck struct{}

func (a *AIReadyCheck) Name() string { return "aiready" }

func (a *AIReadyCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	findings = append(findings, a.checkLLMsTxt(pages)...)
	findings = append(findings, a.checkSitemapAccessible(pages)...)

	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		contentType := page.Headers.Get("Content-Type")
		if !strings.Contains(contentType, "text/html") {
			continue
		}
		findings = append(findings, a.checkMarkdownAlternate(page)...)
		findings = append(findings, a.checkStructuredData(page)...)
		findings = append(findings, a.checkSemanticHTML(page)...)
	}

	return findings
}

// checkLLMsTxt looks for a /llms.txt page among the crawled pages. The
// llms.txt file is an emerging convention for providing LLM-readable
// descriptions of a website's purpose and structure.
func (a *AIReadyCheck) checkLLMsTxt(pages []*crawler.Page) []Finding {
	for _, page := range pages {
		if strings.HasSuffix(strings.TrimRight(page.URL, "/"), "/llms.txt") {
			if page.Error == nil && page.StatusCode >= 200 && page.StatusCode < 400 {
				return nil // found and accessible
			}
		}
	}

	// Determine base URL from the first page
	baseURL := ""
	if len(pages) > 0 {
		baseURL = pages[0].URL
	}

	return []Finding{
		{
			Severity: SeverityInfo,
			URL:      baseURL,
			Message:  "No /llms.txt endpoint found — consider adding one for AI agent discoverability",
			Fix:      "Create a /llms.txt file describing your site's purpose, key pages, and API endpoints in plain text. See https://llmstxt.org for the emerging standard.",
		},
	}
}

// checkSitemapAccessible verifies that sitemap.xml is present and reachable.
func (a *AIReadyCheck) checkSitemapAccessible(pages []*crawler.Page) []Finding {
	for _, page := range pages {
		if strings.HasSuffix(page.URL, "/sitemap.xml") {
			if page.Error == nil && page.StatusCode >= 200 && page.StatusCode < 400 {
				return nil // sitemap is accessible
			}
			return []Finding{
				{
					Severity: SeverityLow,
					URL:      page.URL,
					Message:  fmt.Sprintf("sitemap.xml returned status %d — AI agents rely on sitemaps for discovery", page.StatusCode),
					Fix:      "Ensure sitemap.xml returns a valid XML sitemap with 200 status",
				},
			}
		}
	}

	baseURL := ""
	if len(pages) > 0 {
		baseURL = pages[0].URL
	}

	return []Finding{
		{
			Severity: SeverityLow,
			URL:      baseURL,
			Message:  "No accessible sitemap.xml found — AI agents use sitemaps to discover site structure",
			Fix:      "Add a sitemap.xml at the site root listing all important URLs",
		},
	}
}

// checkMarkdownAlternate looks for <link rel="alternate" type="text/markdown">
// which signals that a markdown version of the page is available, making
// content more accessible to AI agents.
func (a *AIReadyCheck) checkMarkdownAlternate(page *crawler.Page) []Finding {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	hasMarkdownAlt := false
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if hasMarkdownAlt {
			return
		}
		if n.Type == html.ElementNode && n.Data == "link" {
			rel := strings.ToLower(getAttr(n, "rel"))
			typ := strings.ToLower(getAttr(n, "type"))
			if rel == "alternate" && (typ == "text/markdown" || typ == "text/x-markdown") {
				hasMarkdownAlt = true
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if !hasMarkdownAlt {
		return []Finding{
			{
				Severity: SeverityInfo,
				URL:      page.URL,
				Element:  "<head>",
				Message:  "No markdown alternate link found — AI agents prefer markdown over HTML",
				Fix:      `Add <link rel="alternate" type="text/markdown" href="/page.md"> to offer a markdown version`,
			},
		}
	}

	return nil
}

// checkStructuredData looks for JSON-LD scripts and microdata attributes
// that help AI agents understand the page's content semantically.
func (a *AIReadyCheck) checkStructuredData(page *crawler.Page) []Finding {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	hasJSONLD := false
	hasMicrodata := false

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			// Check for JSON-LD
			if n.Data == "script" && strings.ToLower(getAttr(n, "type")) == "application/ld+json" {
				hasJSONLD = true
			}
			// Check for microdata attributes
			if getAttr(n, "itemscope") != "" || getAttr(n, "itemprop") != "" || getAttr(n, "itemtype") != "" {
				hasMicrodata = true
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if !hasJSONLD && !hasMicrodata {
		return []Finding{
			{
				Severity: SeverityLow,
				URL:      page.URL,
				Message:  "No structured data found (JSON-LD or microdata) — structured data helps AI agents understand page content",
				Fix:      `Add JSON-LD structured data: <script type="application/ld+json">{"@context":"https://schema.org",...}</script>`,
			},
		}
	}

	return nil
}

// checkSemanticHTML verifies that the page uses proper semantic HTML that
// AI agents can reliably parse: heading hierarchy, landmark elements, and
// meaningful structure.
func (a *AIReadyCheck) checkSemanticHTML(page *crawler.Page) []Finding {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var findings []Finding
	hasMain := false
	hasNav := false
	hasH1 := false
	h1Count := 0
	var headingLevels []int

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "main":
				hasMain = true
			case "nav":
				hasNav = true
			case "h1":
				hasH1 = true
				h1Count++
				headingLevels = append(headingLevels, 1)
			case "h2":
				headingLevels = append(headingLevels, 2)
			case "h3":
				headingLevels = append(headingLevels, 3)
			case "h4":
				headingLevels = append(headingLevels, 4)
			case "h5":
				headingLevels = append(headingLevels, 5)
			case "h6":
				headingLevels = append(headingLevels, 6)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if !hasMain {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "No <main> landmark — AI agents use landmarks to identify primary content",
			Fix:      "Wrap the primary page content in a <main> element",
		})
	}

	if !hasNav {
		findings = append(findings, Finding{
			Severity: SeverityInfo,
			URL:      page.URL,
			Message:  "No <nav> landmark — AI agents use navigation landmarks to understand site structure",
			Fix:      "Wrap navigation links in a <nav> element",
		})
	}

	if !hasH1 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "No <h1> element — AI agents use the primary heading to understand page topic",
			Fix:      "Add a single <h1> element describing the page's main topic",
		})
	} else if h1Count > 1 {
		findings = append(findings, Finding{
			Severity: SeverityInfo,
			URL:      page.URL,
			Message:  fmt.Sprintf("Multiple <h1> elements (%d) — AI agents expect a single primary heading", h1Count),
			Fix:      "Use a single <h1> per page; use <h2>-<h6> for subsections",
		})
	}

	// Check for heading hierarchy gaps
	for i := 1; i < len(headingLevels); i++ {
		if headingLevels[i] > headingLevels[i-1]+1 {
			findings = append(findings, Finding{
				Severity: SeverityInfo,
				URL:      page.URL,
				Element:  fmt.Sprintf("<h%d>", headingLevels[i]),
				Message:  fmt.Sprintf("Heading hierarchy gap (h%d to h%d) — AI agents use heading structure to build content outlines", headingLevels[i-1], headingLevels[i]),
				Fix:      "Use sequential heading levels without gaps for a clear document outline",
			})
			break
		}
	}

	return findings
}
