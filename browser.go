package inspect

import (
	"context"
	"time"
)

// BrowserEngine is the interface for optional browser-based page analysis.
// The core inspect package never imports rod — consumers provide an implementation
// via the inspect/browser sub-module.
type BrowserEngine interface {
	RenderPage(ctx context.Context, url string, opts BrowserOpts) (*PageData, error)
	Close() error
}

// BrowserOpts configures a single browser page render.
type BrowserOpts struct {
	Viewport   Viewport
	WaitFor    string        // CSS selector to wait for before analysis
	Timeout    time.Duration
	InjectAxe  bool   // inject axe-core and return accessibility violations
	Screenshot bool   // capture full-page screenshot
	UserAgent  string
}

// Viewport specifies the browser viewport dimensions.
type Viewport struct {
	Width  int
	Height int
	Mobile bool
}

// PageData holds results from browser-rendered page analysis.
type PageData struct {
	FinalURL      string
	Title         string
	RenderedHTML  string
	AccessTree    []AXNode
	AxeViolations []AxeViolation
	ConsoleErrors []string
	NetworkLog    []NetworkEntry
	Screenshot    []byte
	LoadTime      time.Duration
}

// AXNode represents a node in the computed accessibility tree.
type AXNode struct {
	Role        string
	Name        string
	Description string
	Value       string
	Properties  map[string]string
	Children    []AXNode
	Ignored     bool
}

// AxeViolation represents an axe-core accessibility violation.
type AxeViolation struct {
	ID          string    // rule ID (e.g., "color-contrast")
	Impact      string    // "critical", "serious", "moderate", "minor"
	Description string
	Help        string
	HelpURL     string
	Nodes       []AxeNode
}

// AxeNode represents a specific DOM element that violates a rule.
type AxeNode struct {
	HTML           string
	Target         []string // CSS selectors
	FailureSummary string
}

// NetworkEntry represents a network request made during page load.
type NetworkEntry struct {
	URL        string
	Method     string
	Status     int
	MimeType   string
	Size       int64
	Duration   time.Duration
	Failed     bool
	FailReason string
}
