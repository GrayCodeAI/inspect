package inspect

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanPackageJSON_FileNotFound(t *testing.T) {
	checker := NewDependencyChecker("/tmp")
	findings := checker.ScanPackageJSON("/nonexistent/package.json")

	if len(findings) != 1 {
		t.Fatalf("expected 1 info finding, got %d", len(findings))
	}
	if findings[0].Severity != SeverityInfo {
		t.Errorf("expected info severity, got %s", findings[0].Severity)
	}
	if findings[0].Check != "dependency-npm" {
		t.Errorf("expected check 'dependency-npm', got %q", findings[0].Check)
	}
}

func TestScanPackageJSON_DevDependenciesVulnerable(t *testing.T) {
	dir := t.TempDir()
	pkgJSON := filepath.Join(dir, "package.json")

	content := `{
  "name": "test-app",
  "version": "1.0.0",
  "devDependencies": {
    "minimist": "1.2.0",
    "node-forge": "1.0.0"
  }
}`
	if err := os.WriteFile(pkgJSON, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanPackageJSON(pkgJSON)

	if len(findings) == 0 {
		t.Fatal("expected findings for vulnerable devDependencies")
	}

	foundMinimist := false
	foundNodeForge := false
	for _, f := range findings {
		if f.Element == "minimist@1.2.0" {
			foundMinimist = true
		}
		if f.Element == "node-forge@1.0.0" {
			foundNodeForge = true
		}
	}

	if !foundMinimist {
		t.Error("expected finding for minimist 1.2.0 in devDependencies")
	}
	if !foundNodeForge {
		t.Error("expected finding for node-forge 1.0.0 in devDependencies")
	}
}

func TestScanPackageJSON_NPMTildePrefix(t *testing.T) {
	dir := t.TempDir()
	pkgJSON := filepath.Join(dir, "package.json")

	content := `{
  "name": "test-app",
  "dependencies": {
    "lodash": "~4.17.15"
  }
}`
	if err := os.WriteFile(pkgJSON, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanPackageJSON(pkgJSON)

	if len(findings) == 0 {
		t.Fatal("expected finding for lodash ~4.17.15")
	}

	if findings[0].Element != "lodash@4.17.15" {
		t.Errorf("expected element 'lodash@4.17.15', got %q", findings[0].Element)
	}
}

func TestScanGoMod_IndirectDeps(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21

require (
	golang.org/x/net v0.7.0 // indirect
	golang.org/x/text v0.3.0
)`
	if err := os.WriteFile(gomod, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	if len(findings) < 2 {
		t.Errorf("expected at least 2 findings for indirect+direct deps, got %d", len(findings))
	}
}

func TestScanGoMod_EmptyRequire(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21
`
	if err := os.WriteFile(gomod, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	if len(findings) != 0 {
		t.Errorf("expected no findings for empty go.mod, got %d", len(findings))
	}
}

func TestScanRequirements_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	if err := os.WriteFile(reqFile, []byte("# just comments\n\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	if len(findings) != 0 {
		t.Errorf("expected no findings for comment-only requirements.txt, got %d", len(findings))
	}
}

func TestScanRequirements_NoVersion(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	// Package with known vulns but no version specified
	content := `django
flask
`
	if err := os.WriteFile(reqFile, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	// Should get info-level findings about undetermined versions
	for _, f := range findings {
		if f.Severity != SeverityInfo {
			t.Errorf("expected info severity for undetermined version, got %s", f.Severity)
		}
	}
}

func TestIsVersionAffected_IncompatibleSuffix(t *testing.T) {
	// Go modules use +incompatible suffix for major version upgrades
	result := isVersionAffected("3.2.0+incompatible", []string{"1", "2", "3"})
	if !result {
		t.Error("expected 3.2.0+incompatible to be affected by prefix '3'")
	}
}

func TestIsVersionAffected_NoMatch(t *testing.T) {
	result := isVersionAffected("2.0.0", []string{"0.", "1.0", "1.1", "1.2"})
	if result {
		t.Error("expected 2.0.0 to not match prefixes 0./1.x")
	}
}

func TestCheckVulnerability_UnknownPackage(t *testing.T) {
	findings := checkVulnerability("some-unknown-package", "1.0.0", "go.mod", "test")
	if len(findings) != 0 {
		t.Errorf("expected no findings for unknown package, got %d", len(findings))
	}
}

func TestCheckVulnerability_EmptyVersion(t *testing.T) {
	findings := checkVulnerability("lodash", "", "package.json", "test")
	if len(findings) != 1 {
		t.Fatalf("expected 1 finding for empty version, got %d", len(findings))
	}
	if findings[0].Severity != SeverityInfo {
		t.Errorf("expected info severity, got %s", findings[0].Severity)
	}
}

func TestScanRequirements_PythonNormalization(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	// PyYAML uses different casing in pip vs our database
	content := `PyYAML==5.3
`
	if err := os.WriteFile(reqFile, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	found := false
	for _, f := range findings {
		if f.Element == "PyYAML@5.3" || f.Element == "pyyaml@5.3" {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for PyYAML 5.3 (case normalization)")
	}
}

func TestCleanNPMVersion_RangeWithSpace(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"^4.17.15", "4.17.15"},
		{"~1.2.3", "1.2.3"},
		{">=2.0.0", "2.0.0"},
		{"1.0.0 - 2.0.0", "1.0.0"},
		{"  ^3.0.0  ", "3.0.0"},
	}

	for _, tt := range tests {
		result := cleanNPMVersion(tt.input)
		if result != tt.expected {
			t.Errorf("cleanNPMVersion(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestScanGoMod_CommentsIgnored(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21

require (
	// This is a comment
	golang.org/x/net v0.7.0 // another comment
)`
	if err := os.WriteFile(gomod, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	// Should still detect the vulnerability despite comments
	foundNet := false
	for _, f := range findings {
		if f.Element == "golang.org/x/net@0.7.0" {
			foundNet = true
		}
	}
	if !foundNet {
		t.Error("expected finding for golang.org/x/net v0.7.0 despite comments")
	}
}

func TestKnownVulnerabilities_NPMCoverage(t *testing.T) {
	npmPackages := []string{
		"lodash", "minimist", "node-forge", "jsonwebtoken",
		"express", "axios", "semver", "tar", "glob-parent",
		"postcss", "ua-parser-js",
	}

	for _, pkg := range npmPackages {
		if _, ok := KnownVulnerabilities[pkg]; !ok {
			t.Errorf("expected %q in KnownVulnerabilities", pkg)
		}
	}
}

func TestKnownVulnerabilities_PythonCoverage(t *testing.T) {
	pythonPackages := []string{
		"django", "flask", "requests", "pillow",
		"urllib3", "cryptography", "pyyaml", "jinja2",
		"setuptools", "numpy",
	}

	for _, pkg := range pythonPackages {
		if _, ok := KnownVulnerabilities[pkg]; !ok {
			t.Errorf("expected %q in KnownVulnerabilities", pkg)
		}
	}
}

func TestKnownVulnerabilities_GoCoverage(t *testing.T) {
	goPackages := []string{
		"golang.org/x/crypto", "golang.org/x/net", "golang.org/x/text",
		"github.com/gin-gonic/gin", "github.com/dgrijalva/jwt-go",
		"github.com/tidwall/gjson",
	}

	for _, pkg := range goPackages {
		if _, ok := KnownVulnerabilities[pkg]; !ok {
			t.Errorf("expected %q in KnownVulnerabilities", pkg)
		}
	}
}
