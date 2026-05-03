package checks

import (
	"crypto/tls"
	"fmt"
	"time"

	"github.com/GrayCodeAI/inspect"
)

// TLSCheck validates TLS/SSL configuration.
type TLSCheck struct{}

func (c *TLSCheck) Name() string { return "tls" }

func (c *TLSCheck) Run(resp *Response) []inspect.Finding {
	var findings []inspect.Finding

	if resp.TLSState == nil {
		return findings
	}

	// Check TLS version
	switch resp.TLSState.Version {
	case tls.VersionTLS10:
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityCritical,
			URL:      resp.URL,
			Element:  "TLS Version",
			Message:  "TLS 1.0 is deprecated and insecure",
			Fix:      "Upgrade to TLS 1.2 minimum; configure server to disable TLS 1.0/1.1",
		})
	case tls.VersionTLS11:
		findings = append(findings, inspect.Finding{
			Check:    c.Name(),
			Severity: inspect.SeverityHigh,
			URL:      resp.URL,
			Element:  "TLS Version",
			Message:  "TLS 1.1 is deprecated and insecure",
			Fix:      "Upgrade to TLS 1.2 minimum; configure server to disable TLS 1.0/1.1",
		})
	}

	// Check certificate expiry
	if !resp.CertExpiry.IsZero() {
		daysUntilExpiry := time.Until(resp.CertExpiry).Hours() / 24

		if daysUntilExpiry < 0 {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityCritical,
				URL:      resp.URL,
				Element:  "Certificate",
				Message:  "SSL certificate has expired",
				Fix:      "Renew the SSL certificate immediately",
				Evidence: fmt.Sprintf("Expired: %s", resp.CertExpiry.Format(time.RFC3339)),
			})
		} else if daysUntilExpiry < 30 {
			findings = append(findings, inspect.Finding{
				Check:    c.Name(),
				Severity: inspect.SeverityHigh,
				URL:      resp.URL,
				Element:  "Certificate",
				Message:  fmt.Sprintf("SSL certificate expires in %.0f days", daysUntilExpiry),
				Fix:      "Renew the SSL certificate; consider auto-renewal with Let's Encrypt",
				Evidence: fmt.Sprintf("Expires: %s", resp.CertExpiry.Format(time.RFC3339)),
			})
		}
	}

	return findings
}
