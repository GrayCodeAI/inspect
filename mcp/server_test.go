package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"

	"github.com/GrayCodeAI/inspect"
)

func TestHandleScan_EmptyURL(t *testing.T) {
	s := New(inspect.Quick)
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ""}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
	// Should be an error result
	for _, c := range result.Content {
		if tc, ok := c.(mcplib.TextContent); ok {
			if tc.Text == "" {
				t.Fatal("expected error message")
			}
		}
	}
}

func TestHandleScan_HTTPTest(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Test</title></head><body>
			<a href="/broken-link">Broken</a>
			<img src="/missing.png">
		</body></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick)
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}

	// Parse JSON response
	for _, c := range result.Content {
		if tc, ok := c.(mcplib.TextContent); ok {
			var report inspect.Report
			if err := json.Unmarshal([]byte(tc.Text), &report); err != nil {
				t.Fatalf("expected valid JSON report: %v", err)
			}
			if report.Target != ts.URL {
				t.Fatalf("expected target=%s, got %s", ts.URL, report.Target)
			}
		}
	}
}

func TestHandleScanDir(t *testing.T) {
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	if err := os.WriteFile(indexPath, []byte(`<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>`), 0o644); err != nil {
		t.Fatal(err)
	}

	s := New(inspect.Quick)
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"path": dir}

	result, err := s.handleScanDir(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}

	for _, c := range result.Content {
		if tc, ok := c.(mcplib.TextContent); ok {
			var report inspect.Report
			if err := json.Unmarshal([]byte(tc.Text), &report); err != nil {
				t.Fatalf("expected valid JSON report: %v", err)
			}
		}
	}
}

func TestHandleScan_WithDepth(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Test</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick)
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL, "depth": float64(1)}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
}
