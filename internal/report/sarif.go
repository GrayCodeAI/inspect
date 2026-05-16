// SARIF 2.1.0 output for inspect, emitted via the shared
// github.com/GrayCodeAI/hawk/sarif package.

package report

import (
	"fmt"
	"net/url"

	"github.com/GrayCodeAI/hawk/sarif"
)

// ToolVersion is the inspect tool version reported in SARIF output. It is set
// at startup by the parent inspect package from the canonical VERSION file at
// the repo root. The default fallback "dev" only applies when this package is
// used directly without the parent package being initialised.
var ToolVersion = "dev"

// SetToolVersion lets the parent inspect package wire its canonical Version
// into this internal package without creating an import cycle.
func SetToolVersion(v string) { ToolVersion = v }

// FormatSARIF renders findings as SARIF 2.1.0 JSON.
//
// Output is delegated to the shared sarif.Builder so sight and inspect
// produce structurally identical SARIF.
func FormatSARIF(data ReportData) (string, error) {
	b := sarif.New(sarif.Tool{
		Name:           "inspect",
		Version:        ToolVersion,
		InformationURI: "https://github.com/GrayCodeAI/inspect",
	})

	for _, f := range data.Findings {
		ruleID := fmt.Sprintf("inspect/%s", f.Check)

		b.AddRule(sarif.Rule{
			ID:               ruleID,
			Name:             f.Check,
			ShortDescription: fmt.Sprintf("Inspect %s check", f.Check),
			Severity:         severityToSARIF(f.Severity),
		})

		// Build the message with optional evidence + fix appended.
		msg := f.Message
		if f.Evidence != "" {
			msg += " [evidence: " + f.Evidence + "]"
		}
		if f.Fix != "" {
			msg += " [fix: " + f.Fix + "]"
		}

		result := sarif.Result{
			RuleID:   ruleID,
			Severity: severityToSARIF(f.Severity),
			Message:  msg,
		}
		if f.URL != "" {
			result.URI = normalizeURI(f.URL)
			// Element is presented as a region hint; SARIF needs at least
			// startLine to render a region, so we emit a placeholder line 1
			// when Element is set (keeps prior behaviour).
			if f.Element != "" {
				result.Region = &sarif.Region{StartLine: 1, StartColumn: 1}
			}
		}
		if f.Fix != "" {
			result.Fix = f.Fix
		}
		b.AddResult(result)
	}

	return b.String(), nil
}

// severityToSARIF maps the inspect Severity enum to sarif.Severity.
func severityToSARIF(sev Severity) sarif.Severity {
	switch sev {
	case SeverityCritical, SeverityHigh:
		return sarif.SeverityError
	case SeverityMedium:
		return sarif.SeverityWarning
	case SeverityLow:
		return sarif.SeverityNote
	default:
		return sarif.SeverityNone
	}
}

// normalizeURI ensures the URI is valid for SARIF output.
func normalizeURI(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	return parsed.String()
}
