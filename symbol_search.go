package inspect

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// SymbolResult is a symbol found in a source file via AST-level search.
// The same API as sight.SymbolResult so hawk can use a uniform interface
// across both analysis engines.
type SymbolResult struct {
	File      string `json:"file"`
	Symbol    string `json:"symbol"`
	Kind      string `json:"kind"` // function, method, type, class, const, var
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
	Body      string `json:"body,omitempty"`
}

// SearchBySymbol returns all symbols in filePath whose name contains
// nameFragment (case-insensitive). An empty nameFragment returns all symbols.
// An optional kind filter ("function", "method", "type", etc.) restricts results.
//
// inspect's SymbolSearch is used during the localization phase to identify
// which functions and types are involved in a dependency or API-security finding,
// so hawk can fetch only the relevant bodies rather than entire files.
func SearchBySymbol(filePath, nameFragment, kind string) ([]SymbolResult, error) {
	ext := filepath.Ext(filePath)
	patterns := symbolPatternsForExt(ext)
	if len(patterns) == 0 {
		return nil, nil
	}

	lines, err := readLines(filePath)
	if err != nil {
		return nil, fmt.Errorf("inspect.SearchBySymbol: %w", err)
	}

	fragLower := strings.ToLower(nameFragment)
	kindLower := strings.ToLower(kind)

	var results []SymbolResult
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		for _, pat := range patterns {
			m := pat.re.FindStringSubmatch(trimmed)
			if m == nil {
				continue
			}
			sym := extractSymbolName(m, pat.kind, ext)
			if fragLower != "" && !strings.Contains(strings.ToLower(sym), fragLower) {
				break
			}
			if kindLower != "" && pat.kind != kindLower {
				break
			}

			startLine := i + 1
			endLine := estimateEndLine(lines, i)

			results = append(results, SymbolResult{
				File:      filePath,
				Symbol:    sym,
				Kind:      pat.kind,
				StartLine: startLine,
				EndLine:   endLine,
			})
			break
		}
	}
	return results, nil
}

// GetSymbolBody returns the source text of the first symbol in filePath
// whose name matches fqn (case-insensitive). Returns an error if not found.
func GetSymbolBody(filePath, fqn string) (SymbolResult, error) {
	results, err := SearchBySymbol(filePath, fqn, "")
	if err != nil {
		return SymbolResult{}, err
	}
	lines, err := readLines(filePath)
	if err != nil {
		return SymbolResult{}, fmt.Errorf("inspect.GetSymbolBody: %w", err)
	}
	fqnLower := strings.ToLower(fqn)
	for _, r := range results {
		if strings.ToLower(r.Symbol) == fqnLower || strings.HasSuffix(strings.ToLower(r.Symbol), "."+fqnLower) {
			r.Body = extractBody(lines, r.StartLine-1, r.EndLine-1)
			return r, nil
		}
	}
	for _, r := range results {
		if strings.Contains(strings.ToLower(r.Symbol), fqnLower) {
			r.Body = extractBody(lines, r.StartLine-1, r.EndLine-1)
			return r, nil
		}
	}
	return SymbolResult{}, fmt.Errorf("inspect.GetSymbolBody: symbol %q not found in %s", fqn, filePath)
}

func extractBody(lines []string, start, end int) string {
	if start < 0 {
		start = 0
	}
	if end >= len(lines) {
		end = len(lines) - 1
	}
	if start > end {
		return ""
	}
	return strings.Join(lines[start:end+1], "\n")
}

func estimateEndLine(lines []string, startIdx int) int {
	if startIdx >= len(lines) {
		return startIdx + 1
	}
	startLine := lines[startIdx]
	isPython := !strings.Contains(startLine, "{") && strings.HasSuffix(strings.TrimSpace(startLine), ":")

	if isPython {
		baseIndent := leadingSpaces(startLine)
		for i := startIdx + 1; i < len(lines); i++ {
			line := lines[i]
			if strings.TrimSpace(line) == "" {
				continue
			}
			if leadingSpaces(line) <= baseIndent {
				return i
			}
		}
		return len(lines)
	}

	depth := strings.Count(startLine, "{") - strings.Count(startLine, "}")
	if depth <= 0 && !strings.Contains(startLine, "{") {
		for i := startIdx + 1; i < len(lines) && i < startIdx+5; i++ {
			depth += strings.Count(lines[i], "{") - strings.Count(lines[i], "}")
			if depth > 0 {
				startIdx = i
				break
			}
		}
	}
	for i := startIdx + 1; i < len(lines); i++ {
		depth += strings.Count(lines[i], "{") - strings.Count(lines[i], "}")
		if depth <= 0 {
			return i + 1
		}
	}
	return len(lines)
}

func leadingSpaces(s string) int {
	n := 0
	for _, c := range s {
		if c == ' ' {
			n++
		} else if c == '\t' {
			n += 4
		} else {
			break
		}
	}
	return n
}

type symPattern struct {
	re   *regexp.Regexp
	kind string
}

func symbolPatternsForExt(ext string) []symPattern {
	switch strings.ToLower(ext) {
	case ".go":
		return goSymPatterns
	case ".py":
		return pySymPatterns
	case ".ts", ".tsx":
		return tsSymPatterns
	case ".js", ".jsx":
		return jsSymPatterns
	case ".rs":
		return rsSymPatterns
	case ".java":
		return javaSymPatterns
	}
	return nil
}

var goSymPatterns = []symPattern{
	{regexp.MustCompile(`^func\s+\(\s*\w+\s+\*?(\w+)\)\s+(\w+)\s*\(`), "method"},
	{regexp.MustCompile(`^func\s+(\w+)\s*\(`), "function"},
	{regexp.MustCompile(`^type\s+(\w+)\s+struct\b`), "type"},
	{regexp.MustCompile(`^type\s+(\w+)\s+interface\b`), "type"},
	{regexp.MustCompile(`^type\s+(\w+)\s+`), "type"},
	{regexp.MustCompile(`^var\s+(\w+)\s`), "var"},
	{regexp.MustCompile(`^const\s+(\w+)\s`), "const"},
}

var pySymPatterns = []symPattern{
	{regexp.MustCompile(`^class\s+(\w+)`), "class"},
	{regexp.MustCompile(`^async\s+def\s+(\w+)`), "function"},
	{regexp.MustCompile(`^\s{4}async\s+def\s+(\w+)`), "method"},
	{regexp.MustCompile(`^def\s+(\w+)`), "function"},
	{regexp.MustCompile(`^\s{4}def\s+(\w+)`), "method"},
}

var tsSymPatterns = []symPattern{
	{regexp.MustCompile(`^(?:export\s+)?class\s+(\w+)`), "class"},
	{regexp.MustCompile(`^(?:export\s+)?interface\s+(\w+)`), "type"},
	{regexp.MustCompile(`^(?:export\s+)?type\s+(\w+)\s*=`), "type"},
	{regexp.MustCompile(`^(?:export\s+)?(?:async\s+)?function\s+(\w+)`), "function"},
	{regexp.MustCompile(`^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(`), "function"},
	{regexp.MustCompile(`^(?:export\s+)?const\s+(\w+)`), "const"},
}

var jsSymPatterns = []symPattern{
	{regexp.MustCompile(`^(?:export\s+)?class\s+(\w+)`), "class"},
	{regexp.MustCompile(`^(?:export\s+)?(?:async\s+)?function\s+(\w+)`), "function"},
	{regexp.MustCompile(`^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(`), "function"},
	{regexp.MustCompile(`^(?:export\s+)?const\s+(\w+)`), "const"},
}

var rsSymPatterns = []symPattern{
	{regexp.MustCompile(`^(?:pub(?:\([^)]*\))?\s+)?fn\s+(\w+)`), "function"},
	{regexp.MustCompile(`^(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)`), "type"},
	{regexp.MustCompile(`^(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)`), "type"},
	{regexp.MustCompile(`^(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)`), "type"},
	{regexp.MustCompile(`^impl(?:<[^>]*>)?\s+(\w+)`), "type"},
}

var javaSymPatterns = []symPattern{
	{regexp.MustCompile(`^(?:public|private|protected)?\s*(?:static\s+)?class\s+(\w+)`), "class"},
	{regexp.MustCompile(`^(?:public|private|protected)?\s*interface\s+(\w+)`), "type"},
	{regexp.MustCompile(`^\s+(?:public|private|protected)?\s*(?:static\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(`), "method"},
}

func extractSymbolName(m []string, kind, ext string) string {
	if kind == "method" && strings.ToLower(ext) == ".go" && len(m) >= 3 {
		return m[1] + "." + m[2]
	}
	if len(m) >= 2 {
		return m[1]
	}
	return ""
}

func readLines(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	var lines []string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 256*1024), 1024*1024)
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	return lines, sc.Err()
}
