// Command inspect-action is the CLI entry point for the inspect GitHub Action.
// It runs an audit against a target URL and outputs findings in the requested
// format (text, json, or sarif). Exits with code 1 when findings exceed the
// configured fail-on threshold.
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

func main() {
	var (
		checks      string
		depth       int
		format      string
		failOn      string
		concurrency int
		timeout     string
	)

	flag.StringVar(&checks, "checks", "links,security,forms,a11y,perf,seo", "Comma-separated checks to run")
	flag.IntVar(&depth, "depth", 5, "Maximum crawl depth")
	flag.StringVar(&format, "format", "text", "Output format: text, json, sarif")
	flag.StringVar(&failOn, "fail-on", "high", "Minimum severity to fail the action (info, low, medium, high, critical)")
	flag.IntVar(&concurrency, "concurrency", 10, "Concurrent workers")
	flag.StringVar(&timeout, "timeout", "5m", "Scan timeout (e.g. 5m, 10m)")
	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "error: URL argument is required\n")
		fmt.Fprintf(os.Stderr, "usage: inspect-action [flags] <url>\n")
		os.Exit(2)
	}
	url := args[0]

	dur, err := time.ParseDuration(timeout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: invalid timeout %q: %v\n", timeout, err)
		os.Exit(2)
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

	report, err := inspect.Scan(ctx, url, opts...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	// Format output
	var output string
	switch format {
	case "json":
		data, _ := json.MarshalIndent(report, "", "  ")
		output = string(data)
	case "sarif":
		output = inspect.GenerateSARIF(report.Findings, inspect.Version)
	default:
		output = formatText(report)
	}

	fmt.Print(output)

	// Write SARIF to file for GitHub Security tab upload
	if format == "sarif" {
		const sarifFile = "results.sarif"
		if err := os.WriteFile(sarifFile, []byte(output), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "warning: failed to write SARIF file: %v\n", err)
		}
	}

	// Set GitHub Actions outputs when running in GH Actions
	if ghOutput := os.Getenv("GITHUB_OUTPUT"); ghOutput != "" {
		f, err := os.OpenFile(ghOutput, os.O_APPEND|os.O_WRONLY, 0o644)
		if err == nil {
			fmt.Fprintf(f, "findings=%d\n", report.Stats.FindingsTotal)
			fmt.Fprintf(f, "max-severity=%s\n", report.MaxSeverity())
			fmt.Fprintf(f, "failed=%s\n", strconv.FormatBool(report.Failed()))
			if format == "sarif" {
				fmt.Fprintf(f, "sarif=results.sarif\n")
			}
			f.Close()
		}
	}

	// Exit with failure if threshold met
	if report.Failed() {
		os.Exit(1)
	}
}

func formatText(r *inspect.Report) string {
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
