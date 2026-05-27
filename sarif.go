package inspect

import (
	"encoding/json"
	"fmt"
)

// SARIF 2.1.0 output structures for inspect findings.

type sarifLog struct {
	Version string     `json:"version"`
	Schema  string     `json:"$schema"`
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
	InformationURI string      `json:"informationUri,omitempty"`
	Rules          []sarifRule `json:"rules,omitempty"`
}

type sarifRule struct {
	ID               string              `json:"id"`
	Name             string              `json:"name,omitempty"`
	ShortDescription sarifMessage        `json:"shortDescription"`
	HelpURI          string              `json:"helpUri,omitempty"`
	Relationships    []sarifRelationship `json:"relationships,omitempty"`
}

type sarifRelationship struct {
	Target sarifDescriptorReference `json:"target"`
}

type sarifDescriptorReference struct {
	ID            string                   `json:"id"`
	ToolComponent *sarifComponentReference `json:"toolComponent,omitempty"`
}

type sarifComponentReference struct {
	Name string `json:"name"`
}

type sarifResult struct {
	RuleID    string          `json:"ruleId"`
	Level     string          `json:"level"`
	Message   sarifMessage    `json:"message"`
	Locations []sarifLocation `json:"locations"`
}

type sarifMessage struct {
	Text string `json:"text"`
}

type sarifLocation struct {
	PhysicalLocation *sarifPhysicalLocation `json:"physicalLocation,omitempty"`
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

// GenerateSARIF produces a SARIF 2.1.0 JSON report from scan findings.
func GenerateSARIF(findings []Finding, version string) string {
	if version == "" {
		version = "dev"
	}

	// Build rules from unique check names
	ruleSet := make(map[string]bool)
	var rules []sarifRule
	for _, f := range findings {
		checkID := f.Check
		if checkID == "" {
			checkID = "unknown"
		}
		if ruleSet[checkID] {
			continue
		}
		ruleSet[checkID] = true
		rule := sarifRule{
			ID:               checkID,
			Name:             checkID,
			ShortDescription: sarifMessage{Text: fmt.Sprintf("%s check", checkID)},
		}
		rules = append(rules, rule)
	}

	var results []sarifResult
	for _, f := range findings {
		checkID := f.Check
		if checkID == "" {
			checkID = "unknown"
		}
		level := severityToSARIFLevel(f.Severity)

		msg := f.Message
		if f.Evidence != "" {
			msg += "\n\nEvidence: " + f.Evidence
		}

		result := sarifResult{
			RuleID:  checkID,
			Level:   level,
			Message: sarifMessage{Text: msg},
		}

		if f.URL != "" {
			loc := sarifLocation{
				PhysicalLocation: &sarifPhysicalLocation{
					ArtifactLocation: sarifArtifactLocation{URI: f.URL},
				},
			}
			result.Locations = append(result.Locations, loc)
		}

		results = append(results, result)
	}

	log := sarifLog{
		Version: "2.1.0",
		Schema:  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
		Runs: []sarifRun{{
			Tool: sarifTool{
				Driver: sarifDriver{
					Name:           "inspect",
					Version:        version,
					InformationURI: "https://github.com/GrayCodeAI/inspect",
					Rules:          rules,
				},
			},
			Results: results,
		}},
	}

	data, err := json.MarshalIndent(log, "", "  ")
	if err != nil {
		return fmt.Sprintf(`{"error": "failed to generate SARIF: %s"}`, err.Error())
	}
	return string(data)
}

func severityToSARIFLevel(s Severity) string {
	switch {
	case s >= SeverityCritical:
		return "error"
	case s >= SeverityHigh:
		return "error"
	case s >= SeverityMedium:
		return "warning"
	case s >= SeverityLow:
		return "note"
	default:
		return "none"
	}
}
