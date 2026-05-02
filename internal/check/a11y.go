package check

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// A11yCheck detects accessibility violations: missing alt text, ARIA issues,
// heading hierarchy problems, and missing landmarks.
type A11yCheck struct{}

func (a *A11yCheck) Name() string { return "a11y" }

func (a *A11yCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		findings = append(findings, a.checkPage(page)...)
	}

	return findings
}

func (a *A11yCheck) checkPage(page *crawler.Page) []Finding {
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var findings []Finding
	var headingLevels []int
	hasMain := false
	hasLang := false
	hasTitle := false

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "img":
				if !hasAttr(n, "alt") {
					src := getAttr(n, "src")
					findings = append(findings, Finding{
						Severity: SeverityHigh,
						URL:      page.URL,
						Element:  fmt.Sprintf(`<img src="%s">`, truncateStr(src, 60)),
						Message:  "Image missing alt attribute",
						Fix:      "Add descriptive alt text or alt=\"\" for decorative images",
					})
				}
			case "a":
				text := extractNodeText(n)
				if strings.TrimSpace(text) == "" && !hasAttr(n, "aria-label") && !hasAttr(n, "aria-labelledby") {
					href := getAttr(n, "href")
					if href != "" && href != "#" {
						findings = append(findings, Finding{
							Severity: SeverityMedium,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<a href="%s">`, truncateStr(href, 60)),
							Message:  "Link has no accessible text",
							Fix:      "Add visible text, aria-label, or aria-labelledby to the link",
						})
					}
				}
			case "h1", "h2", "h3", "h4", "h5", "h6":
				level := int(n.Data[1] - '0')
				headingLevels = append(headingLevels, level)
			case "main":
				hasMain = true
			case "html":
				if hasAttr(n, "lang") {
					hasLang = true
				}
			case "title":
				if n.FirstChild != nil && strings.TrimSpace(n.FirstChild.Data) != "" {
					hasTitle = true
				}
			case "input", "textarea", "select":
				if !hasLabel(n, doc) && !hasAttr(n, "aria-label") && !hasAttr(n, "aria-labelledby") {
					inputType := getAttr(n, "type")
					if inputType != "hidden" && inputType != "submit" && inputType != "button" {
						name := getAttr(n, "name")
						findings = append(findings, Finding{
							Severity: SeverityMedium,
							URL:      page.URL,
							Element:  fmt.Sprintf(`<input name="%s">`, name),
							Message:  "Form input has no associated label",
							Fix:      "Add a <label for=\"...\"> or aria-label attribute",
						})
					}
				}
			case "button":
				text := extractNodeText(n)
				if strings.TrimSpace(text) == "" && !hasAttr(n, "aria-label") {
					findings = append(findings, Finding{
						Severity: SeverityMedium,
						URL:      page.URL,
						Element:  "<button>",
						Message:  "Button has no accessible text",
						Fix:      "Add visible text or aria-label to the button",
					})
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if !hasLang {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Element:  "<html>",
			Message:  "Page missing lang attribute on <html> element",
			Fix:      `Add lang attribute: <html lang="en">`,
		})
	}

	if !hasTitle {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Element:  "<head>",
			Message:  "Page missing <title> element",
			Fix:      "Add a descriptive <title> element in <head>",
		})
	}

	if !hasMain {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Page missing <main> landmark",
			Fix:      "Wrap primary content in a <main> element",
		})
	}

	for i := 1; i < len(headingLevels); i++ {
		if headingLevels[i] > headingLevels[i-1]+1 {
			findings = append(findings, Finding{
				Severity: SeverityMedium,
				URL:      page.URL,
				Element:  fmt.Sprintf("<h%d>", headingLevels[i]),
				Message:  fmt.Sprintf("Heading level skipped: h%d to h%d", headingLevels[i-1], headingLevels[i]),
				Fix:      "Use sequential heading levels without skipping (h1 → h2 → h3)",
			})
			break
		}
	}

	return findings
}

func hasAttr(n *html.Node, key string) bool {
	for _, attr := range n.Attr {
		if attr.Key == key && attr.Val != "" {
			return true
		}
	}
	return false
}

func getAttr(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func hasLabel(input *html.Node, doc *html.Node) bool {
	id := getAttr(input, "id")
	if id == "" {
		return false
	}
	found := false
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found {
			return
		}
		if n.Type == html.ElementNode && n.Data == "label" {
			if getAttr(n, "for") == id {
				found = true
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return found
}

func extractNodeText(n *html.Node) string {
	var buf strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			buf.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return buf.String()
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
