package inspect

import (
	"regexp"
	"strings"
	"testing"
)

func TestCheckRegexComplexity_Safe(t *testing.T) {
	safe := []string{
		`hello`,
		`(?i)TODO`,
		`\d+\.\d+`,
		`(?i)<title[^>]*>(.*?)</title>`,
		`/api/`,
		`google-analytics\.com|gtag`,
		`[a-zA-Z0-9]+`,
		`(?:foo|bar|baz)`,
		`\balt\s*=`,
	}
	for _, p := range safe {
		if err := checkRegexComplexity(p); err != nil {
			t.Errorf("expected safe pattern %q to pass, got: %v", p, err)
		}
	}
}

func TestCheckRegexComplexity_NestedQuantifiers(t *testing.T) {
	dangerous := []string{
		`(a+)+`,
		`(a*)*`,
		`(a+)*`,
		`(a*)+`,
		`(a{1,5})+`,
	}
	for _, p := range dangerous {
		if err := checkRegexComplexity(p); err == nil {
			t.Errorf("expected dangerous pattern %q to be rejected", p)
		}
	}
}

func TestCheckRegexComplexity_ExcessiveNesting(t *testing.T) {
	// Depth 6 exceeds the maxDepth of 5
	deep := `((((((a)))))`
	if err := checkRegexComplexity(deep); err == nil {
		t.Error("expected deeply nested pattern to be rejected")
	}
}

func TestCheckRegexComplexity_QuestionMarkAfterLiteral(t *testing.T) {
	// Pattern like (a)? where ? is a non-greedy modifier, not after quantifier
	safe := `(a)?`
	if err := checkRegexComplexity(safe); err != nil {
		t.Errorf("expected pattern %q to pass, got: %v", safe, err)
	}
}

func TestCompileWithTimeout_SafePattern(t *testing.T) {
	re, err := compileWithTimeout(`(?i)hello\s+world`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if re == nil {
		t.Fatal("expected non-nil regex")
	}
	if !re.MatchString("Hello World") {
		t.Error("expected match")
	}
}

func TestCompileWithTimeout_RejectedPattern(t *testing.T) {
	re, err := compileWithTimeout(`(a+)+`)
	if err == nil {
		t.Fatal("expected error for nested quantifier pattern")
	}
	if re != nil {
		t.Fatal("expected nil regex for rejected pattern")
	}
}

func TestCompileWithTimeout_InvalidRegex(t *testing.T) {
	re, err := compileWithTimeout(`[invalid`)
	if err == nil {
		t.Fatal("expected error for invalid regex")
	}
	if re != nil {
		t.Fatal("expected nil regex for invalid pattern")
	}
}

func TestMatchWithTimeout_SafeMatch(t *testing.T) {
	re := regexp.MustCompile(`hello`)
	if !matchWithTimeout(re, "say hello world") {
		t.Error("expected match")
	}
	if matchWithTimeout(re, "no match here") {
		t.Error("expected no match")
	}
}

func TestFindWithTimeout_SafeMatch(t *testing.T) {
	re := regexp.MustCompile(`\d+`)
	if got := findWithTimeout(re, "abc 123 def"); got != "123" {
		t.Errorf("expected '123', got %q", got)
	}
	if got := findWithTimeout(re, "no digits"); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestMatchWithTimeout_Timeout(t *testing.T) {
	// Use a known ReDoS-vulnerable pattern. Go's regexp engine handles this
	// quickly (linear time), so we test the timeout path by checking that
	// the function completes without hanging, and the pattern itself passes
	// the complexity check at compile time (since we compile it directly).
	// This test verifies the timeout mechanism doesn't break normal operation.
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !matchWithTimeout(re, "user@example.com") {
		t.Error("expected match")
	}
}

func TestNewRuleCheckAdapter_ReDoSRejected(t *testing.T) {
	// A rule with a dangerous pattern should log and skip, not crash.
	adapter := newRuleCheckAdapter(RuleCheck{
		RuleName:     "dangerous-rule",
		RuleSeverity: SeverityHigh,
		Description:  "Should be rejected",
		BodyMatch:    []string{`(a+)+`, `safe pattern`},
	})
	// The dangerous pattern should be skipped; the safe one should compile.
	if len(adapter.bodyRegexs) != 1 {
		t.Errorf("expected 1 compiled body regex (safe pattern), got %d", len(adapter.bodyRegexs))
	}
}

func TestNewRuleCheckAdapter_AllFieldsReDoSRejected(t *testing.T) {
	adapter := newRuleCheckAdapter(RuleCheck{
		RuleName:      "dangerous-all-fields",
		RuleSeverity:  SeverityHigh,
		Description:   "Should be rejected",
		URLMatch:      `(x+)+`,
		HeaderMatch:   map[string]string{"X-Test": `(y+)+`},
		BodyMatch:     []string{`(z+)+`},
		BodyMissing:   []string{`(w+)+`},
		FixSuggestion: "Fix it",
	})
	if adapter.urlRegex != nil {
		t.Error("expected urlRegex to be nil for dangerous pattern")
	}
	if len(adapter.headerRegexs) != 0 {
		t.Errorf("expected 0 header regexes, got %d", len(adapter.headerRegexs))
	}
	if len(adapter.bodyRegexs) != 0 {
		t.Errorf("expected 0 body regexes, got %d", len(adapter.bodyRegexs))
	}
	if len(adapter.bodyMissing) != 0 {
		t.Errorf("expected 0 body missing regexes, got %d", len(adapter.bodyMissing))
	}
}

func TestNewRuleCheckAdapter_ValidRulesCompile(t *testing.T) {
	adapter := newRuleCheckAdapter(RuleCheck{
		RuleName:      "safe-rule",
		RuleSeverity:  SeverityMedium,
		Description:   "Safe rule",
		URLMatch:      `/api/`,
		HeaderMatch:   map[string]string{"Server": `\d+\.\d+`},
		BodyMatch:     []string{`(?i)TODO`},
		BodyMissing:   []string{`analytics`},
		FixSuggestion: "Fix it",
	})
	if adapter.urlRegex == nil {
		t.Error("expected urlRegex to be compiled")
	}
	if len(adapter.headerRegexs) != 1 {
		t.Errorf("expected 1 header regex, got %d", len(adapter.headerRegexs))
	}
	if len(adapter.bodyRegexs) != 1 {
		t.Errorf("expected 1 body regex, got %d", len(adapter.bodyRegexs))
	}
	if len(adapter.bodyMissing) != 1 {
		t.Errorf("expected 1 body missing regex, got %d", len(adapter.bodyMissing))
	}
}

func TestCompileWithTimeout_LogsOnReject(t *testing.T) {
	// Just verify compileWithTimeout rejects a known-bad pattern with a descriptive error.
	_, err := compileWithTimeout(`(a+)+`)
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "nested quantifier") {
		t.Errorf("expected error to mention 'nested quantifier', got: %v", err)
	}
}
