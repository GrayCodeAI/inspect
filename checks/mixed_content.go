package checks

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/GrayCodeAI/inspect"
)

// MixedContentCheck detects http:// resources loaded on https:// pages.
type MixedContentCheck struct{}

func (c *MixedContentCheck) Name() string { return "mixed-content" }

var httpResourcePattern = regexp.MustCompile(`(?i)(src|href|action)=["'](http://[^"']+)["']`)

func (c *MixedContentCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding

	if !strings.HasPrefix(resp.URL, "https://") {
		return findings
	}

	body := string(resp.Body)
	matches := httpResourcePattern.FindAllStringSubmatch(body, -1)

	seen := make(map[string]bool)
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		attr := match[1]
		url := match[2]

		if seen[url] {
			continue
		}
		seen[url] = true

		severity := inspect.SeverityMedium
		blockable := isBlockableMixedContent(attr, url)
		if blockable {
			severity = inspect.SeverityHigh
		}

		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: severity,
			URL:      resp.URL,
			Element:  fmt.Sprintf("%s=%q", attr, url),
			Message:  fmt.Sprintf("Mixed content: %s resource loaded over HTTP on HTTPS page", attr),
			Fix:      "Change to https:// or use protocol-relative URL, or add Content-Security-Policy: upgrade-insecure-requests",
			Evidence: url,
		})
	}

	return findings
}

func isBlockableMixedContent(attr, url string) bool {
	lowerAttr := strings.ToLower(attr)
	if lowerAttr == "src" {
		lowerURL := strings.ToLower(url)
		for _, ext := range []string{".js", ".css", ".woff", ".ttf"} {
			if strings.Contains(lowerURL, ext) {
				return true
			}
		}
	}
	if lowerAttr == "action" {
		return true
	}
	return false
}
