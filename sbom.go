package inspect

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SBOMDocument represents a CycloneDX 1.5 Software Bill of Materials.
type SBOMDocument struct {
	BOMFormat    string          `json:"bomFormat"`
	SpecVersion  string          `json:"specVersion"`
	SerialNumber string          `json:"serialNumber,omitempty"`
	Version      int             `json:"version"`
	Metadata     SBOMMetadata    `json:"metadata"`
	Components   []SBOMComponent `json:"components"`
}

// SBOMMetadata contains metadata about the SBOM.
type SBOMMetadata struct {
	Timestamp string         `json:"timestamp"`
	Tools     []SBOMTool     `json:"tools,omitempty"`
	Component *SBOMComponent `json:"component,omitempty"`
}

// SBOMTool describes the tool that generated the SBOM.
type SBOMTool struct {
	Vendor  string `json:"vendor"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

// SBOMComponent represents a software component/dependency.
type SBOMComponent struct {
	Type    string `json:"type"`
	Name    string `json:"name"`
	Version string `json:"version"`
	PURL    string `json:"purl,omitempty"`
	Scope   string `json:"scope,omitempty"`
}

// GenerateSBOM produces a CycloneDX 1.5 SBOM from project dependency files.
func GenerateSBOM(projectDir string, version string) (*SBOMDocument, error) {
	if version == "" {
		version = "dev"
	}

	doc := &SBOMDocument{
		BOMFormat:   "CycloneDX",
		SpecVersion: "1.5",
		Version:     1,
		Metadata: SBOMMetadata{
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Tools: []SBOMTool{{
				Vendor:  "GrayCodeAI",
				Name:    "inspect",
				Version: version,
			}},
		},
	}

	// Scan for dependency files
	goModPath := filepath.Join(projectDir, "go.mod")
	if _, err := os.Stat(goModPath); err == nil {
		comps := scanGoModForSBOM(goModPath)
		doc.Components = append(doc.Components, comps...)
	}

	pkgJSONPath := filepath.Join(projectDir, "package.json")
	if _, err := os.Stat(pkgJSONPath); err == nil {
		comps := scanPackageJSONForSBOM(pkgJSONPath)
		doc.Components = append(doc.Components, comps...)
	}

	reqPath := filepath.Join(projectDir, "requirements.txt")
	if _, err := os.Stat(reqPath); err == nil {
		comps := scanRequirementsForSBOM(reqPath)
		doc.Components = append(doc.Components, comps...)
	}

	return doc, nil
}

// GenerateSBOMJSON produces a JSON string of the SBOM.
func GenerateSBOMJSON(projectDir string, version string) (string, error) {
	doc, err := GenerateSBOM(projectDir, version)
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return "", fmt.Errorf("inspect: SBOM marshal failed: %w", err)
	}
	return string(data), nil
}

func scanGoModForSBOM(path string) []SBOMComponent {
	var components []SBOMComponent

	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	inRequire := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "require (") || strings.HasPrefix(line, "require(") {
			inRequire = true
			continue
		}
		if line == ")" {
			inRequire = false
			continue
		}
		if strings.HasPrefix(line, "require ") && !strings.Contains(line, "(") {
			line = strings.TrimPrefix(line, "require ")
			if comp := goModLineToComponent(line); comp != nil {
				components = append(components, *comp)
			}
			continue
		}
		if inRequire && line != "" && !strings.HasPrefix(line, "//") {
			if comp := goModLineToComponent(line); comp != nil {
				components = append(components, *comp)
			}
		}
	}

	return components
}

func goModLineToComponent(line string) *SBOMComponent {
	if idx := strings.Index(line, "//"); idx >= 0 {
		line = line[:idx]
	}
	line = strings.TrimSpace(line)
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return nil
	}
	pkg := parts[0]
	version := strings.TrimPrefix(parts[1], "v")
	return &SBOMComponent{
		Type:    "library",
		Name:    pkg,
		Version: version,
		PURL:    fmt.Sprintf("pkg:golang/%s@%s", pkg, version),
		Scope:   "required",
	}
}

func scanPackageJSONForSBOM(path string) []SBOMComponent {
	var components []SBOMComponent

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var pkg struct {
		Name            string            `json:"name"`
		Version         string            `json:"version"`
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil
	}

	for name, version := range pkg.Dependencies {
		cleaned := cleanNPMVersion(version)
		components = append(components, SBOMComponent{
			Type:    "library",
			Name:    name,
			Version: cleaned,
			PURL:    fmt.Sprintf("pkg:npm/%s@%s", name, cleaned),
			Scope:   "required",
		})
	}

	for name, version := range pkg.DevDependencies {
		cleaned := cleanNPMVersion(version)
		components = append(components, SBOMComponent{
			Type:    "library",
			Name:    name,
			Version: cleaned,
			PURL:    fmt.Sprintf("pkg:npm/%s@%s", name, cleaned),
			Scope:   "optional",
		})
	}

	return components
}

func scanRequirementsForSBOM(path string) []SBOMComponent {
	var components []SBOMComponent

	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "-") {
			continue
		}
		name, version := parseRequirementLine(line)
		if name == "" {
			continue
		}
		components = append(components, SBOMComponent{
			Type:    "library",
			Name:    name,
			Version: version,
			PURL:    fmt.Sprintf("pkg:pypi/%s@%s", name, version),
			Scope:   "required",
		})
	}

	return components
}
