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

func main() {
	var (
		url         string
		checks      string
		depth       int
		failOn      string
		concurrency int
		format      string
		timeout     string
		outputFile  string
	)

	flag.StringVar(&url, "url", "", "Target URL to audit")
	flag.StringVar(&checks, "checks", "links,security,forms,a11y,perf,seo", "Comma-separated checks")
	flag.IntVar(&depth, "depth", 5, "Maximum crawl depth")
	flag.StringVar(&failOn, "fail-on", "high", "Minimum severity to fail")
	flag.IntVar(&concurrency, "concurrency", 10, "Concurrent workers")
	flag.StringVar(&format, "format", "terminal", "Output format: terminal, json, junit")
	flag.StringVar(&timeout, "timeout", "5m", "Scan timeout")
	flag.StringVar(&outputFile, "output-file", "", "Write report to file")
	flag.Parse()

	if url == "" {
		fmt.Fprintf(os.Stderr, "error: --url is required\n")
		os.Exit(2)
	}

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

	// Output
	var output string
	switch format {
	case "json":
		data, _ := json.MarshalIndent(report, "", "  ")
		output = string(data)
	default:
		output = formatTerminal(report)
	}

	fmt.Println(output)

	// Write to file if requested
	if outputFile != "" {
		if err := os.WriteFile(outputFile, []byte(output), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "warning: failed to write report: %v\n", err)
		}
	}

	// GitHub Actions output
	if ghOutput := os.Getenv("GITHUB_OUTPUT"); ghOutput != "" {
		f, err := os.OpenFile(ghOutput, os.O_APPEND|os.O_WRONLY, 0644)
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

	// Exit with failure if threshold met
	if report.Failed() {
		os.Exit(1)
	}
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
