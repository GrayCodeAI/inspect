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

func TestToContractReport_FailOnThresholdTakesEffect(t *testing.T) {
	t.Parallel()

	base := func(sev Severity) *Report {
		return &Report{
			Target: "https://example.com",
			Findings: []Finding{
				{Check: "security", Severity: sev, URL: "https://example.com/", Message: "m"},
			},
			FailOn: SeverityMedium,
		}
	}

	low := ToContractReport(base(SeverityLow))
	if !low.FailOnSet {
		t.Fatal("converted report must record the threshold as explicitly set")
	}
	if low.Failed() {
		t.Fatal("low finding must not fail a Medium threshold")
	}

	high := ToContractReport(base(SeverityHigh))
	if !high.Failed() {
		t.Fatal("high finding must fail a Medium threshold")
	}
}
