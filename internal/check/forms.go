package check

import (
	"context"
	"fmt"
	"strings"

	"github.com/GrayCodeAI/inspect/internal/crawler"
)

// FormsCheck detects form-related issues: missing actions, CSRF tokens, method problems.
type FormsCheck struct{}

func (f *FormsCheck) Name() string { return "forms" }

func (f *FormsCheck) Run(ctx context.Context, pages []*crawler.Page) []Finding {
	var findings []Finding

	for _, page := range pages {
		if page.Error != nil || len(page.Forms) == 0 {
			continue
		}

		for i, form := range page.Forms {
			formRef := fmt.Sprintf("form#%d", i+1)
			if form.ID != "" {
				formRef = fmt.Sprintf("form#%s", form.ID)
			}

			if form.Action == "" {
				findings = append(findings, Finding{
					Severity: SeverityMedium,
					URL:      page.URL,
					Element:  formRef,
					Message:  "Form has no action attribute",
					Fix:      "Add an explicit action attribute to the form",
				})
			}

			if form.Method == "POST" && !form.HasCSRF {
				findings = append(findings, Finding{
					Severity: SeverityHigh,
					URL:      page.URL,
					Element:  formRef,
					Message:  "POST form missing CSRF token",
					Fix:      "Add a hidden input with a CSRF token to protect against cross-site request forgery",
				})
			}

			if form.Method == "GET" && hasPasswordField(form.Inputs) {
				findings = append(findings, Finding{
					Severity: SeverityCritical,
					URL:      page.URL,
					Element:  formRef,
					Message:  "Form with password field uses GET method",
					Fix:      "Change form method to POST to prevent credentials appearing in URL",
				})
			}

			if form.Action != "" && strings.HasPrefix(page.URL, "https://") && strings.HasPrefix(form.Action, "http://") {
				findings = append(findings, Finding{
					Severity: SeverityHigh,
					URL:      page.URL,
					Element:  formRef,
					Message:  "HTTPS page submits form to HTTP endpoint",
					Fix:      "Update form action to use HTTPS",
					Evidence: fmt.Sprintf("action=%q", form.Action),
				})
			}

			if hasAutocompleteIssue(form.Inputs) {
				findings = append(findings, Finding{
					Severity: SeverityLow,
					URL:      page.URL,
					Element:  formRef,
					Message:  "Sensitive form fields lack autocomplete=\"off\" attribute",
					Fix:      "Add autocomplete=\"off\" to password and credit card fields",
				})
			}
		}
	}

	return findings
}

func hasPasswordField(inputs []crawler.FormInput) bool {
	for _, input := range inputs {
		if input.Type == "password" {
			return true
		}
	}
	return false
}

func hasAutocompleteIssue(inputs []crawler.FormInput) bool {
	sensitiveTypes := map[string]bool{"password": true, "credit-card": true}
	sensitiveNames := []string{"password", "passwd", "pwd", "cc", "card", "cvv", "ssn"}

	for _, input := range inputs {
		if sensitiveTypes[input.Type] {
			return true
		}
		nameLower := strings.ToLower(input.Name)
		for _, s := range sensitiveNames {
			if strings.Contains(nameLower, s) {
				return true
			}
		}
	}
	return false
}
