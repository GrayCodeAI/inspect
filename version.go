// Package inspect version metadata.
//
// The Version variable is sourced at compile time from the VERSION file at
// the repo root — the single source of truth used by release tooling
// (release-please, goreleaser), CI, and SARIF/JUnit/JSON output drivers.
package inspect

import (
	_ "embed"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/report"
)

//go:embed VERSION
var versionFile string

// Version of the inspect library. Do not edit this variable directly — bump
// the VERSION file at the repo root instead.
var Version = strings.TrimSpace(versionFile)

func init() {
	// Propagate canonical version into the internal/report package so the
	// SARIF tool driver field reflects the real version.
	report.SetToolVersion(Version)
}
