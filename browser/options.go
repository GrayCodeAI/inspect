package browser

import "time"

// Option configures a RodEngine.
type Option func(*engineConfig)

type engineConfig struct {
	headless    bool
	browserPath string
	noSandbox   bool
	slowMotion  time.Duration
}

func defaultEngineConfig() *engineConfig {
	return &engineConfig{
		headless: true,
	}
}

// WithHeadless sets whether the browser runs in headless mode.
// Default is true.
func WithHeadless(headless bool) Option {
	return func(c *engineConfig) {
		c.headless = headless
	}
}

// WithBrowserPath sets a custom path to the Chrome/Chromium binary.
// If empty, rod's launcher will auto-download Chromium.
func WithBrowserPath(path string) Option {
	return func(c *engineConfig) {
		c.browserPath = path
	}
}

// WithNoSandbox disables the Chrome sandbox. This is required in some
// CI environments (e.g., running as root in Docker).
func WithNoSandbox(noSandbox bool) Option {
	return func(c *engineConfig) {
		c.noSandbox = noSandbox
	}
}

// WithSlowMotion adds a delay between each rod action. Useful for debugging
// browser interactions visually when headless is disabled.
func WithSlowMotion(d time.Duration) Option {
	return func(c *engineConfig) {
		c.slowMotion = d
	}
}
