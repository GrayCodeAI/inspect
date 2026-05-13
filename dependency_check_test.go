package inspect

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanGoMod_VulnerablePackage(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21

require (
	golang.org/x/net v0.7.0
	github.com/gin-gonic/gin v1.9.0
	github.com/dgrijalva/jwt-go v3.2.0+incompatible
)
`
	if err := os.WriteFile(gomod, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	if len(findings) == 0 {
		t.Fatal("expected vulnerability findings")
	}

	// Check for specific vulnerabilities
	foundNet := false
	foundGin := false
	foundJWT := false
	for _, f := range findings {
		if f.Element == "golang.org/x/net@0.7.0" {
			foundNet = true
		}
		if f.Element == "github.com/gin-gonic/gin@1.9.0" {
			foundGin = true
		}
		if f.Element == "github.com/dgrijalva/jwt-go@3.2.0+incompatible" {
			foundJWT = true
		}
	}

	if !foundNet {
		t.Error("expected finding for golang.org/x/net v0.7.0")
	}
	if !foundGin {
		t.Error("expected finding for gin v1.9.0")
	}
	if !foundJWT {
		t.Error("expected finding for jwt-go v3.2.0")
	}
}

func TestScanGoMod_SafeVersions(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21

require (
	golang.org/x/net v0.40.0
	github.com/gin-gonic/gin v1.10.0
)
`
	if err := os.WriteFile(gomod, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	if len(findings) != 0 {
		t.Errorf("expected no findings for safe versions, got %d: %+v", len(findings), findings)
	}
}

func TestScanGoMod_SingleLineRequire(t *testing.T) {
	dir := t.TempDir()
	gomod := filepath.Join(dir, "go.mod")

	content := `module example.com/myapp

go 1.21

require golang.org/x/net v0.7.0
`
	if err := os.WriteFile(gomod, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanGoMod(gomod)

	if len(findings) == 0 {
		t.Fatal("expected finding for single-line require")
	}
}

func TestScanGoMod_FileNotFound(t *testing.T) {
	checker := NewDependencyChecker("/tmp")
	findings := checker.ScanGoMod("/nonexistent/go.mod")

	if len(findings) != 1 {
		t.Fatalf("expected 1 info finding, got %d", len(findings))
	}
	if findings[0].Severity != SeverityInfo {
		t.Errorf("expected info severity, got %s", findings[0].Severity)
	}
}

func TestScanPackageJSON_VulnerablePackages(t *testing.T) {
	dir := t.TempDir()
	pkgJSON := filepath.Join(dir, "package.json")

	content := `{
  "name": "test-app",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.15",
    "express": "4.17.1",
    "axios": "^1.4.0"
  },
  "devDependencies": {
    "minimist": "1.2.5"
  }
}
`
	if err := os.WriteFile(pkgJSON, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanPackageJSON(pkgJSON)

	if len(findings) == 0 {
		t.Fatal("expected vulnerability findings")
	}

	foundLodash := false
	foundMinimist := false
	for _, f := range findings {
		if f.Element == "lodash@4.17.15" {
			foundLodash = true
		}
		if f.Element == "minimist@1.2.5" {
			foundMinimist = true
		}
	}

	if !foundLodash {
		t.Error("expected finding for lodash 4.17.15")
	}
	if !foundMinimist {
		t.Error("expected finding for minimist 1.2.5")
	}
}

func TestScanPackageJSON_SafeVersions(t *testing.T) {
	dir := t.TempDir()
	pkgJSON := filepath.Join(dir, "package.json")

	content := `{
  "name": "test-app",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.21",
    "express": "4.19.2"
  }
}
`
	if err := os.WriteFile(pkgJSON, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanPackageJSON(pkgJSON)

	if len(findings) != 0 {
		t.Errorf("expected no findings for safe versions, got %d: %+v", len(findings), findings)
	}
}

func TestScanPackageJSON_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	pkgJSON := filepath.Join(dir, "package.json")

	if err := os.WriteFile(pkgJSON, []byte("not json"), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanPackageJSON(pkgJSON)

	if len(findings) != 1 {
		t.Fatalf("expected 1 info finding, got %d", len(findings))
	}
	if findings[0].Severity != SeverityInfo {
		t.Errorf("expected info severity, got %s", findings[0].Severity)
	}
}

func TestScanRequirements_VulnerablePackages(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	content := `# Python dependencies
django==3.2.15
flask>=2.2.3
requests==2.28.0
pillow==9.5.0
urllib3==1.26.10
pyyaml==5.3
`
	if err := os.WriteFile(reqFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	if len(findings) == 0 {
		t.Fatal("expected vulnerability findings")
	}

	foundDjango := false
	foundFlask := false
	foundPyyaml := false
	for _, f := range findings {
		if f.Element == "django@3.2.15" {
			foundDjango = true
		}
		if f.Element == "flask@2.2.3" {
			foundFlask = true
		}
		if f.Element == "pyyaml@5.3" {
			foundPyyaml = true
		}
	}

	if !foundDjango {
		t.Error("expected finding for django 3.2.15")
	}
	if !foundFlask {
		t.Error("expected finding for flask 2.2.3")
	}
	if !foundPyyaml {
		t.Error("expected finding for pyyaml 5.3")
	}
}

func TestScanRequirements_SafeVersions(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	content := `django==4.2.0
flask==3.0.0
requests==2.31.0
`
	if err := os.WriteFile(reqFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	if len(findings) != 0 {
		t.Errorf("expected no findings for safe versions, got %d: %+v", len(findings), findings)
	}
}

func TestScanRequirements_WithExtrasAndMarkers(t *testing.T) {
	dir := t.TempDir()
	reqFile := filepath.Join(dir, "requirements.txt")

	content := `requests[security]==2.28.0; python_version >= "3.6"
urllib3==1.26.10
`
	if err := os.WriteFile(reqFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewDependencyChecker(dir)
	findings := checker.ScanRequirements(reqFile)

	if len(findings) == 0 {
		t.Fatal("expected findings for vulnerable packages with extras")
	}
}

func TestScanRequirements_FileNotFound(t *testing.T) {
	checker := NewDependencyChecker("/tmp")
	findings := checker.ScanRequirements("/nonexistent/requirements.txt")

	if len(findings) != 1 {
		t.Fatalf("expected 1 info finding, got %d", len(findings))
	}
	if findings[0].Severity != SeverityInfo {
		t.Errorf("expected info severity, got %s", findings[0].Severity)
	}
}

func TestParseGoModDep(t *testing.T) {
	tests := []struct {
		line    string
		pkg     string
		version string
	}{
		{"golang.org/x/net v0.7.0", "golang.org/x/net", "0.7.0"},
		{"github.com/foo/bar v1.2.3 // indirect", "github.com/foo/bar", "1.2.3"},
		{"github.com/dgrijalva/jwt-go v3.2.0+incompatible", "github.com/dgrijalva/jwt-go", "3.2.0+incompatible"},
	}

	for _, tt := range tests {
		pkg, version := parseGoModDep(tt.line)
		if pkg != tt.pkg {
			t.Errorf("parseGoModDep(%q) pkg = %q, want %q", tt.line, pkg, tt.pkg)
		}
		if version != tt.version {
			t.Errorf("parseGoModDep(%q) version = %q, want %q", tt.line, version, tt.version)
		}
	}
}

func TestParseRequirementLine(t *testing.T) {
	tests := []struct {
		line    string
		name    string
		version string
	}{
		{"django==3.2.15", "django", "3.2.15"},
		{"flask>=2.2.3", "flask", "2.2.3"},
		{"requests~=2.28.0", "requests", "2.28.0"},
		{"numpy", "numpy", ""},
		{"PyYAML==5.3", "pyyaml", "5.3"},
		{"requests[security]==2.28.0; python_version >= \"3.6\"", "requests", "2.28.0"},
	}

	for _, tt := range tests {
		name, version := parseRequirementLine(tt.line)
		if name != tt.name {
			t.Errorf("parseRequirementLine(%q) name = %q, want %q", tt.line, name, tt.name)
		}
		if version != tt.version {
			t.Errorf("parseRequirementLine(%q) version = %q, want %q", tt.line, version, tt.version)
		}
	}
}

func TestCleanNPMVersion(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"^4.17.15", "4.17.15"},
		{"~1.2.3", "1.2.3"},
		{">=2.0.0", "2.0.0"},
		{"1.0.0", "1.0.0"},
		{">=1.0.0 <2.0.0", "1.0.0"},
	}

	for _, tt := range tests {
		result := cleanNPMVersion(tt.input)
		if result != tt.expected {
			t.Errorf("cleanNPMVersion(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestIsVersionAffected(t *testing.T) {
	tests := []struct {
		version  string
		affected []string
		expected bool
	}{
		{"4.17.15", []string{"4.17.0", "4.17.1", "4.17.15"}, true},
		{"4.17.21", []string{"4.17.0", "4.17.1", "4.17.15"}, false},
		{"0.7.0", []string{"0.0", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7"}, true},
		{"0.40.0", []string{"0.0", "0.1", "0.2", "0.3"}, false},
	}

	for _, tt := range tests {
		result := isVersionAffected(tt.version, tt.affected)
		if result != tt.expected {
			t.Errorf("isVersionAffected(%q, ...) = %v, want %v", tt.version, result, tt.expected)
		}
	}
}

func TestKnownVulnerabilities_Coverage(t *testing.T) {
	// Ensure we have a reasonable number of entries
	if len(KnownVulnerabilities) < 20 {
		t.Errorf("expected at least 20 packages in KnownVulnerabilities, got %d", len(KnownVulnerabilities))
	}

	// Verify Log4Shell is in the database
	log4j, ok := KnownVulnerabilities["org.apache.logging.log4j:log4j-core"]
	if !ok {
		t.Fatal("expected log4j-core in KnownVulnerabilities")
	}

	foundLog4Shell := false
	for _, v := range log4j {
		if v.CVE == "CVE-2021-44228" {
			foundLog4Shell = true
			if v.Severity != SeverityCritical {
				t.Error("Log4Shell should be critical severity")
			}
			break
		}
	}
	if !foundLog4Shell {
		t.Error("expected CVE-2021-44228 (Log4Shell) in log4j vulnerabilities")
	}
}
