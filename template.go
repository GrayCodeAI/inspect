package inspect

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Template is the YAML representation of a declarative RuleCheck. A single YAML
// file may contain one template (a mapping) or several (a top-level "templates"
// list). This is inspect's equivalent of Nuclei templates: define a check with
// pattern matching, no Go code required.
//
// Example:
//
//	name: missing-hsts
//	severity: high
//	description: Strict-Transport-Security header is missing
//	header_missing: [Strict-Transport-Security]
//	fix: Add a Strict-Transport-Security response header
type Template struct {
	Name          string            `yaml:"name"`
	Severity      string            `yaml:"severity"`
	Description   string            `yaml:"description"`
	HeaderMatch   map[string]string `yaml:"header_match,omitempty"`
	HeaderMissing []string          `yaml:"header_missing,omitempty"`
	BodyMatch     []string          `yaml:"body_match,omitempty"`
	BodyMissing   []string          `yaml:"body_missing,omitempty"`
	URLMatch      string            `yaml:"url_match,omitempty"`
	StatusCodes   []int             `yaml:"status_codes,omitempty"`
	Fix           string            `yaml:"fix,omitempty"`
}

// templateFile is the on-disk schema: either a single template or a list under
// "templates".
type templateFile struct {
	Templates []Template `yaml:"templates"`
	// Inline single-template fields (used when the file is one template).
	Template `yaml:",inline"`
}

// toRuleCheck converts a Template into a RuleCheck, validating required fields.
func (t Template) toRuleCheck() (RuleCheck, error) {
	if strings.TrimSpace(t.Name) == "" {
		return RuleCheck{}, fmt.Errorf("inspect: template missing required field 'name'")
	}
	if t.Description == "" {
		t.Description = t.Name
	}
	if !t.hasCondition() {
		return RuleCheck{}, fmt.Errorf("inspect: template %q has no match conditions", t.Name)
	}
	sev := SeverityMedium
	if t.Severity != "" {
		sev = ParseSeverity(t.Severity)
	}
	return RuleCheck{
		RuleName:      t.Name,
		RuleSeverity:  sev,
		Description:   t.Description,
		HeaderMatch:   t.HeaderMatch,
		HeaderMissing: t.HeaderMissing,
		BodyMatch:     t.BodyMatch,
		BodyMissing:   t.BodyMissing,
		URLMatch:      t.URLMatch,
		StatusCodes:   t.StatusCodes,
		FixSuggestion: t.Fix,
	}, nil
}

func (t Template) hasCondition() bool {
	return len(t.HeaderMatch) > 0 || len(t.HeaderMissing) > 0 ||
		len(t.BodyMatch) > 0 || len(t.BodyMissing) > 0
}

// ParseTemplates decodes one or more templates from YAML bytes into RuleChecks.
func ParseTemplates(data []byte) ([]RuleCheck, error) {
	var tf templateFile
	if err := yaml.Unmarshal(data, &tf); err != nil {
		return nil, fmt.Errorf("inspect: parse template YAML: %w", err)
	}

	templates := tf.Templates
	// If the file used the single-template form, the inline fields are populated.
	if len(templates) == 0 && tf.Name != "" {
		templates = []Template{tf.Template}
	}
	if len(templates) == 0 {
		return nil, fmt.Errorf("inspect: no templates found in YAML")
	}

	rules := make([]RuleCheck, 0, len(templates))
	for _, t := range templates {
		rc, err := t.toRuleCheck()
		if err != nil {
			return nil, err
		}
		rules = append(rules, rc)
	}
	return rules, nil
}

// LoadTemplateFile reads and parses a single YAML template file.
func LoadTemplateFile(path string) ([]RuleCheck, error) {
	data, err := os.ReadFile(path) // #nosec G304 -- path is a caller-supplied template file location (this tool's own declarative check templates), not attacker-controlled input
	if err != nil {
		return nil, fmt.Errorf("inspect: read template %s: %w", path, err)
	}
	return ParseTemplates(data)
}

// LoadTemplateDir loads all .yaml/.yml templates in a directory (non-recursive).
func LoadTemplateDir(dir string) ([]RuleCheck, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("inspect: read template dir %s: %w", dir, err)
	}
	var rules []RuleCheck
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext != ".yaml" && ext != ".yml" {
			continue
		}
		fileRules, err := LoadTemplateFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		rules = append(rules, fileRules...)
	}
	return rules, nil
}

// WithTemplateFile loads declarative check templates from a YAML file and
// registers them as scan-scoped rules. A parse error is surfaced lazily as a
// rule named "<template-load-error>" so callers using the functional-option
// form still observe the failure during scanning configuration.
func WithTemplateFile(path string) Option {
	return optFunc(func(c *config) {
		rules, err := LoadTemplateFile(path)
		if err != nil {
			c.customRules = append(c.customRules, errorRule(err))
			return
		}
		c.customRules = append(c.customRules, rules...)
	})
}

// WithTemplateDir loads all YAML templates from a directory as scan-scoped rules.
func WithTemplateDir(dir string) Option {
	return optFunc(func(c *config) {
		rules, err := LoadTemplateDir(dir)
		if err != nil {
			c.customRules = append(c.customRules, errorRule(err))
			return
		}
		c.customRules = append(c.customRules, rules...)
	})
}

// errorRule produces a no-op rule that records a template loading failure so it
// is visible rather than silently dropped.
func errorRule(err error) RuleCheck {
	return RuleCheck{
		RuleName:     "<template-load-error>",
		RuleSeverity: SeverityInfo,
		Description:  err.Error(),
	}
}
