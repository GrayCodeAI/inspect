// Package qualitygraph provides graph-based code quality analysis.
package qualitygraph

import (
	"fmt"
	"sort"
	"sync"
	"time"

	graphcontracts "github.com/GrayCodeAI/hawk-core-contracts/graph"
)

// QualityMetric represents a code quality metric.
type QualityMetric struct {
	Name      string    `json:"name"`
	Value     float64   `json:"value"`
	Threshold float64   `json:"threshold"`
	Status    string    `json:"status"` // "pass", "warn", "fail"
	UpdatedAt time.Time `json:"updated_at"`
}

// QualityNode represents a code element with quality metrics.
type QualityNode struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"` // "file", "function", "module", "package"
	Path     string                 `json:"path"`
	Metrics  []QualityMetric        `json:"metrics"`
	Children []string               `json:"children,omitempty"`
	Attrs    map[string]interface{} `json:"attrs,omitempty"`
}

// QualityEdge represents a quality relationship between code elements.
type QualityEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Kind   string `json:"kind"`   // "depends_on", "imports", "calls", "tests"
	Weight float64 `json:"weight"`
}

// QualityGraph represents a code quality graph.
type QualityGraph struct {
	mu    sync.RWMutex
	nodes map[string]*QualityNode
	edges []QualityEdge
}

// NewQualityGraph creates a new quality graph.
func NewQualityGraph() *QualityGraph {
	return &QualityGraph{
		nodes: make(map[string]*QualityNode),
	}
}

// AddNode adds a quality node to the graph.
func (g *QualityGraph) AddNode(node *QualityNode) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.nodes[node.ID] = node
}

// AddEdge adds a quality edge to the graph.
func (g *QualityGraph) AddEdge(edge QualityEdge) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.edges = append(g.edges, edge)
}

// GetNode retrieves a node by ID.
func (g *QualityGraph) GetNode(id string) (*QualityNode, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	node, ok := g.nodes[id]
	return node, ok
}

// GetNodes returns all nodes.
func (g *QualityGraph) GetNodes() []*QualityNode {
	g.mu.RLock()
	defer g.mu.RUnlock()
	result := make([]*QualityNode, 0, len(g.nodes))
	for _, node := range g.nodes {
		result = append(result, node)
	}
	return result
}

// GetEdges returns all edges.
func (g *QualityGraph) GetEdges() []QualityEdge {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.edges
}

// FindByPath finds a node by its file path.
func (g *QualityGraph) FindByPath(path string) []*QualityNode {
	g.mu.RLock()
	defer g.mu.RUnlock()
	result := []*QualityNode{}
	for _, node := range g.nodes {
		if node.Path == path {
			result = append(result, node)
		}
	}
	return result
}

// GetMetricsByType returns all metrics of a specific type.
func (g *QualityGraph) GetMetricsByType(metricType string) []QualityMetric {
	g.mu.RLock()
	defer g.mu.RUnlock()
	result := []QualityMetric{}
	for _, node := range g.nodes {
		for _, metric := range node.Metrics {
			if metric.Name == metricType {
				result = append(result, metric)
			}
		}
	}
	return result
}

// GetFailedMetrics returns all metrics that failed their threshold.
func (g *QualityGraph) GetFailedMetrics() []QualityMetric {
	g.mu.RLock()
	defer g.mu.RUnlock()
	result := []QualityMetric{}
	for _, node := range g.nodes {
		for _, metric := range node.Metrics {
			if metric.Status == "fail" {
				result = append(result, metric)
			}
		}
	}
	return result
}

// GetTopIssues returns the top N issues by severity.
func (g *QualityGraph) GetTopIssues(n int) []QualityMetric {
	failed := g.GetFailedMetrics()
	sort.Slice(failed, func(i, j int) bool {
		return failed[i].Value > failed[j].Value
	})
	if len(failed) > n {
		failed = failed[:n]
	}
	return failed
}

// ToGraphSpec converts the quality graph to a portable graph spec.
func (g *QualityGraph) ToGraphSpec() *graphcontracts.GraphSpec {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodes := make([]graphcontracts.NodeSpec, 0, len(g.nodes))
	for id, node := range g.nodes {
		config := map[string]string{
			"path":     node.Path,
			"type":     node.Type,
			"metrics":  fmt.Sprintf("%d", len(node.Metrics)),
		}
		for _, m := range node.Metrics {
			config["metric_"+m.Name] = fmt.Sprintf("%.2f", m.Value)
		}

		nodes = append(nodes, graphcontracts.NodeSpec{
			ID:     id,
			Type:   graphcontracts.NodeTypeQuality,
			Name:   node.Path,
			Config: config,
		})
	}

	edges := make([]graphcontracts.EdgeSpec, 0, len(g.edges))
	for _, edge := range g.edges {
		edges = append(edges, graphcontracts.EdgeSpec{
			From:   edge.From,
			To:     edge.To,
			Weight: edge.Weight,
		})
	}

	return &graphcontracts.GraphSpec{
		ID:     "quality-graph",
		Name:   "Code Quality Graph",
		Nodes:  nodes,
		Edges:  edges,
	}
}

// Export exports the quality graph as a portable format.
func (g *QualityGraph) Export() map[string]interface{} {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodes := make([]map[string]interface{}, 0, len(g.nodes))
	for _, node := range g.nodes {
		metrics := make([]map[string]interface{}, 0, len(node.Metrics))
		for _, m := range node.Metrics {
			metrics = append(metrics, map[string]interface{}{
				"name":      m.Name,
				"value":     m.Value,
				"threshold": m.Threshold,
				"status":    m.Status,
			})
		}

		nodes = append(nodes, map[string]interface{}{
			"id":       node.ID,
			"type":     node.Type,
			"path":     node.Path,
			"metrics":  metrics,
			"children": node.Children,
		})
	}

	edges := make([]map[string]interface{}, 0, len(g.edges))
	for _, edge := range g.edges {
		edges = append(edges, map[string]interface{}{
			"from":   edge.From,
			"to":     edge.To,
			"kind":   edge.Kind,
			"weight": edge.Weight,
		})
	}

	return map[string]interface{}{
		"nodes": nodes,
		"edges": edges,
	}
}
