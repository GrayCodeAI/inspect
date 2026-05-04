package inspect

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// FileConfig represents the contents of an .inspect.toml configuration file.
type FileConfig struct {
	Depth       int      `json:"depth"`
	Checks      []string `json:"checks"`
	Exclude     []string `json:"exclude"`
	FailOn      string   `json:"fail_on"`
	Concurrency int      `json:"concurrency"`
	RateLimit   int      `json:"rate_limit"`
	Timeout     string   `json:"timeout"`
	PageTimeout string   `json:"page_timeout"`
	UserAgent   string   `json:"user_agent"`
	AuthHeader  string   `json:"auth_header"`
	AuthValue   string   `json:"auth_value"`
	AcceptedStatusCodes []int `json:"accepted_status_codes"`
}

// LoadConfig reads .inspect.toml or .inspect.yaml from the given directory
// (searching upward to parent directories). Returns nil options and nil error
// if no config file is found. Returns an error only on malformed files.
func LoadConfig(dir string) ([]Option, error) {
	fc, err := loadConfigFile(dir)
	if err != nil {
		return nil, err
	}
	if fc == nil {
		return nil, nil
	}
	return applyFileConfig(fc), nil
}

func loadConfigFile(dir string) (*FileConfig, error) {
	path := findInspectConfigFile(dir)
	if path == "" {
		return nil, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	return parseInspectTOML(string(data))
}

func findInspectConfigFile(dir string) string {
	names := []string{".inspect.toml", ".inspect.yaml", "inspect.toml"}

	for {
		for _, name := range names {
			path := filepath.Join(dir, name)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// parseInspectTOML parses a simplified TOML format.
// Supports key = "value", key = true/false, key = 123, arrays, and [section] headers.
func parseInspectTOML(content string) (*FileConfig, error) {
	cfg := &FileConfig{}

	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Skip section headers for now (flat config)
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			continue
		}

		key, value, ok := parseInspectKeyValue(line)
		if !ok {
			continue
		}

		switch key {
		case "depth":
			if n := parseIntVal(value); n > 0 {
				cfg.Depth = n
			}
		case "checks":
			cfg.Checks = parseTOMLArrayVal(value)
		case "exclude":
			cfg.Exclude = parseTOMLArrayVal(value)
		case "fail_on":
			cfg.FailOn = value
		case "concurrency":
			if n := parseIntVal(value); n > 0 {
				cfg.Concurrency = n
			}
		case "rate_limit":
			if n := parseIntVal(value); n > 0 {
				cfg.RateLimit = n
			}
		case "timeout":
			cfg.Timeout = value
		case "page_timeout":
			cfg.PageTimeout = value
		case "user_agent":
			cfg.UserAgent = value
		case "auth_header":
			cfg.AuthHeader = value
		case "auth_value":
			cfg.AuthValue = value
		case "accepted_status_codes":
			cfg.AcceptedStatusCodes = parseTOMLIntArray(value)
		}
	}

	return cfg, nil
}

// parseInspectKeyValue splits a TOML line into key and value, handling quoted
// values that may contain '=' signs.
func parseInspectKeyValue(line string) (key, value string, ok bool) {
	idx := strings.Index(line, "=")
	if idx < 0 {
		return "", "", false
	}
	key = strings.TrimSpace(line[:idx])
	value = strings.TrimSpace(line[idx+1:])
	// Strip matching outer quotes
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') ||
			(value[0] == '\'' && value[len(value)-1] == '\'') {
			value = value[1 : len(value)-1]
		}
	}
	return key, value, key != ""
}

func applyFileConfig(fc *FileConfig) []Option {
	if fc == nil {
		return nil
	}

	var opts []Option

	if fc.Depth > 0 {
		opts = append(opts, WithDepth(fc.Depth))
	}
	if len(fc.Checks) > 0 {
		opts = append(opts, WithChecks(fc.Checks...))
	}
	if len(fc.Exclude) > 0 {
		opts = append(opts, WithExclude(fc.Exclude...))
	}
	if fc.FailOn != "" {
		opts = append(opts, WithFailOn(ParseSeverity(fc.FailOn)))
	}
	if fc.Concurrency > 0 {
		opts = append(opts, WithConcurrency(fc.Concurrency))
	}
	if fc.RateLimit > 0 {
		opts = append(opts, WithRateLimit(fc.RateLimit))
	}
	if fc.Timeout != "" {
		if d, err := time.ParseDuration(fc.Timeout); err == nil {
			opts = append(opts, WithTimeout(d))
		}
	}
	if fc.PageTimeout != "" {
		if d, err := time.ParseDuration(fc.PageTimeout); err == nil {
			opts = append(opts, WithPageTimeout(d))
		}
	}
	if fc.UserAgent != "" {
		opts = append(opts, WithUserAgent(fc.UserAgent))
	}
	if fc.AuthHeader != "" && fc.AuthValue != "" {
		opts = append(opts, WithAuth(fc.AuthHeader, fc.AuthValue))
	}
	if len(fc.AcceptedStatusCodes) > 0 {
		opts = append(opts, WithAcceptedStatusCodes(fc.AcceptedStatusCodes...))
	}

	return opts
}

func parseTOMLArrayVal(s string) []string {
	s = strings.Trim(s, "[]\"'")
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, `"'`)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func parseTOMLIntArray(s string) []int {
	s = strings.Trim(s, "[]")
	parts := strings.Split(s, ",")
	var result []int
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if n, err := strconv.Atoi(p); err == nil {
			result = append(result, n)
		}
	}
	return result
}

func parseIntVal(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
