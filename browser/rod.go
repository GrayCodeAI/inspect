// Package browser provides a rod-based BrowserEngine implementation for inspect.
// Import this package to enable browser-rendered page analysis with full
// JavaScript execution, accessibility tree access, and axe-core integration.
//
// Usage:
//
//	engine, err := browser.New()
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer engine.Close()
//
//	report, err := inspect.Scan(ctx, "https://example.com",
//	    inspect.Standard,
//	    inspect.WithBrowser(engine),
//	)
package browser

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	inspect "github.com/GrayCodeAI/inspect"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

// RodEngine implements inspect.BrowserEngine using go-rod/rod.
type RodEngine struct {
	browser *rod.Browser
	mu      sync.Mutex
}

// Compile-time check that RodEngine satisfies inspect.BrowserEngine.
var _ inspect.BrowserEngine = (*RodEngine)(nil)

// New creates a new RodEngine. It uses rod's launcher to auto-download
// Chromium if needed and starts a headless browser.
func New(opts ...Option) (*RodEngine, error) {
	cfg := defaultEngineConfig()
	for _, o := range opts {
		o(cfg)
	}

	l := launcher.New()
	if cfg.headless {
		l = l.Headless(true)
	} else {
		l = l.Headless(false)
	}
	if cfg.browserPath != "" {
		l = l.Bin(cfg.browserPath)
	}
	if cfg.noSandbox {
		l = l.NoSandbox(true)
	}

	url, err := l.Launch()
	if err != nil {
		return nil, fmt.Errorf("browser: failed to launch: %w", err)
	}

	b := rod.New().ControlURL(url)
	if cfg.slowMotion > 0 {
		b = b.SlowMotion(cfg.slowMotion)
	}
	if err := b.Connect(); err != nil {
		return nil, fmt.Errorf("browser: failed to connect: %w", err)
	}

	return &RodEngine{browser: b}, nil
}

// RenderPage navigates to the given URL, waits for content, and extracts
// page data including rendered HTML, accessibility tree, and optional
// axe-core violations and screenshots.
func (e *RodEngine) RenderPage(ctx context.Context, url string, opts inspect.BrowserOpts) (*inspect.PageData, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	start := time.Now()

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	page, err := e.browser.Page(proto.TargetCreateTarget{URL: "about:blank"})
	if err != nil {
		return nil, fmt.Errorf("browser: failed to create page: %w", err)
	}
	defer page.Close()

	page = page.Context(ctx).Timeout(timeout)

	// Set viewport
	if opts.Viewport.Width > 0 && opts.Viewport.Height > 0 {
		_ = page.SetViewport(&proto.EmulationSetDeviceMetricsOverride{
			Width:  opts.Viewport.Width,
			Height: opts.Viewport.Height,
			Mobile: opts.Viewport.Mobile,
		})
	}

	// Set user agent
	if opts.UserAgent != "" {
		_ = page.SetUserAgent(&proto.NetworkSetUserAgentOverride{
			UserAgent: opts.UserAgent,
		})
	}

	// Collect console errors
	var consoleMu sync.Mutex
	var consoleErrors []string
	go page.EachEvent(func(e *proto.RuntimeConsoleAPICalled) {
		if e.Type == proto.RuntimeConsoleAPICalledTypeError {
			consoleMu.Lock()
			for _, arg := range e.Args {
				if s, err := json.Marshal(arg.Value); err == nil {
					consoleErrors = append(consoleErrors, string(s))
				}
			}
			consoleMu.Unlock()
		}
	})()

	// Navigate
	err = page.Navigate(url)
	if err != nil {
		return nil, fmt.Errorf("browser: navigation failed: %w", err)
	}

	// Wait for page load
	err = page.WaitLoad()
	if err != nil {
		return nil, fmt.Errorf("browser: wait load failed: %w", err)
	}

	// Wait for specific selector if requested
	if opts.WaitFor != "" {
		_, err = page.Element(opts.WaitFor)
		// Ignore error — element may not exist
		_ = err
	}

	// Wait for network idle
	_ = page.WaitIdle(2 * time.Second)

	// Get final URL
	info, err := page.Info()
	if err != nil {
		return nil, fmt.Errorf("browser: failed to get page info: %w", err)
	}

	// Get title
	title := info.Title

	// Get rendered HTML
	html, err := page.HTML()
	if err != nil {
		return nil, fmt.Errorf("browser: failed to get HTML: %w", err)
	}

	data := &inspect.PageData{
		FinalURL:     info.URL,
		Title:        title,
		RenderedHTML: html,
		LoadTime:     time.Since(start),
	}

	// Get accessibility tree
	axTree, err := getAccessibilityTree(page)
	if err == nil {
		data.AccessTree = axTree
	}

	// Inject axe-core if requested
	if opts.InjectAxe {
		violations, err := injectAndRunAxe(page)
		if err == nil {
			data.AxeViolations = violations
		}
	}

	// Screenshot if requested
	if opts.Screenshot {
		screenshot, err := page.Screenshot(true, nil)
		if err == nil {
			data.Screenshot = screenshot
		}
	}

	// Collect console errors
	consoleMu.Lock()
	data.ConsoleErrors = consoleErrors
	consoleMu.Unlock()

	return data, nil
}

// Close shuts down the browser.
func (e *RodEngine) Close() error {
	if e.browser != nil {
		return e.browser.Close()
	}
	return nil
}

// getAccessibilityTree fetches the full accessibility tree from the browser
// using the CDP Accessibility.getFullAXTree method.
func getAccessibilityTree(page *rod.Page) ([]inspect.AXNode, error) {
	result, err := proto.AccessibilityGetFullAXTree{}.Call(page)
	if err != nil {
		return nil, fmt.Errorf("browser: failed to get accessibility tree: %w", err)
	}

	nodes := make([]inspect.AXNode, 0, len(result.Nodes))
	for _, n := range result.Nodes {
		node := inspect.AXNode{
			Ignored:    n.Ignored,
			Properties: make(map[string]string),
		}
		if n.Role != nil {
			node.Role = n.Role.Value.String()
		}
		if n.Name != nil {
			node.Name = n.Name.Value.String()
		}
		if n.Description != nil {
			node.Description = n.Description.Value.String()
		}
		if n.Value != nil {
			node.Value = n.Value.Value.String()
		}
		for _, p := range n.Properties {
			node.Properties[string(p.Name)] = p.Value.Value.String()
		}
		nodes = append(nodes, node)
	}

	return nodes, nil
}
