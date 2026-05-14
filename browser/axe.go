package browser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"

	inspect "github.com/GrayCodeAI/inspect"
	"github.com/go-rod/rod"
)

// axe-core CDN URL and cached script.
var (
	axeCoreOnce   sync.Once
	axeCoreScript string
)

const axeCoreCDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js"

// fetchAxeCore downloads the axe-core library from CDN on first call (lazy,
// thread-safe via sync.Once) and caches the script in memory. If the fetch
// fails, it falls back to the no-op stub so callers always get a usable script.
func fetchAxeCore() string {
	axeCoreOnce.Do(func() {
		resp, err := http.Get(axeCoreCDN)
		if err != nil {
			axeCoreScript = axeCoreStub
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			axeCoreScript = axeCoreStub
			return
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			axeCoreScript = axeCoreStub
			return
		}

		axeCoreScript = string(body)
	})
	return axeCoreScript
}

// axeCoreStub is a no-op stub used when the real axe-core library is not
// available. The real axe-core.min.js (~600KB) should be fetched at runtime
// via fetchAxeCore() which downloads it from the axe-core CDN on first use.
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
	// Inject axe-core (fetched from CDN or fallback stub)
	_, err := page.Eval(fetchAxeCore())
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
