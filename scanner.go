package inspect

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/GrayCodeAI/inspect/internal/check"
	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// Scanner is a reusable site auditor. Create one with NewScanner and call
// Scan multiple times. It is safe for concurrent use.
type Scanner struct {
	cfg *config
	mu  sync.Mutex
}

// NewScanner creates a configured Scanner. Apply presets and options:
//
//	s := inspect.NewScanner(inspect.Standard, inspect.WithDepth(3))
func NewScanner(opts ...Option) *Scanner {
	return &Scanner{cfg: buildConfig(opts)}
}

// Scan crawls the target URL and runs all configured checks against the
// discovered pages. Returns a complete Report with findings and stats.
func (s *Scanner) Scan(ctx context.Context, target string) (*Report, error) {
	if s.cfg.timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.cfg.timeout)
		defer cancel()
	}

	start := time.Now()

	crawlCfg := crawler.Config{
		MaxDepth:        s.cfg.depth,
		Concurrency:     s.cfg.concurrency,
		Timeout:         s.cfg.timeout,
		PageTimeout:     s.cfg.pageTimeout,
		RateLimit:       s.cfg.rateLimit,
		UserAgent:       s.cfg.userAgent,
		FollowRedirects: s.cfg.followRedirects,
		RespectRobots:   s.cfg.respectRobots,
		Exclude:         s.cfg.exclude,
		AuthHeader:      s.cfg.authHeader,
		AuthValue:       s.cfg.authValue,
		CookieJar:       s.cfg.cookieJar,
	}

	if s.cfg.logger != nil {
		s.cfg.logger.Info("inspect: starting crawl", "target", target, "depth", s.cfg.depth)
	}

	c := crawler.New(crawlCfg)
	pages, err := c.Crawl(ctx, target)
	if err != nil {
		return nil, fmt.Errorf("inspect: crawl failed: %w", err)
	}

	if s.cfg.logger != nil {
		s.cfg.logger.Info("inspect: crawl complete", "pages", len(pages))
	}

	registry := check.DefaultRegistry()
	enabledChecks := registry.Filter(s.cfg.checks)

	var (
		mu          sync.Mutex
		allFindings []Finding
		durations   = make(map[string]time.Duration)
	)

	var wg sync.WaitGroup
	for _, chk := range enabledChecks {
		wg.Add(1)
		go func(chk check.Checker) {
			defer wg.Done()
			checkStart := time.Now()
			findings := chk.Run(ctx, pages)
			elapsed := time.Since(checkStart)

			converted := make([]Finding, len(findings))
			for i, f := range findings {
				converted[i] = Finding{
					Check:    chk.Name(),
					Severity: Severity(f.Severity),
					URL:      f.URL,
					Element:  f.Element,
					Message:  f.Message,
					Fix:      f.Fix,
					Evidence: f.Evidence,
				}
			}

			mu.Lock()
			allFindings = append(allFindings, converted...)
			durations[chk.Name()] = elapsed
			mu.Unlock()
		}(chk)
	}
	wg.Wait()

	sort.Slice(allFindings, func(i, j int) bool {
		if allFindings[i].Severity != allFindings[j].Severity {
			return allFindings[i].Severity > allFindings[j].Severity
		}
		return allFindings[i].URL < allFindings[j].URL
	})

	bySev := make(map[Severity]int)
	byCheck := make(map[string]int)
	for _, f := range allFindings {
		bySev[f.Severity]++
		byCheck[f.Check]++
	}

	report := &Report{
		Target:      target,
		Findings:    allFindings,
		CrawledURLs: len(pages),
		Duration:    time.Since(start),
		FailOn:      s.cfg.failOn,
		Stats: Stats{
			PagesScanned:     len(pages),
			FindingsTotal:    len(allFindings),
			BySeverity:       bySev,
			ByCheck:          byCheck,
			DurationPerCheck: durations,
		},
	}

	return report, nil
}

// ScanDir scans a local directory by starting a temporary file server.
// Useful for auditing build output before deployment.
func (s *Scanner) ScanDir(ctx context.Context, dir string) (*Report, error) {
	srv, addr, err := crawler.ServeDir(ctx, dir)
	if err != nil {
		return nil, err
	}
	defer srv.Close()
	return s.Scan(ctx, "http://"+addr)
}
