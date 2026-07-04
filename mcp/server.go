package mcp

import (
	"context"
	"fmt"
	"time"

	mcpkit "github.com/GrayCodeAI/hawk-mcpkit"
	mcplib "github.com/mark3labs/mcp-go/mcp"

	"github.com/GrayCodeAI/inspect"
)

// Server wraps the inspect library as an MCP server, exposing website
// auditing capabilities to any MCP-compatible agent.
type Server struct {
	kit     *mcpkit.Server
	scanner *inspect.Scanner
}

// New creates an inspect MCP server with the given scanner options.
func New(opts ...inspect.Option) *Server {
	s := &Server{
		kit:     mcpkit.New("inspect", inspect.Version),
		scanner: inspect.NewScanner(opts...),
	}
	s.registerTools()
	return s
}

// ServeStdio starts the MCP server on stdin/stdout.
func (s *Server) ServeStdio() error {
	return s.kit.ServeStdio()
}

// ServeHTTP starts the MCP server on a streamable HTTP endpoint. Clients
// connect to http://<addr>/mcp.
func (s *Server) ServeHTTP(addr string) error {
	return s.kit.ServeHTTP(addr)
}

func (s *Server) registerTools() {
	s.kit.AddTool(mcplib.NewTool(
		"inspect_scan",
		mcplib.WithDescription("Scan a website for broken links, security issues, and accessibility problems"),
		mcplib.WithString("url", mcplib.Required(), mcplib.Description("Target URL to scan")),
	), s.handleScan)

	s.kit.AddTool(mcplib.NewTool(
		"inspect_scan_dir",
		mcplib.WithDescription("Scan a local directory of HTML files"),
		mcplib.WithString("path", mcplib.Required(), mcplib.Description("Local directory path")),
	), s.handleScanDir)
}

func (s *Server) handleScan(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	url := mcpkit.StrArg(req, "url")
	if url == "" {
		return mcplib.NewToolResultError("url is required"), nil
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	report, err := s.scanner.Scan(ctx, url)
	if err != nil {
		return mcplib.NewToolResultError(fmt.Sprintf("scan failed: %v", err)), nil
	}
	return mcpkit.JSONResult(report)
}

func (s *Server) handleScanDir(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	path := mcpkit.StrArg(req, "path")
	if path == "" {
		return mcplib.NewToolResultError("path is required"), nil
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	report, err := s.scanner.ScanDir(ctx, path)
	if err != nil {
		return mcplib.NewToolResultError(fmt.Sprintf("scan_dir failed: %v", err)), nil
	}
	return mcpkit.JSONResult(report)
}
