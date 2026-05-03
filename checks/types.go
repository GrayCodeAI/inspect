package checks

import (
	"crypto/tls"
	"net/http"
	"time"

	"github.com/GrayCodeAI/inspect"
)

// Response represents a crawled HTTP response with all data needed for checks.
type Response struct {
	URL        string
	StatusCode int
	Headers    http.Header
	Body       []byte
	TLSState   *tls.ConnectionState
	CertExpiry time.Time
}

// Check is the interface that all audit checks implement.
type Check interface {
	Name() string
	Run(resp *Response) []inspect.Finding
}

// AllChecks returns all registered checks in recommended execution order.
func AllChecks() []Check {
	return []Check{
		&SecurityHeadersCheck{},
		&CookieSecurityCheck{},
		&TLSCheck{},
		&MixedContentCheck{},
		&MetaTagsCheck{},
		&AccessibilityCheck{},
	}
}
