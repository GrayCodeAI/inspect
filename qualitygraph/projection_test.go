package qualitygraph_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	graphcontracts "github.com/GrayCodeAI/hawk-core-contracts/graph"
	"github.com/GrayCodeAI/inspect"
	"github.com/GrayCodeAI/inspect/qualitygraph"
)

func TestBuildPrivacySafeDeterministicProjection(t *testing.T) {
	t.Parallel()

	observedAt := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	report := &inspect.Report{
		Target:      "https://private.example",
		CrawledURLs: 2,
		Duration:    1500 * time.Millisecond,
		FailOn:      inspect.SeverityMedium,
		Stats: inspect.Stats{
			PagesScanned:  2,
			FindingsTotal: 1,
		},
		Findings: []inspect.Finding{{
			Check:    "security",
			Severity: inspect.SeverityHigh,
			URL:      "https://private.example/admin?token=secret",
			Element:  `<form id="private">`,
			Message:  "sensitive finding message",
			Fix:      "private remediation",
			Evidence: "private response evidence",
		}},
	}
	opts := qualitygraph.Options{
		ObservedAt:    observedAt,
		Scope:         graphcontracts.Scope{RepositoryID: "inspect"},
		CorrelationID: "session-1",
	}

	first, err := qualitygraph.Build(report, opts)
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	second, err := qualitygraph.Build(report, opts)
	if err != nil {
		t.Fatalf("second Build() error = %v", err)
	}
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if string(firstJSON) != string(secondJSON) {
		t.Fatal("projection is not deterministic")
	}
	if len(first.Nodes) != 2 || len(first.Edges) != 1 || len(first.Events) != 2 {
		t.Fatalf("unexpected graph sizes: nodes=%d edges=%d events=%d",
			len(first.Nodes), len(first.Edges), len(first.Events))
	}
	if first.Edges[0].Kind != graphcontracts.EdgeContains {
		t.Fatalf("edge kind = %q, want %q", first.Edges[0].Kind, graphcontracts.EdgeContains)
	}
	for _, node := range first.Nodes {
		if err := node.Validate(); err != nil {
			t.Fatalf("invalid node: %v", err)
		}
	}
	for _, edge := range first.Edges {
		if err := edge.Validate(); err != nil {
			t.Fatalf("invalid edge: %v", err)
		}
	}
	for _, event := range first.Events {
		if err := event.Validate(); err != nil {
			t.Fatalf("invalid event: %v", err)
		}
	}

	payload := string(firstJSON)
	for _, secret := range []string{
		report.Target,
		report.Findings[0].URL,
		report.Findings[0].Element,
		report.Findings[0].Message,
		report.Findings[0].Fix,
		report.Findings[0].Evidence,
	} {
		if strings.Contains(payload, secret) {
			t.Fatalf("projection leaked sensitive value %q", secret)
		}
	}
}

func TestBuildBoundsFindings(t *testing.T) {
	t.Parallel()

	report := &inspect.Report{
		Target: "https://example.com",
		Findings: []inspect.Finding{
			{Check: "a", Severity: inspect.SeverityLow},
			{Check: "b", Severity: inspect.SeverityHigh},
		},
	}
	export, err := qualitygraph.Build(report, qualitygraph.Options{
		ObservedAt:  time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC),
		MaxFindings: 1,
	})
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	if len(export.Nodes) != 2 {
		t.Fatalf("nodes = %d, want report + one finding", len(export.Nodes))
	}
	var reportNode *graphcontracts.Node
	for i := range export.Nodes {
		if strings.HasPrefix(export.Nodes[i].ID, "inspect/report/") {
			reportNode = &export.Nodes[i]
		}
	}
	if reportNode == nil || reportNode.Attributes["truncated"] != "true" {
		t.Fatalf("expected truncated report node, got %+v", reportNode)
	}
}

func TestBuildRejectsNilReport(t *testing.T) {
	t.Parallel()

	if _, err := qualitygraph.Build(nil, qualitygraph.Options{}); err == nil {
		t.Fatal("expected nil report error")
	}
}
