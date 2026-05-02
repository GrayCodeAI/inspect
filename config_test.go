package inspect

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadConfig_NoConfigFile(t *testing.T) {
	dir := t.TempDir()
	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts != nil {
		t.Errorf("expected nil options when no config file, got %v", opts)
	}
}

func TestLoadConfig_WithConfigFile(t *testing.T) {
	dir := t.TempDir()
	content := `
# Inspect configuration
depth = 3
checks = ["links", "security"]
exclude = ["/admin", "/api"]
fail_on = "high"
concurrency = 5
rate_limit = 10
timeout = "30s"
page_timeout = "10s"
user_agent = "my-bot/1.0"
auth_header = "Authorization"
auth_value = "Bearer abc123"
accepted_status_codes = [200, 201, 204]
`
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts == nil {
		t.Fatal("expected non-nil options")
	}

	// Apply the options and check the resulting config
	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}

	if cfg.depth != 3 {
		t.Errorf("expected depth=3, got %d", cfg.depth)
	}
	if len(cfg.checks) != 2 || cfg.checks[0] != "links" || cfg.checks[1] != "security" {
		t.Errorf("expected checks=[links,security], got %v", cfg.checks)
	}
	if len(cfg.exclude) != 2 || cfg.exclude[0] != "/admin" || cfg.exclude[1] != "/api" {
		t.Errorf("expected exclude=[/admin,/api], got %v", cfg.exclude)
	}
	if cfg.failOn != SeverityHigh {
		t.Errorf("expected failOn=high, got %v", cfg.failOn)
	}
	if cfg.concurrency != 5 {
		t.Errorf("expected concurrency=5, got %d", cfg.concurrency)
	}
	if cfg.rateLimit != 10 {
		t.Errorf("expected rateLimit=10, got %d", cfg.rateLimit)
	}
	if cfg.timeout != 30*time.Second {
		t.Errorf("expected timeout=30s, got %v", cfg.timeout)
	}
	if cfg.pageTimeout != 10*time.Second {
		t.Errorf("expected pageTimeout=10s, got %v", cfg.pageTimeout)
	}
	if cfg.userAgent != "my-bot/1.0" {
		t.Errorf("expected userAgent=my-bot/1.0, got %q", cfg.userAgent)
	}
	if cfg.authHeader != "Authorization" {
		t.Errorf("expected authHeader=Authorization, got %q", cfg.authHeader)
	}
	if cfg.authValue != "Bearer abc123" {
		t.Errorf("expected authValue=Bearer abc123, got %q", cfg.authValue)
	}
	if len(cfg.acceptedStatusCodes) != 3 {
		t.Errorf("expected 3 accepted status codes, got %d", len(cfg.acceptedStatusCodes))
	}
}

func TestLoadConfig_SearchesParentDirs(t *testing.T) {
	parent := t.TempDir()
	child := filepath.Join(parent, "sub", "dir")
	err := os.MkdirAll(child, 0755)
	if err != nil {
		t.Fatalf("failed to create child dir: %v", err)
	}

	content := `depth = 7
`
	err = os.WriteFile(filepath.Join(parent, ".inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(child)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts == nil {
		t.Fatal("expected to find config from parent directory")
	}

	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	if cfg.depth != 7 {
		t.Errorf("expected depth=7, got %d", cfg.depth)
	}
}

func TestLoadConfig_SkipsCommentsAndSections(t *testing.T) {
	dir := t.TempDir()
	content := `# This is a comment
[section]
depth = 4
# Another comment

`
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts == nil {
		t.Fatal("expected non-nil options")
	}

	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	if cfg.depth != 4 {
		t.Errorf("expected depth=4, got %d", cfg.depth)
	}
}

func TestLoadConfig_FailOnVariants(t *testing.T) {
	tests := []struct {
		failOn   string
		expected Severity
	}{
		{"critical", SeverityCritical},
		{"high", SeverityHigh},
		{"medium", SeverityMedium},
		{"low", SeverityLow},
		{"info", SeverityInfo},
		{"unknown", SeverityInfo},
	}

	for _, tt := range tests {
		t.Run(tt.failOn, func(t *testing.T) {
			dir := t.TempDir()
			content := `fail_on = "` + tt.failOn + `"
`
			err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0644)
			if err != nil {
				t.Fatalf("failed to write config file: %v", err)
			}

			opts, err := LoadConfig(dir)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			cfg := defaultConfig()
			for _, o := range opts {
				o.apply(cfg)
			}
			if cfg.failOn != tt.expected {
				t.Errorf("expected failOn=%v, got %v", tt.expected, cfg.failOn)
			}
		})
	}
}

func TestLoadConfig_EmptyValues(t *testing.T) {
	dir := t.TempDir()
	content := `depth = 0
concurrency = 0
rate_limit = 0
`
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Zero values should not produce options (no changes to defaults)
	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	// Defaults should be preserved since zero-value ints are skipped
	if cfg.depth != 5 {
		t.Errorf("expected default depth=5, got %d", cfg.depth)
	}
}

func TestLoadConfig_InvalidTimeout(t *testing.T) {
	dir := t.TempDir()
	content := `timeout = "not-a-duration"
`
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	// Invalid duration should be ignored, default preserved
	if cfg.timeout != 60*time.Second {
		t.Errorf("expected default timeout, got %v", cfg.timeout)
	}
}

func TestLoadConfig_InspectTomlAlternateNames(t *testing.T) {
	// Test that inspect.toml (without dot prefix) is also found
	dir := t.TempDir()
	content := `depth = 9
`
	err := os.WriteFile(filepath.Join(dir, "inspect.toml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	opts, err := LoadConfig(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts == nil {
		t.Fatal("expected to find inspect.toml config")
	}

	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	if cfg.depth != 9 {
		t.Errorf("expected depth=9, got %d", cfg.depth)
	}
}

func TestParseTOMLArrayVal(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{`["a", "b", "c"]`, []string{"a", "b", "c"}},
		{`["single"]`, []string{"single"}},
		{`[]`, nil},
		{`["a","b"]`, []string{"a", "b"}},
	}

	for _, tt := range tests {
		got := parseTOMLArrayVal(tt.input)
		if len(got) != len(tt.expected) {
			t.Errorf("parseTOMLArrayVal(%q) = %v, want %v", tt.input, got, tt.expected)
			continue
		}
		for i := range got {
			if got[i] != tt.expected[i] {
				t.Errorf("parseTOMLArrayVal(%q)[%d] = %q, want %q", tt.input, i, got[i], tt.expected[i])
			}
		}
	}
}

func TestParseTOMLIntArray(t *testing.T) {
	tests := []struct {
		input    string
		expected []int
	}{
		{`[200, 201, 204]`, []int{200, 201, 204}},
		{`[404]`, []int{404}},
		{`[]`, nil},
	}

	for _, tt := range tests {
		got := parseTOMLIntArray(tt.input)
		if len(got) != len(tt.expected) {
			t.Errorf("parseTOMLIntArray(%q) = %v, want %v", tt.input, got, tt.expected)
			continue
		}
		for i := range got {
			if got[i] != tt.expected[i] {
				t.Errorf("parseTOMLIntArray(%q)[%d] = %d, want %d", tt.input, i, got[i], tt.expected[i])
			}
		}
	}
}

func TestApplyFileConfig_Nil(t *testing.T) {
	opts := applyFileConfig(nil)
	if opts != nil {
		t.Errorf("expected nil opts for nil config, got %v", opts)
	}
}

func TestApplyFileConfig_AuthRequiresBoth(t *testing.T) {
	// Auth should only apply when both header and value are present
	fc := &FileConfig{
		AuthHeader: "Authorization",
		AuthValue:  "",
	}
	opts := applyFileConfig(fc)
	cfg := defaultConfig()
	for _, o := range opts {
		o.apply(cfg)
	}
	if cfg.authHeader != "" {
		t.Errorf("expected no auth when auth_value is empty, got header=%q", cfg.authHeader)
	}
}
