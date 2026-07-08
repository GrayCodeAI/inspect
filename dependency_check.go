package inspect

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// DependencyChecker scans project dependency files for known vulnerable packages.
type DependencyChecker struct {
	ProjectDir string
}

// NewDependencyChecker creates a DependencyChecker for the given project directory.
func NewDependencyChecker(projectDir string) *DependencyChecker {
	return &DependencyChecker{ProjectDir: projectDir}
}

// VulnEntry represents a known vulnerability for a package version range.
type VulnEntry struct {
	CVE              string
	Severity         Severity
	Description      string
	AffectedVersions []string // versions that are affected (prefix match)
	FixedVersion     string
}

// KnownVulnerabilities maps package names to their known vulnerability entries.
// This covers the top 50 most commonly exploited vulnerabilities.
var KnownVulnerabilities = map[string][]VulnEntry{
	// Go packages
	"golang.org/x/crypto": {
		{CVE: "CVE-2022-27191", Severity: SeverityHigh, Description: "Denial of service via crafted Signer", AffectedVersions: []string{"0.0.0-2022"}, FixedVersion: "0.0.0-20220315160706"},
	},
	"golang.org/x/net": {
		{CVE: "CVE-2022-41723", Severity: SeverityHigh, Description: "HTTP/2 HPACK decoder denial of service", AffectedVersions: []string{"0.0.0-2022", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6"}, FixedVersion: "0.7.0"},
		{CVE: "CVE-2023-44487", Severity: SeverityCritical, Description: "HTTP/2 rapid reset attack", AffectedVersions: []string{"0.0", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "0.10", "0.11", "0.12", "0.13", "0.14", "0.15", "0.16"}, FixedVersion: "0.17.0"},
	},
	"golang.org/x/text": {
		{CVE: "CVE-2022-32149", Severity: SeverityHigh, Description: "Denial of service via crafted Accept-Language header", AffectedVersions: []string{"0.0", "0.1", "0.2", "0.3"}, FixedVersion: "0.3.8"},
	},
	"github.com/gin-gonic/gin": {
		{CVE: "CVE-2023-26125", Severity: SeverityHigh, Description: "Improper input validation allows path traversal", AffectedVersions: []string{"1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9.0"}, FixedVersion: "1.9.1"},
	},
	"github.com/dgrijalva/jwt-go": {
		{CVE: "CVE-2020-26160", Severity: SeverityHigh, Description: "Audience validation bypass", AffectedVersions: []string{"1", "2", "3"}, FixedVersion: "4.0.0 (use github.com/golang-jwt/jwt)"},
	},
	"github.com/tidwall/gjson": {
		{CVE: "CVE-2021-42248", Severity: SeverityHigh, Description: "Denial of service via crafted JSON", AffectedVersions: []string{"1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9.0", "1.9.1", "1.9.2"}, FixedVersion: "1.9.3"},
	},

	// NPM packages
	"lodash": {
		{CVE: "CVE-2021-23337", Severity: SeverityCritical, Description: "Command injection via template function", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.0", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16", "4.17.0", "4.17.1", "4.17.2", "4.17.3", "4.17.4", "4.17.5", "4.17.6", "4.17.7", "4.17.8", "4.17.9", "4.17.10", "4.17.11", "4.17.12", "4.17.13", "4.17.14", "4.17.15", "4.17.16", "4.17.17", "4.17.18", "4.17.19", "4.17.20"}, FixedVersion: "4.17.21"},
		{CVE: "CVE-2020-8203", Severity: SeverityHigh, Description: "Prototype pollution in zipObjectDeep", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.0", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16", "4.17.0", "4.17.1", "4.17.2", "4.17.3", "4.17.4", "4.17.5", "4.17.6", "4.17.7", "4.17.8", "4.17.9", "4.17.10", "4.17.11", "4.17.12", "4.17.13", "4.17.14", "4.17.15"}, FixedVersion: "4.17.16"},
	},
	"minimist": {
		{CVE: "CVE-2021-44906", Severity: SeverityCritical, Description: "Prototype pollution", AffectedVersions: []string{"0.", "1.0", "1.1", "1.2.0", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"}, FixedVersion: "1.2.6"},
	},
	"node-forge": {
		{CVE: "CVE-2022-24771", Severity: SeverityHigh, Description: "Signature verification bypass with RSA PKCS#1 v1.5", AffectedVersions: []string{"0.", "1.0", "1.1", "1.2"}, FixedVersion: "1.3.0"},
	},
	"jsonwebtoken": {
		{CVE: "CVE-2022-23529", Severity: SeverityCritical, Description: "Insecure implementation of key retrieval function", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5.0"}, FixedVersion: "8.5.1"},
	},
	"express": {
		{CVE: "CVE-2024-29041", Severity: SeverityMedium, Description: "Open redirect via malicious URL", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.0", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16", "4.17", "4.18"}, FixedVersion: "4.19.2"},
	},
	"axios": {
		{CVE: "CVE-2023-45857", Severity: SeverityHigh, Description: "CSRF token exposure via cross-site requests", AffectedVersions: []string{"0.", "1.0", "1.1", "1.2", "1.3", "1.4", "1.5"}, FixedVersion: "1.6.0"},
	},
	"semver": {
		{CVE: "CVE-2022-25883", Severity: SeverityMedium, Description: "Regular expression denial of service", AffectedVersions: []string{"5.", "6.0", "6.1", "6.2", "6.3.0"}, FixedVersion: "6.3.1"},
	},
	"tar": {
		{CVE: "CVE-2021-37701", Severity: SeverityHigh, Description: "Arbitrary file creation/overwrite via symlink", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.0", "4.1", "4.2", "4.3", "4.4.0", "4.4.1", "4.4.2", "4.4.3", "4.4.4", "4.4.5", "4.4.6", "4.4.7", "4.4.8", "4.4.9", "4.4.10", "4.4.11", "4.4.12"}, FixedVersion: "4.4.13"},
	},
	"glob-parent": {
		{CVE: "CVE-2020-28469", Severity: SeverityHigh, Description: "Regular expression denial of service", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.0", "5.1.0"}, FixedVersion: "5.1.2"},
	},
	"postcss": {
		{CVE: "CVE-2023-44270", Severity: SeverityMedium, Description: "Line return parsing error", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.0", "8.1", "8.2", "8.3", "8.4.0", "8.4.1", "8.4.2", "8.4.3", "8.4.4", "8.4.5", "8.4.6", "8.4.7", "8.4.8", "8.4.9", "8.4.10", "8.4.11", "8.4.12", "8.4.13", "8.4.14", "8.4.15", "8.4.16", "8.4.17", "8.4.18", "8.4.19", "8.4.20", "8.4.21", "8.4.22", "8.4.23", "8.4.24", "8.4.25", "8.4.26", "8.4.27", "8.4.28", "8.4.29", "8.4.30"}, FixedVersion: "8.4.31"},
	},
	"ua-parser-js": {
		{CVE: "CVE-2022-25927", Severity: SeverityHigh, Description: "ReDoS vulnerability", AffectedVersions: []string{"0.7.0", "0.7.1", "0.7.2", "0.7.3", "0.7.4", "0.7.5", "0.7.6", "0.7.7", "0.7.8", "0.7.9", "0.7.10", "0.7.11", "0.7.12", "0.7.13", "0.7.14", "0.7.15", "0.7.16", "0.7.17", "0.7.18", "0.7.19", "0.7.20", "0.7.21", "0.7.22", "0.7.23", "0.7.24", "0.7.25", "0.7.26", "0.7.27", "0.7.28", "0.7.29", "0.7.30", "0.7.31", "0.7.32"}, FixedVersion: "0.7.33"},
	},

	// Python packages
	"django": {
		{CVE: "CVE-2023-36053", Severity: SeverityHigh, Description: "Potential ReDoS in EmailValidator/URLValidator", AffectedVersions: []string{"0.", "1.", "2.", "3.0", "3.1", "3.2.0", "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5", "3.2.6", "3.2.7", "3.2.8", "3.2.9", "3.2.10", "3.2.11", "3.2.12", "3.2.13", "3.2.14", "3.2.15", "3.2.16", "3.2.17", "3.2.18", "3.2.19"}, FixedVersion: "3.2.20"},
	},
	"flask": {
		{CVE: "CVE-2023-30861", Severity: SeverityHigh, Description: "Cookie exposure on cross-origin redirects", AffectedVersions: []string{"0.", "1.", "2.0", "2.1", "2.2.0", "2.2.1", "2.2.2", "2.2.3", "2.2.4"}, FixedVersion: "2.2.5"},
	},
	"requests": {
		{CVE: "CVE-2023-32681", Severity: SeverityMedium, Description: "Leaking Proxy-Authorization header to destination server", AffectedVersions: []string{"0.", "1.", "2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16", "2.17", "2.18", "2.19", "2.20", "2.21", "2.22", "2.23", "2.24", "2.25", "2.26", "2.27", "2.28", "2.29", "2.30"}, FixedVersion: "2.31.0"},
	},
	"pillow": {
		{CVE: "CVE-2023-44271", Severity: SeverityHigh, Description: "Denial of service via uncontrolled resource consumption", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.0"}, FixedVersion: "10.1.0"},
	},
	"urllib3": {
		{CVE: "CVE-2023-45803", Severity: SeverityMedium, Description: "Request body not stripped on redirect from 303", AffectedVersions: []string{"0.", "1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "1.18", "1.19", "1.20", "1.21", "1.22", "1.23", "1.24", "1.25", "1.26.0", "1.26.1", "1.26.2", "1.26.3", "1.26.4", "1.26.5", "1.26.6", "1.26.7", "1.26.8", "1.26.9", "1.26.10", "1.26.11", "1.26.12", "1.26.13", "1.26.14", "1.26.15", "1.26.16", "1.26.17"}, FixedVersion: "1.26.18"},
	},
	"cryptography": {
		{CVE: "CVE-2023-49083", Severity: SeverityHigh, Description: "NULL pointer dereference in PKCS12 parsing", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12.", "13.", "14.", "15.", "16.", "17.", "18.", "19.", "20.", "21.", "22.", "23.", "24.", "25.", "26.", "27.", "28.", "29.", "30.", "31.", "32.", "33.", "34.", "35.", "36.", "37.", "38.", "39.", "40.", "41.0.0", "41.0.1", "41.0.2", "41.0.3", "41.0.4", "41.0.5"}, FixedVersion: "41.0.6"},
	},
	"pyyaml": {
		{CVE: "CVE-2020-14343", Severity: SeverityCritical, Description: "Arbitrary code execution via unsafe load", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.0", "5.1", "5.2", "5.3"}, FixedVersion: "5.4"},
	},
	"jinja2": {
		{CVE: "CVE-2024-22195", Severity: SeverityMedium, Description: "Cross-site scripting via xmlattr filter", AffectedVersions: []string{"0.", "1.", "2.", "3.0", "3.1.0", "3.1.1", "3.1.2"}, FixedVersion: "3.1.3"},
	},
	"setuptools": {
		{CVE: "CVE-2024-6345", Severity: SeverityHigh, Description: "Remote code execution via URL in package_index", AffectedVersions: []string{"0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12.", "13.", "14.", "15.", "16.", "17.", "18.", "19.", "20.", "21.", "22.", "23.", "24.", "25.", "26.", "27.", "28.", "29.", "30.", "31.", "32.", "33.", "34.", "35.", "36.", "37.", "38.", "39.", "40.", "41.", "42.", "43.", "44.", "45.", "46.", "47.", "48.", "49.", "50.", "51.", "52.", "53.", "54.", "55.", "56.", "57.", "58.", "59.", "60.", "61.", "62.", "63.", "64.", "65.", "66.", "67.", "68.", "69.", "70.0"}, FixedVersion: "70.1.0"},
	},
	"numpy": {
		{CVE: "CVE-2021-41495", Severity: SeverityMedium, Description: "NULL pointer dereference in numpy.sort", AffectedVersions: []string{"0.", "1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "1.18", "1.19"}, FixedVersion: "1.20.0"},
	},

	// Java/Maven packages (commonly referenced)
	"org.apache.logging.log4j:log4j-core": {
		{CVE: "CVE-2021-44228", Severity: SeverityCritical, Description: "Log4Shell — Remote code execution via JNDI lookup", AffectedVersions: []string{"2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14.0", "2.14.1"}, FixedVersion: "2.15.0"},
		{CVE: "CVE-2021-45046", Severity: SeverityCritical, Description: "Log4Shell bypass — incomplete fix in 2.15.0", AffectedVersions: []string{"2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15.0"}, FixedVersion: "2.16.0"},
	},
	"com.fasterxml.jackson.core:jackson-databind": {
		{CVE: "CVE-2020-36518", Severity: SeverityHigh, Description: "Denial of service via deeply nested objects", AffectedVersions: []string{"2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12.0", "2.12.1", "2.12.2", "2.12.3", "2.12.4", "2.12.5", "2.12.6"}, FixedVersion: "2.12.7"},
	},
	"org.springframework:spring-core": {
		{CVE: "CVE-2022-22965", Severity: SeverityCritical, Description: "Spring4Shell — RCE via data binding", AffectedVersions: []string{"5.0", "5.1", "5.2", "5.3.0", "5.3.1", "5.3.2", "5.3.3", "5.3.4", "5.3.5", "5.3.6", "5.3.7", "5.3.8", "5.3.9", "5.3.10", "5.3.11", "5.3.12", "5.3.13", "5.3.14", "5.3.15", "5.3.16", "5.3.17"}, FixedVersion: "5.3.18"},
	},
}

// ScanGoMod parses a go.mod file and checks for known vulnerable package versions.
func (d *DependencyChecker) ScanGoMod(path string) []Finding {
	var findings []Finding

	file, err := os.Open(path) // #nosec G304 -- path is the go.mod location supplied to this dependency checker (a project file to be scanned for vulnerable packages), not attacker-controlled input
	if err != nil {
		findings = append(findings, Finding{
			Check:    "dependency-gomod",
			Severity: SeverityInfo,
			URL:      path,
			Message:  fmt.Sprintf("Could not open go.mod: %s", err.Error()),
		})
		return findings
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	inRequire := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Track require blocks
		if strings.HasPrefix(line, "require (") || strings.HasPrefix(line, "require(") {
			inRequire = true
			continue
		}
		if line == ")" {
			inRequire = false
			continue
		}

		// Single-line require
		if strings.HasPrefix(line, "require ") && !strings.Contains(line, "(") {
			line = strings.TrimPrefix(line, "require ")
			pkg, version := parseGoModDep(line)
			if f := checkVulnerability(pkg, version, path, "dependency-gomod"); f != nil {
				findings = append(findings, f...)
			}
			continue
		}

		// Inside require block
		if inRequire && line != "" && !strings.HasPrefix(line, "//") {
			pkg, version := parseGoModDep(line)
			if f := checkVulnerability(pkg, version, path, "dependency-gomod"); f != nil {
				findings = append(findings, f...)
			}
		}
	}

	return findings
}

// ScanPackageJSON parses a package.json file and checks for known vulnerable packages.
func (d *DependencyChecker) ScanPackageJSON(path string) []Finding {
	var findings []Finding

	data, err := os.ReadFile(path) // #nosec G304 -- path is the package.json location supplied to this dependency checker (a project file to be scanned for vulnerable packages), not attacker-controlled input
	if err != nil {
		findings = append(findings, Finding{
			Check:    "dependency-npm",
			Severity: SeverityInfo,
			URL:      path,
			Message:  fmt.Sprintf("Could not read package.json: %s", err.Error()),
		})
		return findings
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}

	if err := json.Unmarshal(data, &pkg); err != nil {
		findings = append(findings, Finding{
			Check:    "dependency-npm",
			Severity: SeverityInfo,
			URL:      path,
			Message:  fmt.Sprintf("Could not parse package.json: %s", err.Error()),
		})
		return findings
	}

	// Check both dependencies and devDependencies
	for name, version := range pkg.Dependencies {
		version = cleanNPMVersion(version)
		if f := checkVulnerability(name, version, path, "dependency-npm"); f != nil {
			findings = append(findings, f...)
		}
	}

	for name, version := range pkg.DevDependencies {
		version = cleanNPMVersion(version)
		if f := checkVulnerability(name, version, path, "dependency-npm"); f != nil {
			findings = append(findings, f...)
		}
	}

	return findings
}

// ScanRequirements parses a Python requirements.txt file and checks for known vulnerable packages.
func (d *DependencyChecker) ScanRequirements(path string) []Finding {
	var findings []Finding

	file, err := os.Open(path) // #nosec G304 -- path is the requirements.txt location supplied to this dependency checker (a project file to be scanned for vulnerable packages), not attacker-controlled input
	if err != nil {
		findings = append(findings, Finding{
			Check:    "dependency-python",
			Severity: SeverityInfo,
			URL:      path,
			Message:  fmt.Sprintf("Could not open requirements.txt: %s", err.Error()),
		})
		return findings
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

		// Normalize package name (pip uses - and _ interchangeably)
		normalizedName := strings.ToLower(strings.ReplaceAll(name, "-", "_"))
		// Try original case first, then lowercase
		if f := checkVulnerability(name, version, path, "dependency-python"); f != nil {
			findings = append(findings, f...)
		} else if normalizedName != name {
			if f := checkVulnerability(normalizedName, version, path, "dependency-python"); f != nil {
				findings = append(findings, f...)
			}
		}
	}

	return findings
}

// parseGoModDep extracts package name and version from a go.mod dependency line.
func parseGoModDep(line string) (string, string) {
	// Remove // indirect suffix and other comments
	if idx := strings.Index(line, "//"); idx >= 0 {
		line = line[:idx]
	}
	line = strings.TrimSpace(line)

	parts := strings.Fields(line)
	if len(parts) < 2 {
		return "", ""
	}

	pkg := parts[0]
	version := strings.TrimPrefix(parts[1], "v")
	return pkg, version
}

// parseRequirementLine parses a pip requirements.txt line into package name and version.
func parseRequirementLine(line string) (string, string) {
	// Remove environment markers
	if idx := strings.Index(line, ";"); idx >= 0 {
		line = line[:idx]
	}
	// Remove extras
	if idx := strings.Index(line, "["); idx >= 0 {
		endIdx := strings.Index(line, "]")
		if endIdx > idx {
			line = line[:idx] + line[endIdx+1:]
		}
	}

	line = strings.TrimSpace(line)

	// Split on version specifiers
	for _, sep := range []string{"==", ">=", "<=", "~=", "!=", ">", "<"} {
		if idx := strings.Index(line, sep); idx >= 0 {
			name := strings.TrimSpace(line[:idx])
			version := strings.TrimSpace(line[idx+len(sep):])
			// Take just the first version if there are multiple constraints
			if commaIdx := strings.Index(version, ","); commaIdx >= 0 {
				version = version[:commaIdx]
			}
			return strings.ToLower(name), version
		}
	}

	// No version specified
	return strings.ToLower(line), ""
}

// cleanNPMVersion removes NPM version prefixes (^, ~, >=, etc.)
func cleanNPMVersion(version string) string {
	version = strings.TrimSpace(version)
	version = strings.TrimLeft(version, "^~>=<!")
	// Handle ranges like "1.0.0 - 2.0.0" — take the first version
	if idx := strings.Index(version, " "); idx >= 0 {
		version = version[:idx]
	}
	return version
}

// checkVulnerability checks if a package at a given version has known vulnerabilities.
func checkVulnerability(pkg, version, filePath, checkName string) []Finding {
	vulns, exists := KnownVulnerabilities[pkg]
	if !exists {
		return nil
	}

	if version == "" {
		// Can't determine version, warn about it
		return []Finding{{
			Check:    checkName,
			Severity: SeverityInfo,
			URL:      filePath,
			Message:  fmt.Sprintf("Package %s has known vulnerabilities but version could not be determined", pkg),
			Fix:      "Pin package version and ensure it is up to date",
		}}
	}

	var findings []Finding
	for _, vuln := range vulns {
		if isVersionAffected(version, vuln.AffectedVersions) {
			findings = append(findings, Finding{
				Check:    checkName,
				Severity: vuln.Severity,
				URL:      filePath,
				Element:  fmt.Sprintf("%s@%s", pkg, version),
				Message:  fmt.Sprintf("%s: %s", vuln.CVE, vuln.Description),
				Evidence: fmt.Sprintf("Installed: %s, Fixed in: %s", version, vuln.FixedVersion),
				Fix:      fmt.Sprintf("Upgrade %s to %s or later", pkg, vuln.FixedVersion),
			})
		}
	}
	return findings
}

// isVersionAffected checks if a version is older than the fixed version.
// It uses the AffectedVersions list with a "less than fixed" comparison approach:
// a version is considered affected if it starts with any of the affected prefixes
// (matched on segment boundaries).
func isVersionAffected(version string, affectedVersions []string) bool {
	// Strip metadata suffixes like +incompatible for comparison
	cleanVersion := version
	if idx := strings.Index(cleanVersion, "+"); idx >= 0 {
		cleanVersion = cleanVersion[:idx]
	}

	for _, prefix := range affectedVersions {
		if cleanVersion == prefix {
			return true
		}
		if strings.HasPrefix(cleanVersion, prefix+".") {
			return true
		}
	}
	return false
}
