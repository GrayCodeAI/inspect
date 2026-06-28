package inspect_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/GrayCodeAI/inspect"
)

const goFixture = `package example

type Handler struct {
	path string
}

func NewHandler(path string) *Handler {
	return &Handler{path: path}
}

func (h *Handler) ServeHTTP(w interface{}, r interface{}) {}

const MaxConns = 100
var DefaultTimeout = 30
`

func writeTempFile(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path
}

func TestSearchBySymbol_AllSymbols(t *testing.T) {
	path := writeTempFile(t, "example.go", goFixture)
	results, err := inspect.SearchBySymbol(path, "", "")
	if err != nil {
		t.Fatalf("SearchBySymbol: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected symbols, got none")
	}
}

func TestSearchBySymbol_NameFilter(t *testing.T) {
	path := writeTempFile(t, "example.go", goFixture)
	results, err := inspect.SearchBySymbol(path, "Handler", "")
	if err != nil {
		t.Fatalf("SearchBySymbol: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected at least one Handler symbol")
	}
}

func TestGetSymbolBody_Found(t *testing.T) {
	path := writeTempFile(t, "example.go", goFixture)
	result, err := inspect.GetSymbolBody(path, "NewHandler")
	if err != nil {
		t.Fatalf("GetSymbolBody: %v", err)
	}
	if result.Body == "" {
		t.Error("body must not be empty")
	}
}

func TestGetSymbolBody_NotFound(t *testing.T) {
	path := writeTempFile(t, "example.go", goFixture)
	_, err := inspect.GetSymbolBody(path, "DoesNotExist")
	if err == nil {
		t.Error("expected error for missing symbol")
	}
}
