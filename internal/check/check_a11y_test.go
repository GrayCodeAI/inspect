package check

import (
	"context"
	"strings"
	"testing"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// This file was split out of check_test.go for readability (mechanical move; no behavior change).

// --- Advanced A11y Tests ---

func TestCheckARIA_InvalidRole(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="banana">Content</div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") && strings.Contains(f.Message, "banana") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity for invalid role, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for invalid ARIA role 'banana'")
	}
}

func TestCheckARIA_ValidRole(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="navigation">Nav content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") {
			t.Errorf("should not flag valid ARIA role: %s", f.Message)
		}
	}
}

func TestCheckARIA_PositiveTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="5">Content</div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for positive tabindex")
	}
}

func TestCheckARIA_ZeroTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="0">Content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			t.Error("tabindex=0 should not be flagged")
		}
	}
}

func TestCheckARIA_NegativeTabindex(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div tabindex="-1">Content</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Positive tabindex") {
			t.Error("tabindex=-1 should not be flagged as positive tabindex")
		}
	}
}

func TestCheckARIA_AriaHiddenOnFocusable(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><a href="/page" aria-hidden="true">Hidden link</a></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for aria-hidden on focusable element")
	}
}

func TestCheckARIA_AriaHiddenOnNonFocusable(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div aria-hidden="true">Decorative icon</div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			t.Error("should not flag aria-hidden on non-focusable element")
		}
	}
}

func TestCheckARIA_InteractiveElementRemovedFromTabOrder(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><button tabindex="-1">Click me</button></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Interactive element removed from tab order") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for interactive element with tabindex=-1")
	}
}

func TestCheckARIA_RoleRequiringNameWithoutName(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="button"></div></body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			found = true
			if f.Severity != SeverityHigh {
				t.Errorf("expected high severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for role=button without accessible name")
	}
}

func TestCheckARIA_RoleRequiringNameWithAriaLabel(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="button" aria-label="Close dialog"></div></body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			t.Error("should not flag element with aria-label")
		}
	}
}

func TestCheckARIA_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	findings := checkARIA(page)
	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestCheckLandmarks_AllPresent(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>Header</header>
			<nav>Nav</nav>
			<main>Content</main>
			<aside>Sidebar</aside>
			<footer>Footer</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "missing") {
			t.Errorf("should not flag missing landmark when all present: %s", f.Message)
		}
	}
}

func TestCheckLandmarks_MissingNav(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><header>H</header><main>Content</main><footer>F</footer></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <nav>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <nav>")
	}
}

func TestCheckLandmarks_MissingHeader(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><nav>N</nav><main>Content</main><footer>F</footer></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <header>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <header>")
	}
}

func TestCheckLandmarks_MissingFooter(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><header>H</header><nav>N</nav><main>Content</main></body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing <footer>") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing <footer>")
	}
}

func TestCheckLandmarks_MultipleMain(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>H</header><nav>N</nav>
			<main>Content 1</main>
			<main>Content 2</main>
			<footer>F</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "has 2 <main> landmarks") {
			found = true
			if f.Severity != SeverityMedium {
				t.Errorf("expected medium severity, got %v", f.Severity)
			}
		}
	}
	if !found {
		t.Error("expected finding for multiple <main> landmarks")
	}
}

func TestCheckLandmarks_MultipleNavs(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<header>H</header>
			<nav>Primary</nav>
			<nav>Secondary</nav>
			<main>Content</main>
			<footer>F</footer>
		</body></html>`)

	findings := checkLandmarks(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "2 navigation landmarks") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding about multiple navigation landmarks")
	}
}

func TestCheckLandmarks_RoleBasedLandmarks(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="banner">Header</div>
			<div role="navigation">Nav</div>
			<div role="main">Content</div>
			<div role="contentinfo">Footer</div>
		</body></html>`)

	findings := checkLandmarks(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "missing <header>") || strings.Contains(f.Message, "missing <nav>") ||
			strings.Contains(f.Message, "missing <footer>") {
			t.Errorf("should not flag missing landmark when role-based equivalent is present: %s", f.Message)
		}
	}
}

func TestCheckLandmarks_EmptyBody(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"}, "")
	findings := checkLandmarks(page)
	if len(findings) != 0 {
		t.Error("should not produce findings for empty body")
	}
}

func TestRunAdvancedA11y(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="invalidrole">Bad</div>
			<div tabindex="10">Bad tabindex</div>
			<button aria-hidden="true">Hidden button</button>
		</body></html>`)

	findings := RunAdvancedA11y(context.Background(), []*crawler.Page{page})

	if len(findings) == 0 {
		t.Fatal("expected multiple a11y findings")
	}

	hasInvalidRole := false
	hasTabindex := false
	hasAriaHidden := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Invalid ARIA role") {
			hasInvalidRole = true
		}
		if strings.Contains(f.Message, "Positive tabindex") {
			hasTabindex = true
		}
		if strings.Contains(f.Message, "aria-hidden") {
			hasAriaHidden = true
		}
	}

	if !hasInvalidRole {
		t.Error("expected invalid ARIA role finding")
	}
	if !hasTabindex {
		t.Error("expected positive tabindex finding")
	}
	if !hasAriaHidden {
		t.Error("expected aria-hidden on focusable finding")
	}
}

func TestRunAdvancedA11y_SkipsErrorPages(t *testing.T) {
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body><div role="banana">Bad</div></body></html>`)
	page.Error = context.Canceled

	findings := RunAdvancedA11y(context.Background(), []*crawler.Page{page})
	if len(findings) != 0 {
		t.Error("should skip error pages")
	}
}

func TestHasAccessibleName(t *testing.T) {
	// This is tested indirectly through checkARIA tests, but let's add a focused test
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div role="button" aria-label="Close">X</div>
			<div role="button" aria-labelledby="btn-label">X</div>
			<div role="button" title="Close button">X</div>
			<div role="button">Click Me</div>
		</body></html>`)

	findings := checkARIA(page)

	for _, f := range findings {
		if strings.Contains(f.Message, "has no accessible name") {
			t.Errorf("all buttons have accessible names, but got: %s", f.Message)
		}
	}
}

func TestIsInteractive(t *testing.T) {
	// Test by checking that interactive elements with tabindex=-1 are flagged
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<input type="text" tabindex="-1">
			<select tabindex="-1"><option>opt</option></select>
			<textarea tabindex="-1"></textarea>
		</body></html>`)

	findings := checkARIA(page)

	interactiveCount := 0
	for _, f := range findings {
		if strings.Contains(f.Message, "Interactive element removed from tab order") {
			interactiveCount++
		}
	}
	if interactiveCount < 3 {
		t.Errorf("expected at least 3 interactive elements flagged, got %d", interactiveCount)
	}
}

func TestIsFocusable(t *testing.T) {
	// Focusable: interactive elements OR elements with tabindex != -1
	// Test: div with tabindex="0" + aria-hidden should be flagged
	page := makePage("https://example.com", 200, map[string]string{"Content-Type": "text/html"},
		`<html><body>
			<div tabindex="0" aria-hidden="true">Focusable but hidden</div>
		</body></html>`)

	findings := checkARIA(page)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Focusable element is aria-hidden") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for aria-hidden on element with tabindex=0 (focusable)")
	}
}
