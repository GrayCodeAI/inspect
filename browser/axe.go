package browser

import (
	"encoding/json"
	"fmt"

	inspect "github.com/GrayCodeAI/inspect"
	"github.com/go-rod/rod"
)

// axeCoreStub is a minimal stub of axe-core for development/testing.
// In production, replace this with the full minified axe-core library.
const axeCoreStub = `
window.axe = window.axe || {
  run: function(context, options) {
    return new Promise(function(resolve) {
      resolve({
        violations: [],
        passes: [],
        incomplete: [],
        inapplicable: []
      });
    });
  }
};
`

// axeResult mirrors the JSON structure returned by axe.run().
type axeResult struct {
	Violations []axeRuleResult `json:"violations"`
}

type axeRuleResult struct {
	ID          string        `json:"id"`
	Impact      string        `json:"impact"`
	Description string        `json:"description"`
	Help        string        `json:"help"`
	HelpURL     string        `json:"helpUrl"`
	Nodes       []axeNodeJSON `json:"nodes"`
}

type axeNodeJSON struct {
	HTML           string   `json:"html"`
	Target         []string `json:"target"`
	FailureSummary string   `json:"failureSummary"`
}

// injectAndRunAxe injects the axe-core script into the page and runs it.
// Returns parsed AxeViolation results.
func injectAndRunAxe(page *rod.Page) ([]inspect.AxeViolation, error) {
	// Inject axe-core
	_, err := page.Eval(axeCoreStub)
	if err != nil {
		return nil, fmt.Errorf("browser: failed to inject axe-core: %w", err)
	}

	// Run axe and get results
	result, err := page.Eval(`() => {
		return axe.run(document, {
			runOnly: {
				type: 'tag',
				values: ['wcag2a', 'wcag2aa', 'best-practice']
			}
		});
	}`)
	if err != nil {
		return nil, fmt.Errorf("browser: failed to run axe: %w", err)
	}

	raw, err := json.Marshal(result.Value)
	if err != nil {
		return nil, fmt.Errorf("browser: failed to marshal axe results: %w", err)
	}

	var parsed axeResult
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("browser: failed to parse axe results: %w", err)
	}

	return convertAxeViolations(parsed.Violations), nil
}

func convertAxeViolations(rules []axeRuleResult) []inspect.AxeViolation {
	violations := make([]inspect.AxeViolation, len(rules))
	for i, r := range rules {
		nodes := make([]inspect.AxeNode, len(r.Nodes))
		for j, n := range r.Nodes {
			nodes[j] = inspect.AxeNode{
				HTML:           n.HTML,
				Target:         n.Target,
				FailureSummary: n.FailureSummary,
			}
		}
		violations[i] = inspect.AxeViolation{
			ID:          r.ID,
			Impact:      r.Impact,
			Description: r.Description,
			Help:        r.Help,
			HelpURL:     r.HelpURL,
			Nodes:       nodes,
		}
	}
	return violations
}
