package report

import (
	"encoding/json"
	"fmt"
	"net/url"
)

// SARIF 2.1.0 output format for static analysis tool integration.
// See: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

const sarifSchema = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json"
const sarifVersion = "2.1.0"
const inspectVersion = "0.2.0"

// SARIF top-level types

type sarifLog struct {
	Schema  string     `json:"$schema"`
	Version string     `json:"version"`
	Runs    []sarifRun `json:"runs"`
}

type sarifRun struct {
	Tool    sarifTool     `json:"tool"`
	Results []sarifResult `json:"results"`
}

type sarifTool struct {
	Driver sarifDriver `json:"driver"`
}

type sarifDriver struct {
	Name           string      `json:"name"`
	Version        string      `json:"version"`
	InformationURI string      `json:"informationUri"`
	Rules          []sarifRule `json:"rules"`
}

type sarifRule struct {
	ID               string             `json:"id"`
	Name             string             `json:"name"`
	ShortDescription sarifMessage       `json:"shortDescription"`
	DefaultConfig    sarifDefaultConfig `json:"defaultConfiguration"`
	HelpURI          string             `json:"helpUri,omitempty"`
}

type sarifDefaultConfig struct {
	Level string `json:"level"`
}

type sarifMessage struct {
	Text string `json:"text"`
}

type sarifResult struct {
	RuleID    string          `json:"ruleId"`
	Level     string          `json:"level"`
	Message   sarifMessage    `json:"message"`
	Locations []sarifLocation `json:"locations,omitempty"`
}

type sarifLocation struct {
	PhysicalLocation sarifPhysicalLocation `json:"physicalLocation"`
}

type sarifPhysicalLocation struct {
	ArtifactLocation sarifArtifactLocation `json:"artifactLocation"`
	Region           *sarifRegion          `json:"region,omitempty"`
}

type sarifArtifactLocation struct {
	URI string `json:"uri"`
}

type sarifRegion struct {
	StartLine   int `json:"startLine,omitempty"`
	StartColumn int `json:"startColumn,omitempty"`
}

// FormatSARIF renders findings as SARIF 2.1.0 JSON.
func FormatSARIF(data ReportData) (string, error) {
	// Build rules from unique checks
	ruleMap := make(map[string]int)
	var rules []sarifRule

	for _, f := range data.Findings {
		if _, exists := ruleMap[f.Check]; !exists {
			ruleMap[f.Check] = len(rules)
			rules = append(rules, sarifRule{
				ID:   fmt.Sprintf("inspect/%s", f.Check),
				Name: f.Check,
				ShortDescription: sarifMessage{
					Text: fmt.Sprintf("Inspect %s check", f.Check),
				},
				DefaultConfig: sarifDefaultConfig{
					Level: severityToSARIFLevel(f.Severity),
				},
			})
		}
	}

	// Build results
	var results []sarifResult
	for _, f := range data.Findings {
		msg := f.Message
		if f.Evidence != "" {
			msg += " [evidence: " + f.Evidence + "]"
		}
		if f.Fix != "" {
			msg += " [fix: " + f.Fix + "]"
		}

		result := sarifResult{
			RuleID:  fmt.Sprintf("inspect/%s", f.Check),
			Level:   severityToSARIFLevel(f.Severity),
			Message: sarifMessage{Text: msg},
		}

		// Use the URL as the artifact location
		if f.URL != "" {
			loc := sarifLocation{
				PhysicalLocation: sarifPhysicalLocation{
					ArtifactLocation: sarifArtifactLocation{
						URI: normalizeURI(f.URL),
					},
				},
			}
			// If element info is available, add a region hint (line 1 as placeholder)
			if f.Element != "" {
				loc.PhysicalLocation.Region = &sarifRegion{
					StartLine:   1,
					StartColumn: 1,
				}
			}
			result.Locations = []sarifLocation{loc}
		}

		results = append(results, result)
	}

	log := sarifLog{
		Schema:  sarifSchema,
		Version: sarifVersion,
		Runs: []sarifRun{{
			Tool: sarifTool{
				Driver: sarifDriver{
					Name:           "inspect",
					Version:        inspectVersion,
					InformationURI: "https://github.com/GrayCodeAI/inspect",
					Rules:          rules,
				},
			},
			Results: results,
		}},
	}

	out, err := json.MarshalIndent(log, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// severityToSARIFLevel converts internal severity to SARIF level.
// SARIF levels: "none", "note", "warning", "error"
func severityToSARIFLevel(sev Severity) string {
	switch sev {
	case SeverityCritical, SeverityHigh:
		return "error"
	case SeverityMedium:
		return "warning"
	case SeverityLow:
		return "note"
	default:
		return "none"
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
