package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"

	"github.com/GrayCodeAI/inspect"
)

// Server wraps the inspect library as an MCP server, exposing website
// auditing capabilities to any MCP-compatible agent.
type Server struct {
	server  *mcpserver.MCPServer
	scanner *inspect.Scanner
}

// New creates an inspect MCP server with the given scanner options.
func New(opts ...inspect.Option) *Server {
	s := &Server{
		scanner: inspect.NewScanner(opts...),
	}
	s.server = mcpserver.NewMCPServer(
		"inspect", "0.2.0",
		mcpserver.WithToolCapabilities(true),
	)
	s.registerTools()
	return s
}

// ServeStdio starts the MCP server on stdin/stdout.
func (s *Server) ServeStdio() error {
	stdio := mcpserver.NewStdioServer(s.server)
	return stdio.Listen(context.Background(), os.Stdin, os.Stdout)
}

func (s *Server) registerTools() {
	s.server.AddTool(mcplib.NewTool(
		"inspect_scan",
		mcplib.WithDescription("Scan a website for broken links, security issues, and accessibility problems"),
		mcplib.WithString("url", mcplib.Required(), mcplib.Description("Target URL to scan")),
	), s.handleScan)

	s.server.AddTool(mcplib.NewTool(
		"inspect_scan_dir",
		mcplib.WithDescription("Scan a local directory of HTML files"),
		mcplib.WithString("path", mcplib.Required(), mcplib.Description("Local directory path")),
	), s.handleScanDir)
}

func (s *Server) handleScan(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	url := strArg(req, "url")
	if url == "" {
		return mcplib.NewToolResultError("url is required"), nil
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	report, err := s.scanner.Scan(ctx, url)
	if err != nil {
		return mcplib.NewToolResultError(fmt.Sprintf("scan failed: %v", err)), nil
	}

	b, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return nil, err
	}
	return mcplib.NewToolResultText(string(b)), nil
}

func (s *Server) handleScanDir(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	path := strArg(req, "path")
	if path == "" {
		return mcplib.NewToolResultError("path is required"), nil
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	report, err := s.scanner.ScanDir(ctx, path)
	if err != nil {
		return mcplib.NewToolResultError(fmt.Sprintf("scan_dir failed: %v", err)), nil
	}

	b, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return nil, err
	}
	return mcplib.NewToolResultText(string(b)), nil
}

func strArg(req mcplib.CallToolRequest, key string) string {
	if v, ok := req.GetArguments()[key].(string); ok {
		return v
	}
	return ""
}
