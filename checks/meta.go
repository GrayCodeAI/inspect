package checks

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/GrayCodeAI/inspect"
)

// MetaTagsCheck validates HTML meta tags for SEO and accessibility.
type MetaTagsCheck struct{}

func (c *MetaTagsCheck) Name() string { return "meta-tags" }

var (
	titlePattern       = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	metaDescPattern    = regexp.MustCompile(`(?i)<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']`)
	metaViewportPattern = regexp.MustCompile(`(?i)<meta[^>]+name=["']viewport["']`)
	charsetPattern     = regexp.MustCompile(`(?i)<meta[^>]+charset=["']?([^"'\s>]+)`)
	langPattern        = regexp.MustCompile(`(?i)<html[^>]+lang=["']([^"']+)["']`)
)

func (c *MetaTagsCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding
	body := string(resp.Body)

	// Check <title>
	titleMatch := titlePattern.FindStringSubmatch(body)
	if titleMatch == nil {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "title",
			Message:  "Missing <title> tag",
			Fix:      "Add <title>Your Page Title</title> in <head>",
		})
	} else {
		title := strings.TrimSpace(titleMatch[1])
		if len(title) == 0 {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityMedium,
				URL:      resp.URL,
				Element:  "title",
				Message:  "Empty <title> tag",
				Fix:      "Add descriptive text to <title>",
			})
		} else if len(title) > 60 {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityLow,
				URL:      resp.URL,
				Element:  "title",
				Message:  fmt.Sprintf("Title too long (%d chars, recommended max 60)", len(title)),
				Fix:      "Shorten title to under 60 characters for search engine display",
				Evidence: title,
			})
		}
	}

	// Check meta description
	descMatch := metaDescPattern.FindStringSubmatch(body)
	if descMatch == nil {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityLow,
			URL:      resp.URL,
			Element:  "meta description",
			Message:  "Missing meta description",
			Fix:      `Add <meta name="description" content="Your page description here">`,
		})
	} else if len(descMatch[1]) > 160 {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityInfo,
			URL:      resp.URL,
			Element:  "meta description",
			Message:  fmt.Sprintf("Meta description too long (%d chars, recommended max 160)", len(descMatch[1])),
			Fix:      "Shorten meta description to under 160 characters",
		})
	}

	// Check viewport
	if !metaViewportPattern.MatchString(body) {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "viewport",
			Message:  "Missing viewport meta tag (page may not render correctly on mobile)",
			Fix:      `Add <meta name="viewport" content="width=device-width, initial-scale=1">`,
		})
	}

	// Check charset
	if !charsetPattern.MatchString(body) {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityLow,
			URL:      resp.URL,
			Element:  "charset",
			Message:  "Missing charset declaration",
			Fix:      `Add <meta charset="utf-8"> as first element in <head>`,
		})
	}

	// Check lang attribute
	if !langPattern.MatchString(body) {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "html lang",
			Message:  "Missing lang attribute on <html> (accessibility and SEO issue)",
			Fix:      `Add lang attribute: <html lang="en">`,
		})
	}

	return findings
}
