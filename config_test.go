package inspect

import (
	"log/slog"
	"net/http/cookiejar"
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
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0o644)
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
	err := os.MkdirAll(child, 0o755)
	if err != nil {
		t.Fatalf("failed to create child dir: %v", err)
	}

	content := `depth = 7
`
	err = os.WriteFile(filepath.Join(parent, ".inspect.toml"), []byte(content), 0o644)
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
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0o644)
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
			err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0o644)
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
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0o644)
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
	err := os.WriteFile(filepath.Join(dir, ".inspect.toml"), []byte(content), 0o644)
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
	err := os.WriteFile(filepath.Join(dir, "inspect.toml"), []byte(content), 0o644)
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

// --- Default config tests ---

func TestDefaultConfig(t *testing.T) {
	cfg := defaultConfig()

	if cfg.depth != 5 {
		t.Errorf("default depth: want 5, got %d", cfg.depth)
	}

	expectedChecks := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	if len(cfg.checks) != len(expectedChecks) {
		t.Fatalf("default checks length: want %d, got %d", len(expectedChecks), len(cfg.checks))
	}
	for i, c := range expectedChecks {
		if cfg.checks[i] != c {
			t.Errorf("default checks[%d]: want %q, got %q", i, c, cfg.checks[i])
		}
	}

	if cfg.concurrency != 10 {
		t.Errorf("default concurrency: want 10, got %d", cfg.concurrency)
	}
	if cfg.timeout != 60*time.Second {
		t.Errorf("default timeout: want 60s, got %v", cfg.timeout)
	}
	if cfg.pageTimeout != 15*time.Second {
		t.Errorf("default pageTimeout: want 15s, got %v", cfg.pageTimeout)
	}
	if cfg.rateLimit != 20 {
		t.Errorf("default rateLimit: want 20, got %d", cfg.rateLimit)
	}
	if cfg.userAgent != "inspect/1.0" {
		t.Errorf("default userAgent: want %q, got %q", "inspect/1.0", cfg.userAgent)
	}
	if cfg.followRedirects != 5 {
		t.Errorf("default followRedirects: want 5, got %d", cfg.followRedirects)
	}
	if !cfg.respectRobots {
		t.Error("default respectRobots: want true, got false")
	}
	if cfg.failOn != SeverityCritical {
		t.Errorf("default failOn: want SeverityCritical, got %v", cfg.failOn)
	}
	// Zero-value fields
	if cfg.authHeader != "" {
		t.Errorf("default authHeader should be empty, got %q", cfg.authHeader)
	}
	if cfg.authValue != "" {
		t.Errorf("default authValue should be empty, got %q", cfg.authValue)
	}
	if !cfg.blockPrivateIPs {
		t.Error("default blockPrivateIPs should be true")
	}
}

// --- Option function tests ---

func TestWithDepth(t *testing.T) {
	cfg := buildConfig([]Option{WithDepth(3)})
	if cfg.depth != 3 {
		t.Errorf("WithDepth(3): want depth=3, got %d", cfg.depth)
	}
}

func TestWithChecks(t *testing.T) {
	cfg := buildConfig([]Option{WithChecks("links", "perf")})
	if len(cfg.checks) != 2 || cfg.checks[0] != "links" || cfg.checks[1] != "perf" {
		t.Errorf("WithChecks: want [links, perf], got %v", cfg.checks)
	}
}

func TestWithExclude(t *testing.T) {
	cfg := buildConfig([]Option{WithExclude("/admin", "/internal")})
	if len(cfg.exclude) != 2 || cfg.exclude[0] != "/admin" || cfg.exclude[1] != "/internal" {
		t.Errorf("WithExclude: want [/admin, /internal], got %v", cfg.exclude)
	}
}

func TestWithConcurrency(t *testing.T) {
	cfg := buildConfig([]Option{WithConcurrency(20)})
	if cfg.concurrency != 20 {
		t.Errorf("WithConcurrency(20): want concurrency=20, got %d", cfg.concurrency)
	}
}

func TestWithConcurrency_IgnoresZero(t *testing.T) {
	cfg := buildConfig([]Option{WithConcurrency(0)})
	if cfg.concurrency != 10 {
		t.Errorf("WithConcurrency(0) should keep default 10, got %d", cfg.concurrency)
	}
}

func TestWithConcurrency_IgnoresNegative(t *testing.T) {
	cfg := buildConfig([]Option{WithConcurrency(-1)})
	if cfg.concurrency != 10 {
		t.Errorf("WithConcurrency(-1) should keep default 10, got %d", cfg.concurrency)
	}
}

func TestWithTimeout(t *testing.T) {
	cfg := buildConfig([]Option{WithTimeout(30 * time.Second)})
	if cfg.timeout != 30*time.Second {
		t.Errorf("WithTimeout(30s): want 30s, got %v", cfg.timeout)
	}
}

func TestWithPageTimeout(t *testing.T) {
	cfg := buildConfig([]Option{WithPageTimeout(5 * time.Second)})
	if cfg.pageTimeout != 5*time.Second {
		t.Errorf("WithPageTimeout(5s): want 5s, got %v", cfg.pageTimeout)
	}
}

func TestWithRateLimit(t *testing.T) {
	cfg := buildConfig([]Option{WithRateLimit(50)})
	if cfg.rateLimit != 50 {
		t.Errorf("WithRateLimit(50): want rateLimit=50, got %d", cfg.rateLimit)
	}
}

func TestWithRateLimit_IgnoresZero(t *testing.T) {
	cfg := buildConfig([]Option{WithRateLimit(0)})
	if cfg.rateLimit != 20 {
		t.Errorf("WithRateLimit(0) should keep default 20, got %d", cfg.rateLimit)
	}
}

func TestWithRateLimit_IgnoresNegative(t *testing.T) {
	cfg := buildConfig([]Option{WithRateLimit(-5)})
	if cfg.rateLimit != 20 {
		t.Errorf("WithRateLimit(-5) should keep default 20, got %d", cfg.rateLimit)
	}
}

func TestWithAuth(t *testing.T) {
	cfg := buildConfig([]Option{WithAuth("Authorization", "Bearer tok123")})
	if cfg.authHeader != "Authorization" {
		t.Errorf("WithAuth: want authHeader=Authorization, got %q", cfg.authHeader)
	}
	if cfg.authValue != "Bearer tok123" {
		t.Errorf("WithAuth: want authValue=Bearer tok123, got %q", cfg.authValue)
	}
}

func TestWithFailOn(t *testing.T) {
	severities := []Severity{SeverityInfo, SeverityLow, SeverityMedium, SeverityHigh, SeverityCritical}
	for _, sev := range severities {
		cfg := buildConfig([]Option{WithFailOn(sev)})
		if cfg.failOn != sev {
			t.Errorf("WithFailOn(%v): want %v, got %v", sev, sev, cfg.failOn)
		}
	}
}

func TestWithUserAgent(t *testing.T) {
	cfg := buildConfig([]Option{WithUserAgent("my-crawler/2.0")})
	if cfg.userAgent != "my-crawler/2.0" {
		t.Errorf("WithUserAgent: want %q, got %q", "my-crawler/2.0", cfg.userAgent)
	}
}

func TestWithFollowRedirects(t *testing.T) {
	cfg := buildConfig([]Option{WithFollowRedirects(10)})
	if cfg.followRedirects != 10 {
		t.Errorf("WithFollowRedirects(10): want 10, got %d", cfg.followRedirects)
	}
}

func TestWithRespectRobots(t *testing.T) {
	cfg := buildConfig([]Option{WithRespectRobots(false)})
	if cfg.respectRobots {
		t.Error("WithRespectRobots(false): want false, got true")
	}
}

func TestWithLogger(t *testing.T) {
	logger := slog.Default()
	cfg := buildConfig([]Option{WithLogger(logger)})
	if cfg.logger != logger {
		t.Error("WithLogger: logger was not set correctly")
	}
}

func TestWithCookieJar(t *testing.T) {
	jar, _ := cookiejar.New(nil)
	cfg := buildConfig([]Option{WithCookieJar(jar)})
	if cfg.cookieJar != jar {
		t.Error("WithCookieJar: cookie jar was not set correctly")
	}
}

func TestWithAcceptedStatusCodes(t *testing.T) {
	codes := []int{200, 201, 301, 302}
	cfg := buildConfig([]Option{WithAcceptedStatusCodes(codes...)})
	if len(cfg.acceptedStatusCodes) != len(codes) {
		t.Fatalf("WithAcceptedStatusCodes: want %d codes, got %d", len(codes), len(cfg.acceptedStatusCodes))
	}
	for i, c := range codes {
		if cfg.acceptedStatusCodes[i] != c {
			t.Errorf("WithAcceptedStatusCodes[%d]: want %d, got %d", i, c, cfg.acceptedStatusCodes[i])
		}
	}
}

func TestWithBlockPrivateIPs(t *testing.T) {
	cfg := buildConfig([]Option{WithBlockPrivateIPs()})
	if !cfg.blockPrivateIPs {
		t.Error("WithBlockPrivateIPs(): want true, got false")
	}
}

// --- Config validation / buildConfig tests ---

func TestBuildConfig_NoOptionsUsesDefaults(t *testing.T) {
	cfg := buildConfig(nil)
	defaults := defaultConfig()

	if cfg.depth != defaults.depth {
		t.Errorf("buildConfig(nil) depth: want %d, got %d", defaults.depth, cfg.depth)
	}
	if cfg.concurrency != defaults.concurrency {
		t.Errorf("buildConfig(nil) concurrency: want %d, got %d", defaults.concurrency, cfg.concurrency)
	}
	if cfg.timeout != defaults.timeout {
		t.Errorf("buildConfig(nil) timeout: want %v, got %v", defaults.timeout, cfg.timeout)
	}
	if cfg.failOn != defaults.failOn {
		t.Errorf("buildConfig(nil) failOn: want %v, got %v", defaults.failOn, cfg.failOn)
	}
}

func TestBuildConfig_MultipleOptions(t *testing.T) {
	cfg := buildConfig([]Option{
		WithDepth(2),
		WithConcurrency(50),
		WithTimeout(10 * time.Second),
		WithUserAgent("test-agent"),
		WithFailOn(SeverityLow),
		WithBlockPrivateIPs(),
	})

	if cfg.depth != 2 {
		t.Errorf("depth: want 2, got %d", cfg.depth)
	}
	if cfg.concurrency != 50 {
		t.Errorf("concurrency: want 50, got %d", cfg.concurrency)
	}
	if cfg.timeout != 10*time.Second {
		t.Errorf("timeout: want 10s, got %v", cfg.timeout)
	}
	if cfg.userAgent != "test-agent" {
		t.Errorf("userAgent: want %q, got %q", "test-agent", cfg.userAgent)
	}
	if cfg.failOn != SeverityLow {
		t.Errorf("failOn: want SeverityLow, got %v", cfg.failOn)
	}
	if !cfg.blockPrivateIPs {
		t.Error("blockPrivateIPs: want true, got false")
	}
}

func TestBuildConfig_LastOptionWins(t *testing.T) {
	cfg := buildConfig([]Option{
		WithDepth(1),
		WithDepth(9),
	})
	if cfg.depth != 9 {
		t.Errorf("last WithDepth should win: want 9, got %d", cfg.depth)
	}
}

// --- Preset tests ---

func TestPreset_Quick(t *testing.T) {
	cfg := buildConfig([]Option{Quick})

	if cfg.depth != 2 {
		t.Errorf("Quick depth: want 2, got %d", cfg.depth)
	}
	if len(cfg.checks) != 1 || cfg.checks[0] != "links" {
		t.Errorf("Quick checks: want [links], got %v", cfg.checks)
	}
	if cfg.concurrency != 5 {
		t.Errorf("Quick concurrency: want 5, got %d", cfg.concurrency)
	}
}

func TestPreset_Standard(t *testing.T) {
	cfg := buildConfig([]Option{Standard})

	if cfg.depth != 5 {
		t.Errorf("Standard depth: want 5, got %d", cfg.depth)
	}

	expectedChecks := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	if len(cfg.checks) != len(expectedChecks) {
		t.Fatalf("Standard checks length: want %d, got %d", len(expectedChecks), len(cfg.checks))
	}
	for i, c := range expectedChecks {
		if cfg.checks[i] != c {
			t.Errorf("Standard checks[%d]: want %q, got %q", i, c, cfg.checks[i])
		}
	}

	if cfg.concurrency != 10 {
		t.Errorf("Standard concurrency: want 10, got %d", cfg.concurrency)
	}
}

func TestPreset_Deep(t *testing.T) {
	cfg := buildConfig([]Option{Deep})

	if cfg.depth != 0 {
		t.Errorf("Deep depth: want 0 (unlimited), got %d", cfg.depth)
	}

	expectedChecks := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	if len(cfg.checks) != len(expectedChecks) {
		t.Fatalf("Deep checks length: want %d, got %d", len(expectedChecks), len(cfg.checks))
	}
	for i, c := range expectedChecks {
		if cfg.checks[i] != c {
			t.Errorf("Deep checks[%d]: want %q, got %q", i, c, cfg.checks[i])
		}
	}

	if cfg.concurrency != 20 {
		t.Errorf("Deep concurrency: want 20, got %d", cfg.concurrency)
	}
}

func TestPreset_SecurityOnly(t *testing.T) {
	cfg := buildConfig([]Option{SecurityOnly})

	if len(cfg.checks) != 1 || cfg.checks[0] != "security" {
		t.Errorf("SecurityOnly checks: want [security], got %v", cfg.checks)
	}
}

func TestPreset_CI(t *testing.T) {
	cfg := buildConfig([]Option{CI})

	if cfg.depth != 5 {
		t.Errorf("CI depth: want 5, got %d", cfg.depth)
	}

	expectedChecks := []string{"links", "security", "forms", "a11y", "perf", "seo"}
	if len(cfg.checks) != len(expectedChecks) {
		t.Fatalf("CI checks length: want %d, got %d", len(expectedChecks), len(cfg.checks))
	}
	for i, c := range expectedChecks {
		if cfg.checks[i] != c {
			t.Errorf("CI checks[%d]: want %q, got %q", i, c, cfg.checks[i])
		}
	}

	if cfg.concurrency != 10 {
		t.Errorf("CI concurrency: want 10, got %d", cfg.concurrency)
	}
	if cfg.failOn != SeverityHigh {
		t.Errorf("CI failOn: want SeverityHigh, got %v", cfg.failOn)
	}
}

func TestPreset_CanBeOverridden(t *testing.T) {
	cfg := buildConfig([]Option{Quick, WithDepth(8)})
	if cfg.depth != 8 {
		t.Errorf("preset + override: want depth=8, got %d", cfg.depth)
	}
	// Quick sets checks=[links], should still hold
	if len(cfg.checks) != 1 || cfg.checks[0] != "links" {
		t.Errorf("Quick checks should still be [links], got %v", cfg.checks)
	}
}

// --- parseInspectKeyValue tests ---

func TestParseInspectKeyValue(t *testing.T) {
	tests := []struct {
		line    string
		wantKey string
		wantVal string
		wantOK  bool
	}{
		{`depth = 3`, "depth", "3", true},
		{`timeout = "30s"`, "timeout", "30s", true},
		{`user_agent = 'my-bot'`, "user_agent", "my-bot", true},
		{`# comment`, "", "", false},
		{`no-equals-sign`, "", "", false},
		{` = empty-key`, "", "empty-key", false},
	}

	for _, tt := range tests {
		t.Run(tt.line, func(t *testing.T) {
			key, val, ok := parseInspectKeyValue(tt.line)
			if ok != tt.wantOK {
				t.Fatalf("parseInspectKeyValue(%q): want ok=%v, got %v", tt.line, tt.wantOK, ok)
			}
			if key != tt.wantKey {
				t.Errorf("key: want %q, got %q", tt.wantKey, key)
			}
			if val != tt.wantVal {
				t.Errorf("value: want %q, got %q", tt.wantVal, val)
			}
		})
	}
}
