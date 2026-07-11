package inspect

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/GrayCodeAI/inspect/internal/check"
	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// Regex timeout constants for ReDoS protection.
const (
	regexCompileTimeout = 1 * time.Second
	regexMatchTimeout   = 100 * time.Millisecond
)

// checkRegexComplexity rejects patterns likely to cause ReDoS. Returns an error
// if the pattern contains nested quantifiers (e.g. (a+)+, (a*)*) or excessive
// group nesting.
func checkRegexComplexity(pattern string) error {
	const maxDepth = 5

	type groupInfo struct {
		hasQuantifier bool
	}
	var groupStack []groupInfo
	inQuantifierAfterGroup := false

	for i := 0; i < len(pattern); i++ {
		ch := pattern[i]
		switch ch {
		case '(':
			if len(groupStack) >= maxDepth {
				return fmt.Errorf("regex group nesting depth exceeds maximum %d", maxDepth)
			}
			groupStack = append(groupStack, groupInfo{})
			inQuantifierAfterGroup = false
		case ')':
			if len(groupStack) == 0 {
				inQuantifierAfterGroup = false
				continue
			}
			g := groupStack[len(groupStack)-1]
			groupStack = groupStack[:len(groupStack)-1]
			// After closing a group, mark that a quantifier after this ')'
			// would be a nested quantifier if the group itself contained one.
			inQuantifierAfterGroup = g.hasQuantifier
		case '*', '+':
			// These are quantifiers.
			if len(groupStack) > 0 {
				groupStack[len(groupStack)-1].hasQuantifier = true
			}
			if inQuantifierAfterGroup {
				return fmt.Errorf("nested quantifier detected near position %d: quantifier after group containing a quantifier (pattern may cause ReDoS)", i)
			}
		case '?':
			// '?' after '(' or '|' is a group modifier, not a quantifier.
			// '?' after another quantifier (e.g. '+?') is a non-greedy modifier.
			if i > 0 {
				prev := pattern[i-1]
				if prev != '(' && prev != '|' && prev != '*' && prev != '+' && prev != '?' {
					// This '?' is a quantifier (0-or-1).
					if len(groupStack) > 0 {
						groupStack[len(groupStack)-1].hasQuantifier = true
					}
					if inQuantifierAfterGroup {
						return fmt.Errorf("nested quantifier detected near position %d: quantifier after group containing a quantifier (pattern may cause ReDoS)", i)
					}
				}
			}
			inQuantifierAfterGroup = false
		case '{':
			// '{' starts a counted repetition like {n}, {n,}, {n,m}.
			// This is a quantifier.
			if len(groupStack) > 0 {
				groupStack[len(groupStack)-1].hasQuantifier = true
			}
			if inQuantifierAfterGroup {
				return fmt.Errorf("nested quantifier detected near position %d: quantifier after group containing a quantifier (pattern may cause ReDoS)", i)
			}
		default:
			inQuantifierAfterGroup = false
		}
	}
	return nil
}

// compileWithTimeout compiles a regex pattern with a timeout to protect against
// pathological compilation times. Returns nil and an error if the pattern is
// rejected by the complexity check or if compilation times out.
func compileWithTimeout(pattern string) (*regexp.Regexp, error) {
	if err := checkRegexComplexity(pattern); err != nil {
		return nil, err
	}

	type result struct {
		re  *regexp.Regexp
		err error
	}
	done := make(chan result, 1)
	go func() {
		re, err := regexp.Compile(pattern)
		done <- result{re, err}
	}()

	select {
	case res := <-done:
		return res.re, res.err
	case <-time.After(regexCompileTimeout):
		return nil, fmt.Errorf("regex compilation timed out after %s", regexCompileTimeout)
	}
}

// matchWithTimeout runs re.MatchString(s) with a timeout. Returns false if
// the match does not complete in time, protecting against ReDoS at runtime.
func matchWithTimeout(re *regexp.Regexp, s string) bool {
	type result struct {
		matched bool
	}
	done := make(chan result, 1)
	go func() {
		done <- result{matched: re.MatchString(s)}
	}()

	select {
	case res := <-done:
		return res.matched
	case <-time.After(regexMatchTimeout):
		slog.Warn("regex match timed out, skipping", "pattern", re.String(), "timeout", regexMatchTimeout)
		return false
	}
}

// findWithTimeout runs re.FindString(s) with a timeout. Returns "" if
// the match does not complete in time.
func findWithTimeout(re *regexp.Regexp, s string) string {
	type result struct {
		match string
	}
	done := make(chan result, 1)
	go func() {
		done <- result{match: re.FindString(s)}
	}()

	select {
	case res := <-done:
		return res.match
	case <-time.After(regexMatchTimeout):
		slog.Warn("regex find timed out, skipping", "pattern", re.String(), "timeout", regexMatchTimeout)
		return ""
	}
}

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
		re, err := compileWithTimeout(rule.URLMatch)
		if err != nil {
			slog.Error("rule regex compilation failed (ReDoS protection)", "rule", rule.RuleName, "field", "URLMatch", "pattern", rule.URLMatch, "error", err)
		}
		a.urlRegex = re
	}
	a.headerRegexs = make(map[string]*regexp.Regexp, len(rule.HeaderMatch))
	for header, pattern := range rule.HeaderMatch {
		re, err := compileWithTimeout(pattern)
		if err != nil {
			slog.Error("rule regex compilation failed (ReDoS protection)", "rule", rule.RuleName, "field", "HeaderMatch", "header", header, "pattern", pattern, "error", err)
			continue
		}
		a.headerRegexs[header] = re
	}
	for _, pattern := range rule.BodyMatch {
		re, err := compileWithTimeout(pattern)
		if err != nil {
			slog.Error("rule regex compilation failed (ReDoS protection)", "rule", rule.RuleName, "field", "BodyMatch", "pattern", pattern, "error", err)
			continue
		}
		a.bodyRegexs = append(a.bodyRegexs, re)
	}
	for _, pattern := range rule.BodyMissing {
		re, err := compileWithTimeout(pattern)
		if err != nil {
			slog.Error("rule regex compilation failed (ReDoS protection)", "rule", rule.RuleName, "field", "BodyMissing", "pattern", pattern, "error", err)
			continue
		}
		a.bodyMissing = append(a.bodyMissing, re)
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
		if r.urlRegex != nil && !matchWithTimeout(r.urlRegex, page.URL) {
			continue
		}

		// Header missing checks
		for _, h := range r.rule.HeaderMissing {
			if page.Headers.Get(h) == "" {
				findings = append(findings, check.Finding{
					Severity: r.rule.RuleSeverity,
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
			if matchWithTimeout(re, val) {
				findings = append(findings, check.Finding{
					Severity: r.rule.RuleSeverity,
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
			if loc := findWithTimeout(re, body); loc != "" {
				findings = append(findings, check.Finding{
					Severity: r.rule.RuleSeverity,
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
			if !matchWithTimeout(re, body) {
				findings = append(findings, check.Finding{
					Severity: r.rule.RuleSeverity,
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
			Severity: f.Severity,
			URL:      f.URL,
			Element:  f.Element,
			Message:  f.Message,
			Fix:      f.Fix,
			Evidence: f.Evidence,
		}
	}
	return internal
}

// getCustomInternalChecks converts public Checker and RuleCheck slices into
// internal check.Checker adapters. This accepts explicit slices so that
// per-Scanner custom checks can be passed in without relying on global state.
func getCustomInternalChecks(checks []Checker, rules []RuleCheck) []check.Checker {
	var result []check.Checker
	for _, c := range checks {
		result = append(result, &customCheckAdapter{checker: c})
	}
	for _, r := range rules {
		result = append(result, newRuleCheckAdapter(r))
	}
	return result
}

// getGlobalCustomInternalChecks returns checks registered via the global
// RegisterCheck/RegisterRule functions. Kept for backward compatibility.
func getGlobalCustomInternalChecks() []check.Checker {
	customChecksMu.RLock()
	defer customChecksMu.RUnlock()
	return getCustomInternalChecks(customChecks, customRules)
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
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "..."
}
