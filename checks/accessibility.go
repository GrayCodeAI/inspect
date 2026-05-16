package checks

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/GrayCodeAI/inspect"
)

// AccessibilityCheck performs basic WCAG 2.2 automated checks.
type AccessibilityCheck struct{}

func (c *AccessibilityCheck) Name() string { return "accessibility" }

var (
	imgTag         = regexp.MustCompile(`(?i)<img\b[^>]*>`)
	imgHasAlt      = regexp.MustCompile(`(?i)\balt\s*=`)
	inputTag       = regexp.MustCompile(`(?i)<input\b[^>]*type=["'](?:text|email|password|tel|number|search|url)["'][^>]*>`)
	inputHasLabel  = regexp.MustCompile(`(?i)\b(?:aria-label|aria-labelledby|title)\s*=`)
	headingPattern = regexp.MustCompile(`(?i)<h([1-6])\b`)
	buttonNoText   = regexp.MustCompile(`(?i)<button\b[^>]*>\s*</button>`)
	linkNoText     = regexp.MustCompile(`(?i)<a\b[^>]*href=[^>]*>\s*</a>`)
)

func (c *AccessibilityCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding
	body := string(resp.Body)

	// Images without alt attribute
	for _, match := range imgTag.FindAllString(body, -1) {
		if imgHasAlt.MatchString(match) {
			continue
		}
		src := extractAttr(match, "src")
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  fmt.Sprintf("img[src=%q]", src),
			Message:  "Image missing alt attribute (WCAG 1.1.1)",
			Fix:      `Add alt text: <img alt="Description of image" src="...">`,
			Evidence: truncate(match, 120),
		})
	}

	// Empty buttons
	for _, match := range buttonNoText.FindAllString(body, -1) {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "button",
			Message:  "Button has no accessible text (WCAG 4.1.2)",
			Fix:      "Add text content or aria-label to button",
			Evidence: truncate(match, 120),
		})
	}

	// Empty links
	for _, match := range linkNoText.FindAllString(body, -1) {
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "a",
			Message:  "Link has no accessible text (WCAG 2.4.4)",
			Fix:      "Add text content or aria-label to link",
			Evidence: truncate(match, 120),
		})
	}

	// Heading hierarchy (check for skipped levels)
	headings := headingPattern.FindAllStringSubmatch(body, -1)
	if len(headings) > 0 {
		prevLevel := 0
		for _, h := range headings {
			level := int(h[1][0] - '0')
			if prevLevel > 0 && level > prevLevel+1 {
				findings = append(findings, inspect.Finding{
					Check:    c.Name(),
					Severity: inspect.SeverityLow,
					URL:      resp.URL,
					Element:  fmt.Sprintf("h%d", level),
					Message:  fmt.Sprintf("Heading level skipped: h%d follows h%d (WCAG 1.3.1)", level, prevLevel),
					Fix:      fmt.Sprintf("Use h%d instead of h%d, or add intermediate heading levels", prevLevel+1, level),
				})
			}
			prevLevel = level
		}

		// Check for missing h1
		firstLevel := int(headings[0][1][0] - '0')
		if firstLevel != 1 {
			hasH1 := false
			for _, h := range headings {
				if h[1] == "1" {
					hasH1 = true
					break
				}
			}
			if !hasH1 {
				findings = append(findings, inspect.Finding{
					Check:    c.Name(),
					Severity: inspect.SeverityMedium,
					URL:      resp.URL,
					Element:  "h1",
					Message:  "Page missing h1 heading (WCAG 1.3.1)",
					Fix:      "Add a single h1 heading that describes the page content",
				})
			}
		}
	}

	// Form inputs without labels
	for _, match := range inputTag.FindAllString(body, -1) {
		if inputHasLabel.MatchString(match) {
			continue
		}
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityMedium,
			URL:      resp.URL,
			Element:  "input",
			Message:  "Form input missing accessible label (WCAG 3.3.2)",
			Fix:      "Add a <label for=\"id\"> element or aria-label attribute",
			Evidence: truncate(match, 120),
		})
	}

	return findings
}

func extractAttr(tag, attr string) string {
	pattern := regexp.MustCompile(fmt.Sprintf(`(?i)%s=["']([^"']*)["']`, attr))
	match := pattern.FindStringSubmatch(tag)
	if len(match) >= 2 {
		return match[1]
	}
	return ""
}

func truncate(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
