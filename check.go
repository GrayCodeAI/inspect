package inspect

import (
	"context"
	"regexp"
	"strings"
	"sync"

	"github.com/GrayCodeAI/inspect/internal/check"
	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// Checker is the public interface for custom checks. Implement this to add
// your own audit logic and register it with RegisterCheck.
type Checker interface {
	Name() string
	Run(ctx context.Context, pages []*Page) []Finding
}

// Page is the public representation of a crawled page, exposed to custom checks.
type Page struct {
	URL        string
	StatusCode int
	Headers    map[string]string
	Body       []byte
	Links      []PageLink
	Depth      int
	ParentURL  string
}

// PageLink represents a link found on a page.
type PageLink struct {
	Href     string
	Text     string
	External bool
}

// RuleCheck defines a declarative check via patterns — no Go code required.
// This is the equivalent of Nuclei templates but for site auditing.
type RuleCheck struct {
	RuleName     string
	RuleSeverity Severity
	Description  string
	// Match conditions (any match triggers a finding)
	HeaderMatch   map[string]string // header name → regex pattern (match = issue)
	HeaderMissing []string          // headers that MUST be present
	BodyMatch     []string          // regex patterns in body (match = issue)
	BodyMissing   []string          // regex patterns that MUST be present
	URLMatch      string            // only apply to URLs matching this regex
	StatusCodes   []int             // only apply to these status codes (empty = all)
	FixSuggestion string
}

var (
	customChecks   []Checker
	customRules    []RuleCheck
	customChecksMu sync.RWMutex
)

// RegisterCheck registers a custom check that will run alongside built-in checks.
// Call this before Scan() to include custom logic.
func RegisterCheck(c Checker) {
	customChecksMu.Lock()
	customChecks = append(customChecks, c)
	customChecksMu.Unlock()
}

// RegisterRule registers a declarative rule-based check.
// Rules are simpler than full Checker implementations — just pattern matching.
func RegisterRule(rule RuleCheck) {
	customChecksMu.Lock()
	customRules = append(customRules, rule)
	customChecksMu.Unlock()
}

// ClearCustomChecks removes all registered custom checks and rules.
// Useful in tests.
func ClearCustomChecks() {
	customChecksMu.Lock()
	customChecks = nil
	customRules = nil
	customChecksMu.Unlock()
}

// ruleCheckAdapter adapts a RuleCheck into the internal check.Checker interface.
// Regexes are pre-compiled at construction time for performance.
type ruleCheckAdapter struct {
	rule         RuleCheck
	urlRegex     *regexp.Regexp
	headerRegexs map[string]*regexp.Regexp
	bodyRegexs   []*regexp.Regexp
	bodyMissing  []*regexp.Regexp
}

func newRuleCheckAdapter(rule RuleCheck) *ruleCheckAdapter {
	a := &ruleCheckAdapter{rule: rule}
	if rule.URLMatch != "" {
		a.urlRegex, _ = regexp.Compile(rule.URLMatch)
	}
	a.headerRegexs = make(map[string]*regexp.Regexp, len(rule.HeaderMatch))
	for header, pattern := range rule.HeaderMatch {
		if re, err := regexp.Compile(pattern); err == nil {
			a.headerRegexs[header] = re
		}
	}
	for _, pattern := range rule.BodyMatch {
		if re, err := regexp.Compile(pattern); err == nil {
			a.bodyRegexs = append(a.bodyRegexs, re)
		}
	}
	for _, pattern := range rule.BodyMissing {
		if re, err := regexp.Compile(pattern); err == nil {
			a.bodyMissing = append(a.bodyMissing, re)
		}
	}
	return a
}

func (r *ruleCheckAdapter) Name() string { return r.rule.RuleName }

func (r *ruleCheckAdapter) Run(ctx context.Context, pages []*crawler.Page) []check.Finding {
	var findings []check.Finding

	for _, page := range pages {
		if page.Error != nil {
			continue
		}
		if len(r.rule.StatusCodes) > 0 && !intIn(page.StatusCode, r.rule.StatusCodes) {
			continue
		}
		if r.urlRegex != nil && !r.urlRegex.MatchString(page.URL) {
			continue
		}

		// Header missing checks
		for _, h := range r.rule.HeaderMissing {
			if page.Headers.Get(h) == "" {
				findings = append(findings, check.Finding{
					Severity: check.Severity(r.rule.RuleSeverity),
					URL:      page.URL,
					Message:  r.rule.Description + ": missing header " + h,
					Fix:      r.rule.FixSuggestion,
				})
			}
		}

		// Header match checks (regex match = bad)
		for header, re := range r.headerRegexs {
			val := page.Headers.Get(header)
			if val == "" {
				continue
			}
			if re.MatchString(val) {
				findings = append(findings, check.Finding{
					Severity: check.Severity(r.rule.RuleSeverity),
					URL:      page.URL,
					Message:  r.rule.Description,
					Evidence: header + ": " + val,
					Fix:      r.rule.FixSuggestion,
				})
			}
		}

		body := string(page.Body)

		// Body match checks (regex match = bad)
		for _, re := range r.bodyRegexs {
			if loc := re.FindString(body); loc != "" {
				findings = append(findings, check.Finding{
					Severity: check.Severity(r.rule.RuleSeverity),
					URL:      page.URL,
					Message:  r.rule.Description,
					Evidence: truncateEvidence(loc, 100),
					Fix:      r.rule.FixSuggestion,
				})
				break
			}
		}

		// Body missing checks (pattern should be present but isn't)
		for _, re := range r.bodyMissing {
			if !re.MatchString(body) {
				findings = append(findings, check.Finding{
					Severity: check.Severity(r.rule.RuleSeverity),
					URL:      page.URL,
					Message:  r.rule.Description + ": expected pattern not found",
					Fix:      r.rule.FixSuggestion,
				})
			}
		}
	}

	return findings
}

// customCheckAdapter wraps a public Checker for internal use.
type customCheckAdapter struct {
	checker Checker
}

func (a *customCheckAdapter) Name() string { return a.checker.Name() }

func (a *customCheckAdapter) Run(ctx context.Context, pages []*crawler.Page) []check.Finding {
	publicPages := make([]*Page, len(pages))
	for i, p := range pages {
		headers := make(map[string]string)
		for k := range p.Headers {
			headers[k] = p.Headers.Get(k)
		}
		links := make([]PageLink, len(p.Links))
		for j, l := range p.Links {
			links[j] = PageLink{Href: l.Href, Text: l.Text, External: l.External}
		}
		publicPages[i] = &Page{
			URL:        p.URL,
			StatusCode: p.StatusCode,
			Headers:    headers,
			Body:       p.Body,
			Links:      links,
			Depth:      p.Depth,
			ParentURL:  p.ParentURL,
		}
	}

	findings := a.checker.Run(ctx, publicPages)
	internal := make([]check.Finding, len(findings))
	for i, f := range findings {
		internal[i] = check.Finding{
			Severity: check.Severity(f.Severity),
			URL:      f.URL,
			Element:  f.Element,
			Message:  f.Message,
			Fix:      f.Fix,
			Evidence: f.Evidence,
		}
	}
	return internal
}

func getCustomInternalChecks() []check.Checker {
	customChecksMu.RLock()
	defer customChecksMu.RUnlock()

	var result []check.Checker
	for _, c := range customChecks {
		result = append(result, &customCheckAdapter{checker: c})
	}
	for _, r := range customRules {
		result = append(result, newRuleCheckAdapter(r))
	}
	return result
}

func intIn(n int, list []int) bool {
	for _, x := range list {
		if n == x {
			return true
		}
	}
	return false
}

func truncateEvidence(s string, max int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
