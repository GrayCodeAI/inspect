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
	depth                   int
	checks                  []string
	exclude                 []string
	concurrency             int
	timeout                 time.Duration
	pageTimeout             time.Duration
	rateLimit               int
	authHeader              string
	authValue               string
	failOn                  Severity
	userAgent               string
	followRedirects         int
	respectRobots           bool
	logger                  *slog.Logger
	cookieJar               http.CookieJar
	acceptedStatusCodes     []int
	browser                 BrowserEngine
	blockPrivateIPs         bool
	maxPages                int
	customChecks            []Checker
	customRules             []RuleCheck
	circuitBreakerOn        bool
	circuitBreakerThreshold int
	circuitBreakerCooldown  time.Duration
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
		blockPrivateIPs: true,
		maxPages:        10000,
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

// Standard performs a balanced crawl with the six default checks enabled.
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

// WithAcceptedStatusCodes sets the HTTP status codes considered acceptable by the link checker.
// By default (when no codes are specified), status codes 200-399 are accepted.
func WithAcceptedStatusCodes(codes ...int) Option {
	return optFunc(func(c *config) { c.acceptedStatusCodes = codes })
}

// WithBrowser sets a BrowserEngine for browser-rendered page analysis.
// When set, the scanner uses the engine to render pages with full JavaScript
// execution instead of relying solely on raw HTTP fetches for HTML analysis.
// The browser sub-module (github.com/GrayCodeAI/inspect/browser) provides
// a rod-based implementation.
func WithBrowser(engine BrowserEngine) Option {
	return optFunc(func(c *config) { c.browser = engine })
}

// WithBlockPrivateIPs enables SSRF protection that blocks requests to private IP ranges.
// Enabled by default to prevent SSRF attacks. Call WithAllowPrivateIPs() to disable
// when intentionally scanning internal infrastructure.
func WithBlockPrivateIPs() Option {
	return optFunc(func(c *config) { c.blockPrivateIPs = true })
}

// WithAllowPrivateIPs disables SSRF protection for private IP ranges.
// Use this only when intentionally scanning internal infrastructure.
func WithAllowPrivateIPs() Option {
	return optFunc(func(c *config) { c.blockPrivateIPs = false })
}

// WithMaxPages sets the maximum number of pages to crawl. Defaults to 10000.
// Set to 0 for no limit.
func WithMaxPages(n int) Option {
	return optFunc(func(c *config) { c.maxPages = n })
}

// WithCustomChecks registers custom checks that run alongside built-in checks.
// Unlike the global RegisterCheck, these are scoped to the Scanner instance.
func WithCustomChecks(checks ...Checker) Option {
	return optFunc(func(c *config) { c.customChecks = append(c.customChecks, checks...) })
}

// WithCustomRules registers declarative rule-based checks scoped to this Scanner.
// Unlike the global RegisterRule, these are scoped to the Scanner instance.
func WithCustomRules(rules ...RuleCheck) Option {
	return optFunc(func(c *config) { c.customRules = append(c.customRules, rules...) })
}

// WithCircuitBreaker enables a per-host circuit breaker that stops sending
// requests to a host after threshold consecutive failures. The breaker
// half-opens after cooldown to allow a single probe request.
// Pass enabled=false to explicitly disable even if previously enabled.
func WithCircuitBreaker(enabled bool, threshold int, cooldown time.Duration) Option {
	return optFunc(func(c *config) {
		c.circuitBreakerOn = enabled
		if threshold > 0 {
			c.circuitBreakerThreshold = threshold
		}
		if cooldown > 0 {
			c.circuitBreakerCooldown = cooldown
		}
	})
}
