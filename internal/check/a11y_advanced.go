package check

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// A11yAdvancedCheck implements WCAG 2.1/2.2 rules beyond basics:
// ARIA validation, focus management, landmark completeness, color contrast hints.
type A11yAdvancedCheck struct{}

func init() {
	// Register as part of "a11y" — the A11yCheck handles basics, this extends it.
}

// validARIARoles per WAI-ARIA 1.2 spec (subset of most common roles).
var validARIARoles = map[string]bool{
	"alert": true, "alertdialog": true, "application": true, "article": true,
	"banner": true, "button": true, "cell": true, "checkbox": true,
	"columnheader": true, "combobox": true, "complementary": true,
	"contentinfo": true, "definition": true, "dialog": true, "directory": true,
	"document": true, "feed": true, "figure": true, "form": true, "grid": true,
	"gridcell": true, "group": true, "heading": true, "img": true, "link": true,
	"list": true, "listbox": true, "listitem": true, "log": true, "main": true,
	"marquee": true, "math": true, "menu": true, "menubar": true,
	"menuitem": true, "menuitemcheckbox": true, "menuitemradio": true,
	"navigation": true, "none": true, "note": true, "option": true,
	"presentation": true, "progressbar": true, "radio": true, "radiogroup": true,
	"region": true, "row": true, "rowgroup": true, "rowheader": true,
	"scrollbar": true, "search": true, "searchbox": true, "separator": true,
	"slider": true, "spinbutton": true, "status": true, "switch": true,
	"tab": true, "table": true, "tablist": true, "tabpanel": true,
	"term": true, "textbox": true, "timer": true, "toolbar": true,
	"tooltip": true, "tree": true, "treegrid": true, "treeitem": true,
}

// rolesRequiringName per ARIA spec — these roles MUST have an accessible name.
var rolesRequiringName = map[string]bool{
	"button": true, "link": true, "heading": true, "img": true,
	"checkbox": true, "radio": true, "textbox": true, "combobox": true,
	"tab": true, "dialog": true, "alertdialog": true, "progressbar": true,
}

func checkARIA(page *crawler.Page) []Finding {
	if len(page.Body) == 0 {
		return nil
	}
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var findings []Finding
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			role := getAttr(n, "role")
			if role != "" {
				// Validate role value
				roles := strings.Split(role, " ")
				for _, r := range roles {
					r = strings.TrimSpace(r)
					if r != "" && !validARIARoles[r] {
						findings = append(findings, Finding{
							Severity: SeverityMedium,
							URL:      page.URL,
							Element:  fmt.Sprintf("<%s role=%q>", n.Data, role),
							Message:  fmt.Sprintf("Invalid ARIA role: %q", r),
							Fix:      "Use a valid WAI-ARIA role from the specification",
						})
					}
				}

				// Check if role requires accessible name
				if rolesRequiringName[role] {
					if !hasAccessibleName(n) {
						findings = append(findings, Finding{
							Severity: SeverityHigh,
							URL:      page.URL,
							Element:  fmt.Sprintf("<%s role=%q>", n.Data, role),
							Message:  fmt.Sprintf("Element with role=%q has no accessible name", role),
							Fix:      "Add aria-label, aria-labelledby, or visible text content",
						})
					}
				}
			}

			// Check for tabindex abuse
			tabindex := getAttr(n, "tabindex")
			if tabindex != "" {
				val, err := strconv.Atoi(tabindex)
				if err == nil && val > 0 {
					findings = append(findings, Finding{
						Severity: SeverityMedium,
						URL:      page.URL,
						Element:  fmt.Sprintf("<%s tabindex=%q>", n.Data, tabindex),
						Message:  "Positive tabindex creates unexpected tab order",
						Fix:      "Use tabindex=\"0\" for focusable or tabindex=\"-1\" for programmatic focus only",
					})
				}
			}

			// Check interactive elements are keyboard accessible
			if isInteractive(n) && tabindex == "-1" {
				findings = append(findings, Finding{
					Severity: SeverityHigh,
					URL:      page.URL,
					Element:  fmt.Sprintf("<%s tabindex=\"-1\">", n.Data),
					Message:  "Interactive element removed from tab order",
					Fix:      "Remove tabindex=\"-1\" or provide alternative keyboard access",
				})
			}

			// Check for aria-hidden on focusable elements
			if getAttr(n, "aria-hidden") == "true" && isFocusable(n) {
				findings = append(findings, Finding{
					Severity: SeverityHigh,
					URL:      page.URL,
					Element:  fmt.Sprintf("<%s aria-hidden=\"true\">", n.Data),
					Message:  "Focusable element is aria-hidden — creates keyboard trap",
					Fix:      "Remove aria-hidden or add tabindex=\"-1\" to prevent focus",
				})
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return findings
}

func checkLandmarks(page *crawler.Page) []Finding {
	if len(page.Body) == 0 {
		return nil
	}
	doc, err := html.Parse(bytes.NewReader(page.Body))
	if err != nil {
		return nil
	}

	var findings []Finding
	landmarks := map[string]int{
		"nav": 0, "header": 0, "footer": 0, "main": 0, "aside": 0,
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if _, ok := landmarks[n.Data]; ok {
				landmarks[n.Data]++
			}
			role := getAttr(n, "role")
			switch role {
			case "navigation":
				landmarks["nav"]++
			case "banner":
				landmarks["header"]++
			case "contentinfo":
				landmarks["footer"]++
			case "main":
				landmarks["main"]++
			case "complementary":
				landmarks["aside"]++
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if landmarks["nav"] == 0 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Page missing <nav> landmark for navigation",
			Fix:      "Wrap navigation links in a <nav> element",
		})
	}
	if landmarks["header"] == 0 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Page missing <header> landmark",
			Fix:      "Add a <header> element for the page banner",
		})
	}
	if landmarks["footer"] == 0 {
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  "Page missing <footer> landmark",
			Fix:      "Add a <footer> element for page contentinfo",
		})
	}
	if landmarks["main"] > 1 {
		findings = append(findings, Finding{
			Severity: SeverityMedium,
			URL:      page.URL,
			Message:  fmt.Sprintf("Page has %d <main> landmarks (should be exactly 1)", landmarks["main"]),
			Fix:      "Ensure only one <main> element exists per page",
		})
	}
	if landmarks["nav"] > 1 {
		// Multiple navs are fine but should be labelled
		findings = append(findings, Finding{
			Severity: SeverityLow,
			URL:      page.URL,
			Message:  fmt.Sprintf("Page has %d navigation landmarks — ensure each has a unique label", landmarks["nav"]),
			Fix:      "Add aria-label to distinguish multiple <nav> elements",
		})
	}

	return findings
}

func hasAccessibleName(n *html.Node) bool {
	if hasAttr(n, "aria-label") || hasAttr(n, "aria-labelledby") || hasAttr(n, "title") {
		return true
	}
	text := extractNodeText(n)
	return strings.TrimSpace(text) != ""
}

func isInteractive(n *html.Node) bool {
	interactive := map[string]bool{
		"a": true, "button": true, "input": true, "select": true,
		"textarea": true, "details": true, "summary": true,
	}
	return interactive[n.Data]
}

func isFocusable(n *html.Node) bool {
	if isInteractive(n) {
		return true
	}
	tabindex := getAttr(n, "tabindex")
	if tabindex != "" && tabindex != "-1" {
		return true
	}
	return false
}

// RunAdvancedA11y runs the advanced accessibility checks on a set of pages.
// This is called by the A11yCheck.Run as an extension.
func RunAdvancedA11y(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding
	for _, page := range pages {
		if page.Error != nil || len(page.Body) == 0 {
			continue
		}
		findings = append(findings, checkARIA(page)...)
		findings = append(findings, checkLandmarks(page)...)
	}
	return findings
}
