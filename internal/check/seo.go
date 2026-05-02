package check

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// SEOCheck detects SEO issues: missing meta tags, duplicate titles,
// missing canonical URLs, and robots directives.
type SEOCheck struct{}

func (s *SEOCheck) Name() string { return "seo" }

func (s *SEOCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding
	titles := make(map[string][]string)

	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		pageMeta := s.extractMeta(page)
		findings = append(findings, s.checkPage(page, pageMeta)...)

		if pageMeta.title != "" {
			titles[pageMeta.title] = append(titles[pageMeta.title], page.URL)
		}
	}

	for title, urls := range titles {
		if len(urls) > 1 {
			findings = append(findings, Finding{
				Severity: SeverityMedium,
				URL:      urls[0],
				Message:  fmt.Sprintf("Duplicate title found on %d pages: %q", len(urls), truncateStr(title, 50)),
				Fix:      "Use unique, descriptive titles for each page",
			})
		}
	}

	return findings
}

type pageMeta struct {
	title       string
	description string
	canonical   string
	ogTitle     string
	ogDesc      string
	ogImage     string
	robots      string
	viewport    string
	charset     bool
}

func (s *SEOCheck) extractMeta(page *crawler.Page) pageMeta {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return pageMeta{}
	}

	meta := pageMeta{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "title":
				if n.FirstChild != nil {
					meta.title = strings.TrimSpace(n.FirstChild.Data)
				}
			case "meta":
				name := strings.ToLower(getAttr(n, "name"))
				property := strings.ToLower(getAttr(n, "property"))
				content := getAttr(n, "content")
				charset := getAttr(n, "charset")

				if charset != "" {
					meta.charset = true
				}
				switch name {
				case "description":
					meta.description = content
				case "robots":
					meta.robots = content
				case "viewport":
					meta.viewport = content
				}
				switch property {
				case "og:title":
					meta.ogTitle = content
				case "og:description":
					meta.ogDesc = content
				case "og:image":
					meta.ogImage = content
				}
			case "link":
				if getAttr(n, "rel") == "canonical" {
					meta.canonical = getAttr(n, "href")
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return meta
}

func (s *SEOCheck) checkPage(page *crawler.Page, meta pageMeta) []Finding {
	var findings []Finding

	if meta.title == "" {
		findings = append(findings, Finding{
			Severity: SeverityHigh,
			URL:      page.URL,
			Element:  "<title>",
			Message:  "Page missing <title> tag",
			Fix:      "Add a descriptive, unique <title> tag (50-60 characters)",
		})
	} else if len(meta.title) > 60 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Element:  "<title>",
			Message:  fmt.Sprintf("Title too long: %d characters (recommended: 50-60)", len(meta.title)),
			Fix:      "Shorten title to 50-60 characters for optimal display in search results",
		})
	}

	if meta.description == "" {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Element:  `<meta name="description">`,
			Message:  "Missing meta description",
			Fix:      "Add a meta description (120-160 characters) summarizing the page",
		})
	} else if len(meta.description) > 160 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Element:  `<meta name="description">`,
			Message:  fmt.Sprintf("Meta description too long: %d characters (recommended: 120-160)", len(meta.description)),
			Fix:      "Shorten description to 120-160 characters",
		})
	}

	if meta.canonical == "" {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Element:  `<link rel="canonical">`,
			Message:  "Missing canonical URL",
			Fix:      `Add <link rel="canonical" href="..."> to specify the preferred URL`,
		})
	}

	if meta.viewport == "" {
		findings = append(findings, Finding{
			Severity: SeverityHigh,
			URL:      page.URL,
			Element:  `<meta name="viewport">`,
			Message:  "Missing viewport meta tag",
			Fix:      `Add <meta name="viewport" content="width=device-width, initial-scale=1">`,
		})
	}

	if !meta.charset {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Element:  `<meta charset>`,
			Message:  "Missing charset declaration",
			Fix:      `Add <meta charset="UTF-8"> as the first element in <head>`,
		})
	}

	if meta.ogTitle == "" || meta.ogDesc == "" {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Missing Open Graph tags (og:title or og:description)",
			Fix:      "Add Open Graph meta tags for better social media sharing",
		})
	}

	return findings
}
