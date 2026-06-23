package inspect

import verifycontracts "github.com/GrayCodeAI/hawk-core-contracts/verify"

// ToContractFinding converts an inspect finding into the shared verification contract.
func ToContractFinding(f Finding) verifycontracts.Finding {
	return verifycontracts.Finding{
		Check:    f.Check,
		Severity: f.Severity,
		URL:      f.URL,
		Element:  f.Element,
		Message:  f.Message,
		Fix:      f.Fix,
		Evidence: f.Evidence,
	}
}

// ToContractFindings converts inspect findings into shared verification contracts.
func ToContractFindings(findings []Finding) []verifycontracts.Finding {
	if len(findings) == 0 {
		return nil
	}
	out := make([]verifycontracts.Finding, len(findings))
	for i, f := range findings {
		out[i] = ToContractFinding(f)
	}
	return out
}

func toContractStats(s Stats) verifycontracts.Stats {
	return verifycontracts.Stats{
		PagesScanned:     s.PagesScanned,
		FindingsTotal:    s.FindingsTotal,
		BySeverity:       s.BySeverity,
		ByCheck:          s.ByCheck,
		DurationPerCheck: s.DurationPerCheck,
	}
}

// ToContractReport converts an inspect report into the shared verification contract.
func ToContractReport(r *Report) *verifycontracts.Report {
	if r == nil {
		return nil
	}
	return &verifycontracts.Report{
		Target:      r.Target,
		Findings:    ToContractFindings(r.Findings),
		Stats:       toContractStats(r.Stats),
		CrawledURLs: r.CrawledURLs,
		Duration:    r.Duration,
		FailOn:      r.FailOn,
	}
}
