// Package qualitygraph projects Inspect reports into the portable hawk-eco
// graph contract. Inspect remains the owner of scan execution and findings.
package qualitygraph

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	graphcontracts "github.com/GrayCodeAI/hawk-core-contracts/graph"
	"github.com/GrayCodeAI/inspect"
)

const (
	SchemaVersion = "inspect.graph/v1"
	defaultLimit  = 1000
)

// Export is a bounded, metadata-only quality graph projection.
type Export struct {
	SchemaVersion string                 `json:"schema_version"`
	GeneratedAt   time.Time              `json:"generated_at"`
	Scope         graphcontracts.Scope   `json:"scope,omitempty"`
	Nodes         []graphcontracts.Node  `json:"nodes"`
	Edges         []graphcontracts.Edge  `json:"edges"`
	Events        []graphcontracts.Event `json:"events"`
}

// Options supplies observation identity and tenancy scope. ObservedAt should be
// fixed by callers that require byte-for-byte deterministic exports.
type Options struct {
	ObservedAt      time.Time
	Scope           graphcontracts.Scope
	CorrelationID   string
	ProducerVersion string
	MaxFindings     int
}

// Build converts a completed Inspect report into a privacy-safe quality graph.
// URLs, targets, messages, elements, fixes, and evidence never enter attributes.
func Build(report *inspect.Report, opts Options) (*Export, error) {
	if report == nil {
		return nil, errors.New("qualitygraph: report is required")
	}
	observedAt := opts.ObservedAt.UTC()
	if observedAt.IsZero() {
		observedAt = time.Now().UTC()
	}
	limit := opts.MaxFindings
	if limit <= 0 || limit > defaultLimit {
		limit = defaultLimit
	}
	provenance := graphcontracts.Provenance{
		Producer: "inspect",
		Version:  strings.TrimSpace(opts.ProducerVersion),
	}

	reportDigest := digest(strings.TrimSpace(report.Target), observedAt.Format(time.RFC3339Nano))
	reportRef := graphcontracts.Ref{
		Kind: graphcontracts.NodeQuality,
		ID:   "inspect/report/" + reportDigest,
	}
	provenance.SourceID = reportDigest
	provenance.Evidence = []graphcontracts.ArtifactRef{{URI: "inspect://report/" + reportDigest}}

	selected := report.Findings
	if len(selected) > limit {
		selected = selected[:limit]
	}
	export := &Export{
		SchemaVersion: SchemaVersion,
		GeneratedAt:   observedAt,
		Scope:         opts.Scope,
		Nodes:         make([]graphcontracts.Node, 0, len(selected)+1),
		Edges:         make([]graphcontracts.Edge, 0, len(selected)),
		Events:        make([]graphcontracts.Event, 0, len(selected)+1),
	}
	reportNode := graphcontracts.Node{
		ID:         reportRef.ID,
		Kind:       reportRef.Kind,
		Scope:      opts.Scope,
		CreatedAt:  observedAt,
		Provenance: provenance,
		Attributes: map[string]string{
			"entity":             "report",
			"status":             reportStatus(report),
			"max_severity":       report.MaxSeverity().String(),
			"fail_on":            report.FailOn.String(),
			"pages_scanned":      strconv.Itoa(report.Stats.PagesScanned),
			"crawled_urls":       strconv.Itoa(report.CrawledURLs),
			"findings_total":     strconv.Itoa(report.Stats.FindingsTotal),
			"projected_findings": strconv.Itoa(len(selected)),
			"truncated":          strconv.FormatBool(len(report.Findings) > len(selected)),
			"duration_ms":        strconv.FormatInt(report.Duration.Milliseconds(), 10),
			"target_digest":      digest(strings.TrimSpace(report.Target)),
		},
	}
	if err := reportNode.Validate(); err != nil {
		return nil, fmt.Errorf("qualitygraph: report node: %w", err)
	}
	export.Nodes = append(export.Nodes, reportNode)
	export.Events = append(export.Events, observedEvent(reportRef, opts.Scope, observedAt, opts.CorrelationID, provenance))

	for index, finding := range selected {
		findingDigest := digest(
			reportRef.ID,
			strconv.Itoa(index),
			finding.Check,
			finding.Severity.String(),
			finding.URL,
			finding.Element,
			finding.Message,
			finding.Fix,
			finding.Evidence,
		)
		findingRef := graphcontracts.Ref{
			Kind: graphcontracts.NodeQuality,
			ID:   "inspect/finding/" + findingDigest,
		}
		findingProvenance := graphcontracts.Provenance{
			Producer: "inspect",
			Version:  strings.TrimSpace(opts.ProducerVersion),
			SourceID: findingDigest,
			Evidence: []graphcontracts.ArtifactRef{{URI: "inspect://finding/" + findingDigest}},
		}
		node := graphcontracts.Node{
			ID:         findingRef.ID,
			Kind:       findingRef.Kind,
			Scope:      opts.Scope,
			CreatedAt:  observedAt,
			Provenance: findingProvenance,
			Attributes: map[string]string{
				"entity":          "finding",
				"check":           strings.TrimSpace(finding.Check),
				"severity":        finding.Severity.String(),
				"url_digest":      digest(strings.TrimSpace(finding.URL)),
				"message_digest":  digest(strings.TrimSpace(finding.Message)),
				"element_digest":  digest(strings.TrimSpace(finding.Element)),
				"fix_digest":      digest(strings.TrimSpace(finding.Fix)),
				"evidence_digest": digest(strings.TrimSpace(finding.Evidence)),
			},
		}
		if err := node.Validate(); err != nil {
			return nil, fmt.Errorf("qualitygraph: finding[%d] node: %w", index, err)
		}
		export.Nodes = append(export.Nodes, node)

		edge := graphcontracts.Edge{
			ID:        "inspect/contains/" + digest(reportRef.ID, findingRef.ID),
			Kind:      graphcontracts.EdgeContains,
			From:      reportRef,
			To:        findingRef,
			Scope:     opts.Scope,
			CreatedAt: observedAt,
			Provenance: graphcontracts.Provenance{
				Producer: "inspect",
				Version:  strings.TrimSpace(opts.ProducerVersion),
				SourceID: findingDigest,
			},
		}
		if err := edge.Validate(); err != nil {
			return nil, fmt.Errorf("qualitygraph: finding[%d] edge: %w", index, err)
		}
		export.Edges = append(export.Edges, edge)
		export.Events = append(export.Events, observedEvent(
			findingRef, opts.Scope, observedAt, opts.CorrelationID, findingProvenance,
		))
	}

	sort.Slice(export.Nodes, func(i, j int) bool { return export.Nodes[i].ID < export.Nodes[j].ID })
	sort.Slice(export.Edges, func(i, j int) bool { return export.Edges[i].ID < export.Edges[j].ID })
	sort.Slice(export.Events, func(i, j int) bool { return export.Events[i].ID < export.Events[j].ID })
	return export, nil
}

func observedEvent(
	subject graphcontracts.Ref,
	scope graphcontracts.Scope,
	observedAt time.Time,
	correlationID string,
	provenance graphcontracts.Provenance,
) graphcontracts.Event {
	event := graphcontracts.Event{
		ID:             "inspect/observed/" + digest(subject.ID, observedAt.Format(time.RFC3339Nano)),
		Type:           graphcontracts.EventObserved,
		Subject:        subject,
		Scope:          scope,
		OccurredAt:     observedAt,
		CorrelationID:  strings.TrimSpace(correlationID),
		IdempotencyKey: digest(subject.ID, observedAt.Format(time.RFC3339Nano)),
		Provenance:     provenance,
	}
	return event
}

func reportStatus(report *inspect.Report) string {
	if report.Failed() {
		return "failed"
	}
	return "passed"
}

func digest(parts ...string) string {
	hash := sha256.New()
	for _, part := range parts {
		_, _ = hash.Write([]byte(strconv.Itoa(len(part))))
		_, _ = hash.Write([]byte{':'})
		_, _ = hash.Write([]byte(part))
	}
	return hex.EncodeToString(hash.Sum(nil))
}
