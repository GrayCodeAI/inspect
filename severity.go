package inspect

import "github.com/GrayCodeAI/hawk-core-contracts/types"

// Severity represents the impact level of a finding.
// Aliased from shared types for cross-module compatibility.
type Severity = types.Severity

// Severity constants re-exported for convenience.
const (
	SeverityInfo     Severity = types.SeverityInfo
	SeverityLow      Severity = types.SeverityLow
	SeverityMedium   Severity = types.SeverityMedium
	SeverityHigh     Severity = types.SeverityHigh
	SeverityCritical Severity = types.SeverityCritical
)

// ParseSeverity converts a string to a Severity.
var ParseSeverity = types.ParseSeverity
