package inspect

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseTemplates_Single(t *testing.T) {
	yaml := `
name: missing-hsts
severity: high
description: Strict-Transport-Security header is missing
header_missing: [Strict-Transport-Security]
fix: Add an HSTS header
`
	rules, err := ParseTemplates([]byte(yaml))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}
	r := rules[0]
	if r.RuleName != "missing-hsts" || r.RuleSeverity != SeverityHigh {
		t.Errorf("unexpected rule: %+v", r)
	}
	if len(r.HeaderMissing) != 1 || r.HeaderMissing[0] != "Strict-Transport-Security" {
		t.Errorf("header_missing not parsed: %+v", r.HeaderMissing)
	}
	if r.FixSuggestion != "Add an HSTS header" {
		t.Errorf("fix not parsed: %q", r.FixSuggestion)
	}
}

func TestParseTemplates_List(t *testing.T) {
	yaml := `
templates:
  - name: rule-a
    severity: medium
    body_match: ["password\\s*=\\s*['\"]"]
  - name: rule-b
    severity: low
    header_missing: [X-Frame-Options]
`
	rules, err := ParseTemplates([]byte(yaml))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(rules))
	}
	if rules[0].RuleName != "rule-a" || len(rules[0].BodyMatch) != 1 {
		t.Errorf("rule-a not parsed: %+v", rules[0])
	}
	if rules[1].RuleName != "rule-b" {
		t.Errorf("rule-b not parsed: %+v", rules[1])
	}
}

func TestParseTemplates_Errors(t *testing.T) {
	cases := map[string]string{
		"missing name":   "severity: high\nheader_missing: [X]",
		"no conditions":  "name: empty\nseverity: high",
		"not a template": "foo: bar",
	}
	for name, yaml := range cases {
		if _, err := ParseTemplates([]byte(yaml)); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}
}

func TestWithTemplateFile_FiresOnScan(t *testing.T) {
	// A page deliberately missing the X-Frame-Options header.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html><body>hello</body></html>"))
	}))
	defer srv.Close()

	dir := t.TempDir()
	tmpl := filepath.Join(dir, "xfo.yaml")
	if err := os.WriteFile(tmpl, []byte("name: missing-xfo\nseverity: medium\ndescription: X-Frame-Options missing\nheader_missing: [X-Frame-Options]\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	s := NewScanner(
		WithChecks(), // disable built-ins; only the template rule runs
		WithDepth(1),
		WithAllowPrivateIPs(), // httptest binds to 127.0.0.1
		WithTemplateFile(tmpl),
		WithTimeout(10*time.Second),
	)
	report, err := s.Scan(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	var found bool
	for _, f := range report.Findings {
		if f.Check == "missing-xfo" || f.Message == "X-Frame-Options missing: missing header X-Frame-Options" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected template finding for missing X-Frame-Options; findings=%+v", report.Findings)
	}
}
