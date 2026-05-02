// Package check implements the check registry and individual site audit checks.
package check

import (
	"context"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// Severity mirrors the public Severity type for internal use.
type Severity int

const (
	SeverityInfo Severity = iota
	SeverityLow
	SeverityMedium
	SeverityHigh
	SeverityCritical
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
	return r
}

// Register adds a check to the registry.
func (r *Registry) Register(c Checker) {
	r.checks[c.Name()] = c
}

// Filter returns only the checks whose names appear in the enabled list.
func (r *Registry) Filter(enabled []string) []Checker {
	if len(enabled) == 0 {
		return r.All()
	}
	enabledSet := make(map[string]bool)
	for _, name := range enabled {
		enabledSet[name] = true
	}
	var result []Checker
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
