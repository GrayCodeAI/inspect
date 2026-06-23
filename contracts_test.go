package inspect

import "testing"

func TestToContractReport(t *testing.T) {
	t.Parallel()

	report := &Report{
		Target:      "https://example.com",
		CrawledURLs: 3,
		Findings: []Finding{
			{
				Check:    "security",
				Severity: SeverityHigh,
				URL:      "https://example.com/login",
				Message:  "missing header",
			},
		},
		Stats: Stats{
			PagesScanned:  2,
			FindingsTotal: 1,
			BySeverity:    map[Severity]int{SeverityHigh: 1},
			ByCheck:       map[string]int{"security": 1},
		},
		FailOn: SeverityMedium,
	}

	got := ToContractReport(report)
	if got == nil {
		t.Fatal("expected non-nil contract report")
	}
	if got.Target != report.Target {
		t.Fatalf("Target = %q, want %q", got.Target, report.Target)
	}
	if got.Stats.PagesScanned != 2 {
		t.Fatalf("PagesScanned = %d, want 2", got.Stats.PagesScanned)
	}
	if len(got.Findings) != 1 || got.Findings[0].URL != "https://example.com/login" {
		t.Fatalf("unexpected findings conversion: %+v", got.Findings)
	}
}
