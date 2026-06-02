package main

import (
	"context"
	"fmt"
	"log"

	"github.com/GrayCodeAI/inspect"
)

func main() {
	report, err := inspect.Scan(context.Background(), "https://example.com", inspect.Quick)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Scanned %d pages\n", len(report.Pages))
	fmt.Printf("Found %d findings:\n", len(report.Findings))
	
	for _, f := range report.Findings {
		fmt.Printf("[%s] %s: %s\n", f.Severity, f.URL, f.Message)
	}

	if report.Failed() {
		fmt.Println("Scan failed - critical issues found")
	} else {
		fmt.Println("Scan passed")
	}
}
