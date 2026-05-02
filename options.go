package inspect

import (
	"log/slog"
	"net/http"
	"time"
)

// Option configures a scan operation.
type Option interface {
	apply(*config)
}

type optFunc func(*config)

func (f optFunc) apply(c *config) { f(c) }

type config struct {
	depth           int
	checks          []string
	exclude         []string
	concurrency     int
	timeout         time.Duration
	pageTimeout     time.Duration
	rateLimit       int
	authHeader      string
	authValue       string
	failOn          Severity
	userAgent       string
	followRedirects int
	respectRobots   bool
	logger          *slog.Logger
	cookieJar       http.CookieJar
}

func defaultConfig() *config {
	return &config{
		depth:           5,
		checks:          []string{"links", "security", "forms", "a11y", "perf", "seo"},
		concurrency:     10,
		timeout:         60 * time.Second,
		pageTimeout:     15 * time.Second,
		rateLimit:       20,
		userAgent:       "inspect/1.0",
		followRedirects: 5,
		respectRobots:   true,
		failOn:          SeverityCritical,
	}
}

func buildConfig(opts []Option) *config {
	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	return cfg
}

// Presets

// Quick performs a shallow crawl checking only broken links.
var Quick Option = optFunc(func(c *config) {
	c.depth = 2
	c.checks = []string{"links"}
	c.concurrency = 5
})

// Standard performs a balanced crawl with all checks enabled.
var Standard Option = optFunc(func(c *config) {
	c.depth = 5
	c.checks = []string{"links", "security", "forms", "a11y", "perf", "seo"}
	c.concurrency = 10
})

// Deep performs an exhaustive crawl with no depth limit.
var Deep Option = optFunc(func(c *config) {
	c.depth = 0
	c.checks = []string{"links", "security", "forms", "a11y", "perf", "seo"}
	c.concurrency = 20
})

// Security limits the scan to security-related checks.
var SecurityOnly Option = optFunc(func(c *config) {
	c.checks = []string{"security"}
})

// CI configures for continuous integration: standard checks, fail on high, JSON output.
var CI Option = optFunc(func(c *config) {
	c.depth = 5
	c.checks = []string{"links", "security", "forms", "a11y", "perf", "seo"}
	c.concurrency = 10
	c.failOn = SeverityHigh
})

// Configuration functions

func WithDepth(n int) Option {
	return optFunc(func(c *config) { c.depth = n })
}

func WithChecks(checks ...string) Option {
	return optFunc(func(c *config) { c.checks = checks })
}

func WithExclude(patterns ...string) Option {
	return optFunc(func(c *config) { c.exclude = patterns })
}

func WithConcurrency(n int) Option {
	return optFunc(func(c *config) {
		if n > 0 {
			c.concurrency = n
		}
	})
}

func WithTimeout(d time.Duration) Option {
	return optFunc(func(c *config) { c.timeout = d })
}

func WithRateLimit(reqPerSec int) Option {
	return optFunc(func(c *config) {
		if reqPerSec > 0 {
			c.rateLimit = reqPerSec
		}
	})
}

func WithAuth(header, value string) Option {
	return optFunc(func(c *config) {
		c.authHeader = header
		c.authValue = value
	})
}

func WithFailOn(sev Severity) Option {
	return optFunc(func(c *config) { c.failOn = sev })
}

func WithUserAgent(ua string) Option {
	return optFunc(func(c *config) { c.userAgent = ua })
}

func WithFollowRedirects(max int) Option {
	return optFunc(func(c *config) { c.followRedirects = max })
}

func WithRespectRobots(enabled bool) Option {
	return optFunc(func(c *config) { c.respectRobots = enabled })
}

func WithPageTimeout(d time.Duration) Option {
	return optFunc(func(c *config) { c.pageTimeout = d })
}

func WithLogger(l *slog.Logger) Option {
	return optFunc(func(c *config) { c.logger = l })
}

func WithCookieJar(jar http.CookieJar) Option {
	return optFunc(func(c *config) { c.cookieJar = jar })
}
