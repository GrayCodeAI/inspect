package report

import (
	"encoding/xml"
	"fmt"
	"time"
)

// JUnit XML types following the standard schema.

type JUnitTestSuites struct {
	XMLName xml.Name         `xml:"testsuites"`
	Name    string           `xml:"name,attr"`
	Tests   int              `xml:"tests,attr"`
	Failures int             `xml:"failures,attr"`
	Time    string           `xml:"time,attr"`
	Suites  []JUnitTestSuite `xml:"testsuite"`
}

type JUnitTestSuite struct {
	XMLName  xml.Name        `xml:"testsuite"`
	Name     string          `xml:"name,attr"`
	Tests    int             `xml:"tests,attr"`
	Failures int             `xml:"failures,attr"`
	Time     string          `xml:"time,attr"`
	Cases    []JUnitTestCase `xml:"testcase"`
}

type JUnitTestCase struct {
	XMLName   xml.Name      `xml:"testcase"`
	Name      string        `xml:"name,attr"`
	Classname string        `xml:"classname,attr"`
	Time      string        `xml:"time,attr"`
	Failure   *JUnitFailure `xml:"failure,omitempty"`
}

type JUnitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Body    string `xml:",chardata"`
}

// FormatJUnit renders findings as JUnit XML for CI integration.
// Each check becomes a test suite, each finding becomes a failed test case.
// Pages with no findings for a check get a passing test case.
func FormatJUnit(data ReportData) (string, error) {
	suites := JUnitTestSuites{
		Name:  fmt.Sprintf("inspect: %s", data.Target),
		Time:  fmt.Sprintf("%.3f", data.Duration.Seconds()),
	}

	// Group findings by check
	byCheck := make(map[string][]Finding)
	checkNames := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	for _, f := range data.Findings {
		byCheck[f.Check] = append(byCheck[f.Check], f)
	}

	totalTests := 0
	totalFailures := 0

	for _, checkName := range checkNames {
		findings := byCheck[checkName]
		suite := JUnitTestSuite{
			Name: checkName,
			Time: formatDuration(data.Duration / time.Duration(len(checkNames))),
		}

		if len(findings) == 0 {
			suite.Tests = 1
			suite.Cases = append(suite.Cases, JUnitTestCase{
				Name:      checkName + ": all passing",
				Classname: "inspect." + checkName,
				Time:      "0.000",
			})
		} else {
			suite.Tests = len(findings)
			suite.Failures = len(findings)
			for _, f := range findings {
				tc := JUnitTestCase{
					Name:      fmt.Sprintf("[%s] %s", f.Severity.String(), f.Message),
					Classname: "inspect." + checkName,
					Time:      "0.000",
					Failure: &JUnitFailure{
						Message: f.Message,
						Type:    f.Severity.String(),
						Body:    formatFailureBody(f),
					},
				}
				suite.Cases = append(suite.Cases, tc)
			}
		}

		totalTests += suite.Tests
		totalFailures += suite.Failures
		suites.Suites = append(suites.Suites, suite)
	}

	// Add custom check suites
	for checkName, findings := range byCheck {
		if isBuiltinCheck(checkName) {
			continue
		}
		suite := JUnitTestSuite{
			Name:     checkName,
			Tests:    len(findings),
			Failures: len(findings),
			Time:     "0.000",
		}
		for _, f := range findings {
			suite.Cases = append(suite.Cases, JUnitTestCase{
				Name:      fmt.Sprintf("[%s] %s", f.Severity.String(), f.Message),
				Classname: "inspect." + checkName,
				Time:      "0.000",
				Failure: &JUnitFailure{
					Message: f.Message,
					Type:    f.Severity.String(),
					Body:    formatFailureBody(f),
				},
			})
		}
		totalTests += suite.Tests
		totalFailures += suite.Failures
		suites.Suites = append(suites.Suites, suite)
	}

	suites.Tests = totalTests
	suites.Failures = totalFailures

	output, err := xml.MarshalIndent(suites, "", "  ")
	if err != nil {
		return "", err
	}
	return xml.Header + string(output), nil
}

func formatFailureBody(f Finding) string {
	body := fmt.Sprintf("URL: %s\n", f.URL)
	if f.Element != "" {
		body += fmt.Sprintf("Element: %s\n", f.Element)
	}
	if f.Fix != "" {
		body += fmt.Sprintf("Fix: %s\n", f.Fix)
	}
	if f.Evidence != "" {
		body += fmt.Sprintf("Evidence: %s\n", f.Evidence)
	}
	return body
}

func formatDuration(d time.Duration) string {
	return fmt.Sprintf("%.3f", d.Seconds())
}

func isBuiltinCheck(name string) bool {
	builtins := map[string]bool{
		"links": true, "security": true, "forms": true,
		"a11y": true, "perf": true, "seo": true,
	}
	return builtins[name]
}
