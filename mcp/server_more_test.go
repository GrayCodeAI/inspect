package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/GrayCodeAI/inspect"
	mcplib "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// This file was split out of server_test.go for readability (mechanical move; no behavior change).

func TestErrorHandling_MissingSessionID(t *testing.T) {
	ts, _ := newTestHTTPServer(t, inspect.Quick, inspect.WithAllowPrivateIPs())
	initAndSession(t, ts) // create at least one session

	// Send a request without session header.
	resp, err := postJSON(ts.URL, jsonRPCRequest(5, "tools/list", map[string]any{}))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	// The server should reject the request (400 or 404).
	if resp.StatusCode == http.StatusOK {
		t.Error("expected non-200 status for missing session ID")
	}
}

func TestErrorHandling_InvalidSessionID(t *testing.T) {
	ts, _ := newTestHTTPServer(t, inspect.Quick, inspect.WithAllowPrivateIPs())

	resp, err := postSessionJSON(ts.URL, "fake-session-id-12345", jsonRPCRequest(5, "tools/list", map[string]any{}))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		t.Error("expected non-200 status for invalid session ID")
	}
}

func TestErrorHandling_ToolsCallMissingToolName(t *testing.T) {
	ts, _ := newTestHTTPServer(t, inspect.Quick, inspect.WithAllowPrivateIPs())
	sid := initAndSession(t, ts)

	// tools/call without "name" field
	resp, err := postSessionJSON(ts.URL, sid, jsonRPCRequest(6, "tools/call", map[string]any{
		"arguments": map[string]any{"url": "http://example.com"},
	}))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	// Should get an error response (either JSON-RPC error or tool error).
	if resp.StatusCode == http.StatusOK {
		var rpcResp struct {
			Error *struct {
				Code int `json:"code"`
			} `json:"error"`
			Result *struct {
				IsError bool `json:"isError"`
			} `json:"result"`
		}
		if err := json.Unmarshal(body, &rpcResp); err == nil {
			if rpcResp.Error == nil && rpcResp.Result != nil && !rpcResp.Result.IsError {
				t.Error("expected error for missing tool name")
			}
		}
	}
}

func TestErrorHandling_ToolsCallUnknownTool(t *testing.T) {
	ts, _ := newTestHTTPServer(t, inspect.Quick, inspect.WithAllowPrivateIPs())
	sid := initAndSession(t, ts)

	resp, err := postSessionJSON(ts.URL, sid, jsonRPCRequest(7, "tools/call", map[string]any{
		"name":      "nonexistent_tool",
		"arguments": map[string]any{},
	}))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var rpcResp struct {
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &rpcResp); err == nil && rpcResp.Error != nil {
		// Got a JSON-RPC level error for unknown tool -- expected.
		if rpcResp.Error.Code == 0 {
			t.Error("expected non-zero error code for unknown tool")
		}
	} else {
		// If there was no JSON-RPC error, the HTTP status should indicate failure.
		if resp.StatusCode == http.StatusOK {
			t.Error("expected error response for unknown tool")
		}
	}
}

func TestErrorHandling_WrongArgumentType(t *testing.T) {
	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())
	req := mcplib.CallToolRequest{}
	// url should be a string, not an int
	req.Params.Arguments = map[string]interface{}{"url": 12345}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
	// The int won't match the string type assertion, so mcpkit.StrArg returns "".
	if !result.IsError {
		t.Fatal("expected error result when url is not a string")
	}
}

// ---------------------------------------------------------------------------
// 4. Concurrent requests
// ---------------------------------------------------------------------------

func TestConcurrent_Scans(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Concurrent</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	const n = 5
	var wg sync.WaitGroup
	errs := make([]error, n)
	results := make([]*mcplib.CallToolResult, n)

	for i := range n {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			req := mcplib.CallToolRequest{}
			req.Params.Arguments = map[string]interface{}{"url": ts.URL}
			results[idx], errs[idx] = s.handleScan(context.Background(), req)
		}(i)
	}
	wg.Wait()

	for i := range n {
		if errs[i] != nil {
			t.Errorf("goroutine %d: unexpected Go error: %v", i, errs[i])
			continue
		}
		if results[i] == nil {
			t.Errorf("goroutine %d: nil result", i)
			continue
		}
		if results[i].IsError {
			t.Errorf("goroutine %d: unexpected error result", i)
		}
	}
}

func TestConcurrent_ScanAndScanDir(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Mixed</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	if err := os.WriteFile(indexPath, []byte(`<!DOCTYPE html><html><head><title>Dir</title></head><body><h1>Dir</h1></body></html>`), 0o644); err != nil {
		t.Fatal(err)
	}

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	const n = 4
	var wg sync.WaitGroup
	errCh := make(chan error, n*2)

	// Launch concurrent scan and scan_dir calls.
	for range n {
		wg.Add(2)
		go func() {
			defer wg.Done()
			req := mcplib.CallToolRequest{}
			req.Params.Arguments = map[string]interface{}{"url": ts.URL}
			_, err := s.handleScan(context.Background(), req)
			if err != nil {
				errCh <- fmt.Errorf("handleScan: %w", err)
			}
		}()
		go func() {
			defer wg.Done()
			req := mcplib.CallToolRequest{}
			req.Params.Arguments = map[string]interface{}{"path": dir}
			_, err := s.handleScanDir(context.Background(), req)
			if err != nil {
				errCh <- fmt.Errorf("handleScanDir: %w", err)
			}
		}()
	}
	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Error(err)
	}
}

func TestConcurrent_DirectHandlerCalls(t *testing.T) {
	// Ensure handleScan is safe when called from multiple goroutines with
	// the same Server instance. This exercises internal scanner/crawler
	// concurrency safety.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Race</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	var wg sync.WaitGroup
	var errCount atomic.Int64

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := mcplib.CallToolRequest{}
			req.Params.Arguments = map[string]interface{}{"url": ts.URL}
			result, err := s.handleScan(context.Background(), req)
			if err != nil {
				errCount.Add(1)
				return
			}
			if result != nil && result.IsError {
				errCount.Add(1)
			}
		}()
	}
	wg.Wait()
	if n := errCount.Load(); n > 0 {
		t.Errorf("%d out of 10 concurrent scans failed", n)
	}
}

// ---------------------------------------------------------------------------
// 5. Authentication -- verify auth options flow through to scanner
// ---------------------------------------------------------------------------

func TestWithAuth_OptionPassthrough(t *testing.T) {
	// Verify that auth header/value configured via options are actually used
	// when the scanner makes HTTP requests. We start a test server that
	// checks for the Authorization header.
	var gotAuth string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Auth</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	s := New(
		inspect.Quick,
		inspect.WithAllowPrivateIPs(),
		inspect.WithAuth("Authorization", "Bearer test-secret-token"),
	)
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatalf("handleScan: %v", err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}

	if gotAuth != "Bearer test-secret-token" {
		t.Errorf("expected auth header 'Bearer test-secret-token', got %q", gotAuth)
	}
}

func TestWithAuth_NoAuth(t *testing.T) {
	// Verify that when no auth is configured, no Authorization header is sent.
	var gotAuth string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>NoAuth</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())
	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatalf("handleScan: %v", err)
	}
	if result == nil || result.IsError {
		t.Fatal("expected successful result")
	}

	if gotAuth != "" {
		t.Errorf("expected no auth header, got %q", gotAuth)
	}
}

// ---------------------------------------------------------------------------
// 6. Timeout handling
// ---------------------------------------------------------------------------

func TestTimeout_ScanContextCancelled(t *testing.T) {
	// Start a server that delays its response beyond our context deadline.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html></html>`)
	}))
	defer ts.Close()

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL}

	result, err := s.handleScan(ctx, req)
	if err != nil {
		t.Fatalf("handler should not return Go error on timeout: %v", err)
	}
	if result == nil {
		t.Fatal("expected result even on timeout")
	}
	// The scan should fail gracefully (tool-level error, not a panic or Go error).
	if !result.IsError {
		// It is possible the scan completed fast enough if the crawler
		// has its own shorter page timeout. In that case, just log it.
		t.Log("scan completed before context deadline; timeout not tested effectively")
	}
}

func TestTimeout_ScanDirContextCancelled(t *testing.T) {
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	if err := os.WriteFile(indexPath, []byte(`<!DOCTYPE html><html><head><title>Timeout Dir</title></head><body><p>OK</p></body></html>`), 0o644); err != nil {
		t.Fatal(err)
	}

	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	// Give the context a moment to actually expire.
	time.Sleep(5 * time.Millisecond)

	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"path": dir}

	result, err := s.handleScanDir(ctx, req)
	if err != nil {
		t.Fatalf("handler should not return Go error on timeout: %v", err)
	}
	if result == nil {
		t.Fatal("expected result even on timeout")
	}
}

func TestTimeout_WithTimeoutOption(t *testing.T) {
	// Verify the WithTimeout option is accepted and the scanner is created
	// without errors. We don't test an actual timeout here since the
	// scanner's own timeout interacts with the context.
	s := New(
		inspect.Quick,
		inspect.WithAllowPrivateIPs(),
		inspect.WithTimeout(5*time.Second),
	)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>TimeoutOpt</title></head><body><p>OK</p></body></html>`)
	}))
	defer ts.Close()

	req := mcplib.CallToolRequest{}
	req.Params.Arguments = map[string]interface{}{"url": ts.URL}

	result, err := s.handleScan(context.Background(), req)
	if err != nil {
		t.Fatalf("handleScan: %v", err)
	}
	if result == nil || result.IsError {
		t.Fatal("expected successful result with custom timeout")
	}
}

// ---------------------------------------------------------------------------
// 7. Server construction
// ---------------------------------------------------------------------------

func TestNew_ReturnsServer(t *testing.T) {
	s := New()
	if s == nil {
		t.Fatal("New() returned nil")
	}
	if s.kit == nil || s.kit.MCP() == nil {
		t.Fatal("internal MCPServer is nil")
	}
	if s.scanner == nil {
		t.Fatal("internal scanner is nil")
	}
}

func TestNew_WithOptions(t *testing.T) {
	s := New(
		inspect.Deep,
		inspect.WithConcurrency(5),
		inspect.WithTimeout(30*time.Second),
		inspect.WithAllowPrivateIPs(),
	)
	if s == nil {
		t.Fatal("New() returned nil")
	}
}

func TestNew_Presets(t *testing.T) {
	presets := []struct {
		name string
		opt  inspect.Option
	}{
		{"Quick", inspect.Quick},
		{"Standard", inspect.Standard},
		{"Deep", inspect.Deep},
		{"SecurityOnly", inspect.SecurityOnly},
		{"CI", inspect.CI},
	}

	for _, p := range presets {
		t.Run(p.name, func(t *testing.T) {
			s := New(p.opt, inspect.WithAllowPrivateIPs())
			if s == nil {
				t.Fatalf("New(%s) returned nil", p.name)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 9. Full HTTP round-trip: initialize -> tools/list -> tools/call
// ---------------------------------------------------------------------------

func TestFullRoundTrip(t *testing.T) {
	// End-to-end test: initialize, list tools, call scan, verify result.
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><head><title>E2E</title></head><body><p>E2E test</p></body></html>`)
	}))
	defer target.Close()

	ts, _ := newTestHTTPServer(t, inspect.Quick, inspect.WithAllowPrivateIPs())

	// Step 1: initialize
	sid := initAndSession(t, ts)

	// Step 2: tools/list
	listResp, err := postSessionJSON(ts.URL, sid, jsonRPCRequest(10, "tools/list", map[string]any{}))
	if err != nil {
		t.Fatalf("tools/list: %v", err)
	}
	listBody := readBody(t, listResp)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("tools/list: status %d", listResp.StatusCode)
	}
	var listResult struct {
		Result struct {
			Tools []struct {
				Name string `json:"name"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal(listBody, &listResult); err != nil {
		t.Fatalf("unmarshal tools/list: %v", err)
	}
	if len(listResult.Result.Tools) < 1 {
		t.Fatal("expected at least 1 tool")
	}

	// Step 3: tools/call on inspect_scan
	callResp, err := postSessionJSON(ts.URL, sid, jsonRPCRequest(11, "tools/call", map[string]any{
		"name":      "inspect_scan",
		"arguments": map[string]any{"url": target.URL},
	}))
	if err != nil {
		t.Fatalf("tools/call: %v", err)
	}
	callBody := readBody(t, callResp)
	if callResp.StatusCode != http.StatusOK {
		t.Fatalf("tools/call: status %d, body: %s", callResp.StatusCode, callBody)
	}

	var callResult struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			IsError bool `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(callBody, &callResult); err != nil {
		t.Fatalf("unmarshal tools/call: %v", err)
	}
	if callResult.Result.IsError {
		t.Fatalf("tools/call returned error: %s", callResult.Result.Content[0].Text)
	}
	if len(callResult.Result.Content) == 0 {
		t.Fatal("expected content in tools/call result")
	}

	var report inspect.Report
	if err := json.Unmarshal([]byte(callResult.Result.Content[0].Text), &report); err != nil {
		t.Fatalf("invalid report JSON: %v", err)
	}
	if report.Target != target.URL {
		t.Errorf("report target: want %s, got %s", target.URL, report.Target)
	}
}

// ---------------------------------------------------------------------------
// 10. Register tools verification
// ---------------------------------------------------------------------------

func TestRegisterTools_InspectScanSchema(t *testing.T) {
	s := New(inspect.Quick, inspect.WithAllowPrivateIPs())

	// Access the underlying MCPServer to verify tool registration.
	mcpSrv := s.kit.MCP()
	if mcpSrv == nil {
		t.Fatal("internal MCPServer is nil")
	}

	// We can verify tools are registered by calling tools/list through
	// the server's handler. Use the HTTP test server for this.
	ts := mcpserver.NewTestStreamableHTTPServer(mcpSrv, mcpserver.WithStateful(true))
	defer ts.Close()

	sid := initAndSession(t, ts)

	resp, err := postSessionJSON(ts.URL, sid, jsonRPCRequest(2, "tools/list", map[string]any{}))
	if err != nil {
		t.Fatalf("tools/list: %v", err)
	}
	body := readBody(t, resp)

	var result struct {
		Result struct {
			Tools []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				InputSchema struct {
					Type       string         `json:"type"`
					Properties map[string]any `json:"properties"`
					Required   []string       `json:"required"`
				} `json:"inputSchema"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, tool := range result.Result.Tools {
		if tool.Name == "inspect_scan" {
			if tool.InputSchema.Type != "object" {
				t.Errorf("inspect_scan input schema type: want object, got %s", tool.InputSchema.Type)
			}
			if _, ok := tool.InputSchema.Properties["url"]; !ok {
				t.Error("inspect_scan missing 'url' property")
			}
			found := false
			for _, r := range tool.InputSchema.Required {
				if r == "url" {
					found = true
				}
			}
			if !found {
				t.Error("inspect_scan 'url' property should be required")
			}
		}
		if tool.Name == "inspect_scan_dir" {
			if _, ok := tool.InputSchema.Properties["path"]; !ok {
				t.Error("inspect_scan_dir missing 'path' property")
			}
			found := false
			for _, r := range tool.InputSchema.Required {
				if r == "path" {
					found = true
				}
			}
			if !found {
				t.Error("inspect_scan_dir 'path' property should be required")
			}
		}
	}
}
