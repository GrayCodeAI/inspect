// Command inspect-ci is a lightweight CLI entrypoint for CI/CD pipelines
// and the GitHub Action. It wraps the inspect library with flag-based config.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/GrayCodeAI/inspect"
)

// Exit codes for CI integration.
const (
	exitPass     = 0 // No findings above threshold
	exitFail     = 1 // Findings at or above --fail-on severity
	exitError    = 2 // CLI usage error or scan failure
	exitWarnings = 3 // Findings present but below threshold (--warn-on)
)

func main() {
	var (
		url         string
		checks      string
		depth       int
		failOn      string
		warnOn      string
		concurrency int
		format      string
		timeout     string
		outputFile  string
		sarif       bool
		sbom        bool
		sbomDir     string
		quiet       bool
	)

	flag.StringVar(&url, "url", "", "Target URL to audit")
	flag.StringVar(&checks, "checks", "links,security,forms,a11y,perf,seo", "Comma-separated checks")
	flag.IntVar(&depth, "depth", 5, "Maximum crawl depth")
	flag.StringVar(&failOn, "fail-on", "high", "Minimum severity to exit with failure (info, low, medium, high, critical)")
	flag.StringVar(&warnOn, "warn-on", "", "Minimum severity to exit with warnings (exit code 3)")
	flag.IntVar(&concurrency, "concurrency", 10, "Concurrent workers")
	flag.StringVar(&format, "format", "terminal", "Output format: terminal, json, junit, github, gitlab")
	flag.StringVar(&timeout, "timeout", "5m", "Scan timeout")
	flag.StringVar(&outputFile, "output-file", "", "Write report to file")
	flag.BoolVar(&sarif, "sarif", false, "Output in SARIF 2.1.0 format (GitHub Code Scanning compatible)")
	flag.BoolVar(&sbom, "sbom", false, "Generate CycloneDX 1.5 SBOM")
	flag.StringVar(&sbomDir, "sbom-dir", ".", "Project directory for SBOM dependency scanning")
	flag.BoolVar(&quiet, "quiet", false, "Suppress terminal output; only exit code and errors")
	flag.Parse()

	if url == "" {
		fmt.Fprintf(os.Stderr, "error: --url is required\n")
		os.Exit(exitError)
	}

	dur, err := time.ParseDuration(timeout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: invalid timeout %q: %v\n", timeout, err)
		os.Exit(exitError)
	}

	ctx, cancel := context.WithTimeout(context.Background(), dur)
	defer cancel()

	opts := []inspect.Option{
		inspect.WithDepth(depth),
		inspect.WithChecks(strings.Split(checks, ",")...),
		inspect.WithConcurrency(concurrency),
		inspect.WithFailOn(inspect.ParseSeverity(failOn)),
		inspect.WithTimeout(dur),
	}

	// If --sarif flag is set, override format
	if sarif {
		format = "sarif"
	}

	report, err := inspect.Scan(ctx, url, opts...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(exitError)
	}

	// Output
	var output string
	switch format {
	case "json":
		data, _ := json.MarshalIndent(report, "", "  ")
		output = string(data)
	case "junit":
		output = inspect.GenerateJUnit(report.Findings)
	case "sarif":
		output = inspect.GenerateSARIF(report.Findings, inspect.Version)
	case "github":
		ci := &inspect.CIOutput{Format: "github"}
		output = ci.FormatFindings(report.Findings)
	case "gitlab":
		ci := &inspect.CIOutput{Format: "gitlab"}
		output = ci.FormatFindings(report.Findings)
	default:
		output = formatTerminal(report)
	}

	if !quiet {
		fmt.Println(output)
	}

	// Generate SBOM if requested
	if sbom {
		sbomJSON, err := inspect.GenerateSBOMJSON(sbomDir, inspect.Version)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: SBOM generation failed: %v\n", err)
		} else {
			sbomFile := outputFile
			if sbomFile != "" {
				sbomFile = strings.TrimSuffix(sbomFile, ".json") + ".sbom.json"
			} else {
				sbomFile = "inspect-sbom.json"
			}
			if err := os.WriteFile(sbomFile, []byte(sbomJSON), 0o644); err != nil {
				fmt.Fprintf(os.Stderr, "warning: failed to write SBOM: %v\n", err)
			} else if !quiet {
				fmt.Fprintf(os.Stderr, "SBOM written to %s\n", sbomFile)
			}
		}
	}

	// Write to file if requested
	if outputFile != "" {
		if err := os.WriteFile(outputFile, []byte(output), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "warning: failed to write report: %v\n", err)
		}
	}

	// GitHub Actions output
	if ghOutput := os.Getenv("GITHUB_OUTPUT"); ghOutput != "" {
		f, err := os.OpenFile(ghOutput, os.O_APPEND|os.O_WRONLY, 0o644)
		if err == nil {
			fmt.Fprintf(f, "findings=%d\n", report.Stats.FindingsTotal)
			fmt.Fprintf(f, "max-severity=%s\n", report.MaxSeverity())
			fmt.Fprintf(f, "failed=%s\n", strconv.FormatBool(report.Failed()))
			if outputFile != "" {
				fmt.Fprintf(f, "report=%s\n", outputFile)
			}
			f.Close()
		}
	}

	// Determine exit code based on severity thresholds
	os.Exit(determineExitCode(report, warnOn))
}

// determineExitCode returns the appropriate exit code based on findings severity.
func determineExitCode(report *inspect.Report, warnOn string) int {
	if report.Failed() {
		return exitFail
	}
	if warnOn != "" {
		warnSeverity := inspect.ParseSeverity(warnOn)
		for _, f := range report.Findings {
			if f.Severity.AtLeast(warnSeverity) {
				return exitWarnings
			}
		}
	}
	return exitPass
}

func formatTerminal(r *inspect.Report) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Inspect: %s — %d pages, %d findings\n",
		r.Target, r.CrawledURLs, r.Stats.FindingsTotal))
	b.WriteString(fmt.Sprintf("Duration: %s\n\n", r.Duration.Round(time.Millisecond)))

	for _, f := range r.Findings {
		b.WriteString(fmt.Sprintf("  [%s][%s] %s\n", f.Severity, f.Check, f.Message))
		b.WriteString(fmt.Sprintf("    URL: %s\n", f.URL))
		if f.Fix != "" {
			b.WriteString(fmt.Sprintf("    Fix: %s\n", f.Fix))
		}
		b.WriteString("\n")
	}

	if r.Failed() {
		b.WriteString(fmt.Sprintf("FAILED: findings at or above %s threshold\n", r.FailOn))
	} else {
		b.WriteString("PASSED\n")
	}
	return b.String()
}
