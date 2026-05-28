package crawler

import (
	"net/url"
	"strings"
)

// ResolveURL resolves a reference URL against a base URL and returns the
// absolute form. Returns an empty string for fragment-only, mailto:, or
// javascript: references, or if either URL fails to parse.
func ResolveURL(base, href string) string {
	if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(href, "mailto:") || strings.HasPrefix(href, "javascript:") {
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
