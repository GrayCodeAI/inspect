// Package check implements the check registry and individual site audit checks.
package check

import (
	"context"

	"github.com/GrayCodeAI/hawk-core-contracts/types"
	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// Severity mirrors the public Severity type for internal use.
type Severity = types.Severity

const (
	SeverityInfo     Severity = types.SeverityInfo
	SeverityLow      Severity = types.SeverityLow
	SeverityMedium   Severity = types.SeverityMedium
	SeverityHigh     Severity = types.SeverityHigh
	SeverityCritical Severity = types.SeverityCritical
)

// Finding is an internal finding produced by a check.
type Finding struct {
	Severity Severity
	URL      string
	Element  string
	Message  string
	Fix      string
	Evidence string
}

// Checker is the interface that all checks implement.
type Checker interface {
	Name() string
	Run(ctx context.Context, pages []*crawler.Page) []Finding
}

// Registry holds all registered checks.
type Registry struct {
	checks map[string]Checker
}

// DefaultRegistry returns a registry with all built-in checks.
func DefaultRegistry() *Registry {
	r := &Registry{checks: make(map[string]Checker)}
	r.Register(&LinksCheck{})
	r.Register(&SecurityCheck{})
	r.Register(&FormsCheck{})
	r.Register(&A11yCheck{})
	r.Register(&PerfCheck{})
	r.Register(&SEOCheck{})
	r.Register(&SRICheck{})
	r.Register(&AIReadyCheck{})
	r.Register(&ReachabilityCheck{})
	return r
}

// Register adds a check to the registry.
func (r *Registry) Register(c Checker) {
	r.checks[c.Name()] = c
}

// Truncate truncates s to at most max UTF-8 code points, appending "..." if
// the string was longer than max. It is safe for multi-byte characters.
func Truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max]) + "..."
}

// truncate is a package-level alias for internal use.
func truncate(s string, max int) string { return Truncate(s, max) }

// Filter returns only the checks whose names appear in the enabled list.
func (r *Registry) Filter(enabled []string) []Checker {
	if len(enabled) == 0 {
		return r.All()
	}
	enabledSet := make(map[string]bool)
	for _, name := range enabled {
		enabledSet[name] = true
	}
	result := make([]Checker, 0, len(r.checks))
	for name, chk := range r.checks {
		if enabledSet[name] {
			result = append(result, chk)
		}
	}
	return result
}

// All returns every registered check.
func (r *Registry) All() []Checker {
	result := make([]Checker, 0, len(r.checks))
	for _, chk := range r.checks {
		result = append(result, chk)
	}
	return result
}
