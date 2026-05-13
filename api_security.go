package inspect

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// APISecurityChecker performs security audits against REST API endpoints.
type APISecurityChecker struct {
	BaseURL string
	Headers map[string]string
	Timeout time.Duration
}

// NewAPISecurityChecker creates an APISecurityChecker with sensible defaults.
func NewAPISecurityChecker(baseURL string) *APISecurityChecker {
	return &APISecurityChecker{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Headers: make(map[string]string),
		Timeout: 10 * time.Second,
	}
}

// JWTClaims represents decoded JWT claims for analysis.
type JWTClaims struct {
	Header  map[string]interface{}
	Payload map[string]interface{}
}

// httpClient returns a configured HTTP client.
func (a *APISecurityChecker) httpClient() *http.Client {
	return &http.Client{
		Timeout: a.Timeout,
	}
}

// newRequest creates a request with the configured headers.
func (a *APISecurityChecker) newRequest(method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	for k, v := range a.Headers {
		req.Header.Set(k, v)
	}
	return req, nil
}

// CheckCORS tests for CORS misconfiguration by sending requests with various
// Origin headers and checking if the server reflects arbitrary origins.
func (a *APISecurityChecker) CheckCORS(url string) []Finding {
	var findings []Finding
	client := a.httpClient()

	testOrigins := []string{
		"https://evil.com",
		"https://attacker.example.org",
		"null",
	}

	for _, origin := range testOrigins {
		req, err := a.newRequest("GET", url, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Origin", origin)

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		acao := resp.Header.Get("Access-Control-Allow-Origin")
		acac := resp.Header.Get("Access-Control-Allow-Credentials")

		if acao == "*" && acac == "true" {
			findings = append(findings, Finding{
				Check:    "api-cors",
				Severity: SeverityCritical,
				URL:      url,
				Message:  "CORS allows all origins with credentials",
				Evidence: fmt.Sprintf("Access-Control-Allow-Origin: %s, Access-Control-Allow-Credentials: %s", acao, acac),
				Fix:      "Restrict Access-Control-Allow-Origin to specific trusted domains and never combine wildcard with credentials",
			})
			break
		}

		if acao == origin && origin != "null" {
			sev := SeverityMedium
			if acac == "true" {
				sev = SeverityHigh
			}
			findings = append(findings, Finding{
				Check:    "api-cors",
				Severity: sev,
				URL:      url,
				Message:  fmt.Sprintf("CORS reflects arbitrary origin: %s", origin),
				Evidence: fmt.Sprintf("Access-Control-Allow-Origin: %s", acao),
				Fix:      "Validate Origin against a whitelist of trusted domains",
			})
		}

		if acao == "null" {
			findings = append(findings, Finding{
				Check:    "api-cors",
				Severity: SeverityMedium,
				URL:      url,
				Message:  "CORS allows null origin",
				Evidence: "Access-Control-Allow-Origin: null",
				Fix:      "Do not allow null origin; use specific domain whitelist",
			})
		}
	}

	return findings
}

// CheckRateLimiting sends rapid requests to detect missing rate limiting.
func (a *APISecurityChecker) CheckRateLimiting(url string) []Finding {
	var findings []Finding
	client := a.httpClient()

	const requestCount = 20
	successCount := 0
	var rateLimitHeaderFound bool

	for i := 0; i < requestCount; i++ {
		req, err := a.newRequest("GET", url, nil)
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			rateLimitHeaderFound = true
			break
		}

		// Check for rate limit headers
		if resp.Header.Get("X-RateLimit-Limit") != "" ||
			resp.Header.Get("X-Rate-Limit-Limit") != "" ||
			resp.Header.Get("RateLimit-Limit") != "" ||
			resp.Header.Get("Retry-After") != "" {
			rateLimitHeaderFound = true
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			successCount++
		}
	}

	if !rateLimitHeaderFound && successCount == requestCount {
		findings = append(findings, Finding{
			Check:    "api-rate-limit",
			Severity: SeverityMedium,
			URL:      url,
			Message:  fmt.Sprintf("No rate limiting detected after %d rapid requests", requestCount),
			Evidence: fmt.Sprintf("All %d requests returned success with no rate limit headers", successCount),
			Fix:      "Implement rate limiting (e.g., X-RateLimit-Limit header and 429 responses)",
		})
	}

	return findings
}

// CheckAuthHeaders checks for missing security headers on API responses.
func (a *APISecurityChecker) CheckAuthHeaders(url string) []Finding {
	var findings []Finding
	client := a.httpClient()

	req, err := a.newRequest("GET", url, nil)
	if err != nil {
		return findings
	}

	resp, err := client.Do(req)
	if err != nil {
		return findings
	}
	resp.Body.Close()

	requiredHeaders := []struct {
		Name     string
		Severity Severity
		Fix      string
	}{
		{"X-Content-Type-Options", SeverityMedium, "Add header: X-Content-Type-Options: nosniff"},
		{"Strict-Transport-Security", SeverityHigh, "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains"},
		{"X-Frame-Options", SeverityMedium, "Add header: X-Frame-Options: DENY or SAMEORIGIN"},
		{"Cache-Control", SeverityLow, "Add header: Cache-Control: no-store for sensitive API responses"},
		{"X-Request-Id", SeverityInfo, "Add X-Request-Id header for request tracing and debugging"},
	}

	for _, h := range requiredHeaders {
		if resp.Header.Get(h.Name) == "" {
			findings = append(findings, Finding{
				Check:    "api-security-headers",
				Severity: h.Severity,
				URL:      url,
				Message:  fmt.Sprintf("Missing security header: %s", h.Name),
				Fix:      h.Fix,
			})
		}
	}

	// Check for overly permissive cache headers on API responses
	cacheControl := resp.Header.Get("Cache-Control")
	if cacheControl != "" && !strings.Contains(cacheControl, "no-store") && !strings.Contains(cacheControl, "private") {
		findings = append(findings, Finding{
			Check:    "api-security-headers",
			Severity: SeverityLow,
			URL:      url,
			Message:  "API response may be cached publicly",
			Evidence: fmt.Sprintf("Cache-Control: %s", cacheControl),
			Fix:      "Use Cache-Control: no-store or private for API responses with sensitive data",
		})
	}

	return findings
}

// CheckVerbTampering tests unusual HTTP methods for unexpected access.
func (a *APISecurityChecker) CheckVerbTampering(url string) []Finding {
	var findings []Finding
	client := a.httpClient()

	dangerousMethods := []struct {
		Method  string
		Message string
	}{
		{"TRACE", "TRACE method enabled — may allow cross-site tracing (XST)"},
		{"PUT", "PUT method accepted — may allow unauthorized resource modification"},
		{"DELETE", "DELETE method accepted — may allow unauthorized resource deletion"},
		{"PATCH", "PATCH method accepted — may allow unauthorized resource modification"},
	}

	for _, m := range dangerousMethods {
		req, err := a.newRequest(m.Method, url, nil)
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		resp.Body.Close()

		// TRACE is especially dangerous if it echoes back the request
		if m.Method == "TRACE" && resp.StatusCode == http.StatusOK {
			findings = append(findings, Finding{
				Check:    "api-verb-tampering",
				Severity: SeverityHigh,
				URL:      url,
				Message:  m.Message,
				Evidence: fmt.Sprintf("Status: %d", resp.StatusCode),
				Fix:      "Disable TRACE method on the server",
			})
			continue
		}

		// For other methods, flag if they return success without auth
		if m.Method != "TRACE" && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			findings = append(findings, Finding{
				Check:    "api-verb-tampering",
				Severity: SeverityMedium,
				URL:      url,
				Message:  m.Message,
				Evidence: fmt.Sprintf("Status: %d, Body: %s", resp.StatusCode, truncateEvidence(string(body), 80)),
				Fix:      fmt.Sprintf("Restrict %s method to authorized users or return 405 Method Not Allowed", m.Method),
			})
		}
	}

	// Check OPTIONS to see what methods are advertised
	req, err := a.newRequest("OPTIONS", url, nil)
	if err == nil {
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			allow := resp.Header.Get("Allow")
			if allow == "" {
				allow = resp.Header.Get("Access-Control-Allow-Methods")
			}
			if allow != "" {
				upper := strings.ToUpper(allow)
				if strings.Contains(upper, "TRACE") {
					findings = append(findings, Finding{
						Check:    "api-verb-tampering",
						Severity: SeverityMedium,
						URL:      url,
						Message:  "OPTIONS response advertises TRACE method",
						Evidence: fmt.Sprintf("Allow: %s", allow),
						Fix:      "Remove TRACE from allowed methods",
					})
				}
			}
		}
	}

	return findings
}

// CheckErrorLeakage sends malformed requests and checks if error responses
// leak stack traces, internal paths, or version information.
func (a *APISecurityChecker) CheckErrorLeakage(url string) []Finding {
	var findings []Finding
	client := a.httpClient()

	// Patterns that indicate information leakage
	leakPatterns := []struct {
		Pattern string
		Message string
	}{
		{"at ", "Stack trace leaked in error response"},
		{"goroutine ", "Go stack trace leaked in error response"},
		{"Traceback", "Python traceback leaked in error response"},
		{"Exception in", "Exception details leaked in error response"},
		{"/usr/", "Internal file path leaked in error response"},
		{"/home/", "Internal file path leaked in error response"},
		{"/var/", "Internal file path leaked in error response"},
		{"C:\\", "Windows file path leaked in error response"},
		{"mysql", "Database information leaked in error response"},
		{"postgres", "Database information leaked in error response"},
		{"SQLSTATE", "SQL error leaked in error response"},
		{"X-Powered-By", "Server technology leaked via header"},
	}

	// Send malformed requests to trigger errors
	malformedRequests := []struct {
		Method      string
		Path        string
		ContentType string
		Body        string
	}{
		{"GET", url + "/%00", "", ""},
		{"POST", url, "application/json", "{invalid json"},
		{"GET", url + "/../../../etc/passwd", "", ""},
		{"GET", url + "?id=1'OR'1'='1", "", ""},
	}

	for _, mr := range malformedRequests {
		var bodyReader io.Reader
		if mr.Body != "" {
			bodyReader = strings.NewReader(mr.Body)
		}

		req, err := a.newRequest(mr.Method, mr.Path, bodyReader)
		if err != nil {
			continue
		}
		if mr.ContentType != "" {
			req.Header.Set("Content-Type", mr.ContentType)
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()

		bodyStr := string(body)

		// Check response headers for leakage
		if server := resp.Header.Get("Server"); server != "" {
			// Check if it reveals detailed version info
			if strings.ContainsAny(server, "0123456789.") && len(server) > 5 {
				findings = append(findings, Finding{
					Check:    "api-error-leakage",
					Severity: SeverityLow,
					URL:      mr.Path,
					Message:  "Server version information disclosed",
					Evidence: fmt.Sprintf("Server: %s", server),
					Fix:      "Remove or genericize the Server header",
				})
			}
		}
		if xpb := resp.Header.Get("X-Powered-By"); xpb != "" {
			findings = append(findings, Finding{
				Check:    "api-error-leakage",
				Severity: SeverityLow,
				URL:      mr.Path,
				Message:  "X-Powered-By header discloses technology stack",
				Evidence: fmt.Sprintf("X-Powered-By: %s", xpb),
				Fix:      "Remove the X-Powered-By header",
			})
		}

		// Check body for leakage patterns
		for _, lp := range leakPatterns {
			if strings.Contains(bodyStr, lp.Pattern) {
				findings = append(findings, Finding{
					Check:    "api-error-leakage",
					Severity: SeverityMedium,
					URL:      mr.Path,
					Message:  lp.Message,
					Evidence: truncateEvidence(bodyStr, 120),
					Fix:      "Return generic error messages in production; log details server-side only",
				})
				break // One finding per request is enough
			}
		}
	}

	return findings
}

// CheckJWTWeakness analyzes a JWT token structure for common weaknesses:
// none algorithm, weak signing, missing expiry, excessive claims.
func (a *APISecurityChecker) CheckJWTWeakness(token string) []Finding {
	var findings []Finding

	claims, err := ParseJWT(token)
	if err != nil {
		findings = append(findings, Finding{
			Check:    "api-jwt",
			Severity: SeverityInfo,
			URL:      a.BaseURL,
			Message:  fmt.Sprintf("Could not parse JWT: %s", err.Error()),
		})
		return findings
	}

	// Check for "none" algorithm
	if alg, ok := claims.Header["alg"]; ok {
		algStr, _ := alg.(string)
		algLower := strings.ToLower(algStr)
		if algLower == "none" || algLower == "nonce" {
			findings = append(findings, Finding{
				Check:    "api-jwt",
				Severity: SeverityCritical,
				URL:      a.BaseURL,
				Message:  "JWT uses 'none' algorithm — signature verification bypassed",
				Evidence: fmt.Sprintf("alg: %s", algStr),
				Fix:      "Never accept tokens with alg=none; enforce RS256 or ES256",
			})
		}

		// Check for weak algorithms
		if algLower == "hs256" {
			findings = append(findings, Finding{
				Check:    "api-jwt",
				Severity: SeverityLow,
				URL:      a.BaseURL,
				Message:  "JWT uses HS256 (symmetric) algorithm — consider asymmetric signing",
				Evidence: fmt.Sprintf("alg: %s", algStr),
				Fix:      "Use RS256 or ES256 for better key management and rotation",
			})
		}
	} else {
		findings = append(findings, Finding{
			Check:    "api-jwt",
			Severity: SeverityHigh,
			URL:      a.BaseURL,
			Message:  "JWT header missing 'alg' field",
			Fix:      "Include algorithm specification in JWT header",
		})
	}

	// Check for missing expiry
	if _, ok := claims.Payload["exp"]; !ok {
		findings = append(findings, Finding{
			Check:    "api-jwt",
			Severity: SeverityHigh,
			URL:      a.BaseURL,
			Message:  "JWT missing expiration claim (exp)",
			Fix:      "Always include 'exp' claim with a reasonable TTL",
		})
	} else {
		// Check if expiry is excessively long (> 24 hours from token perspective)
		if exp, ok := claims.Payload["exp"].(float64); ok {
			if iat, ok := claims.Payload["iat"].(float64); ok {
				duration := time.Duration(exp-iat) * time.Second
				if duration > 24*time.Hour {
					findings = append(findings, Finding{
						Check:    "api-jwt",
						Severity: SeverityLow,
						URL:      a.BaseURL,
						Message:  fmt.Sprintf("JWT has long expiry: %s", duration.String()),
						Fix:      "Use short-lived tokens (15min-1hr) with refresh tokens for better security",
					})
				}
			}
		}
	}

	// Check for missing issuer
	if _, ok := claims.Payload["iss"]; !ok {
		findings = append(findings, Finding{
			Check:    "api-jwt",
			Severity: SeverityLow,
			URL:      a.BaseURL,
			Message:  "JWT missing issuer claim (iss)",
			Fix:      "Include 'iss' claim and validate it on the server",
		})
	}

	// Check for excessive claims (potential data exposure)
	if len(claims.Payload) > 10 {
		findings = append(findings, Finding{
			Check:    "api-jwt",
			Severity: SeverityLow,
			URL:      a.BaseURL,
			Message:  fmt.Sprintf("JWT contains %d claims — possible excessive data exposure", len(claims.Payload)),
			Fix:      "Minimize JWT payload; store detailed data server-side and reference by ID",
		})
	}

	// Check for sensitive data in claims
	sensitiveKeys := []string{"password", "secret", "ssn", "credit_card", "cc_number"}
	for _, key := range sensitiveKeys {
		if _, ok := claims.Payload[key]; ok {
			findings = append(findings, Finding{
				Check:    "api-jwt",
				Severity: SeverityCritical,
				URL:      a.BaseURL,
				Message:  fmt.Sprintf("JWT contains sensitive data in claim: %s", key),
				Fix:      "Never store secrets or sensitive PII in JWT claims — they are base64 encoded, not encrypted",
			})
		}
	}

	return findings
}

// ParseJWT decodes a JWT token without signature validation (for analysis purposes).
func ParseJWT(token string) (*JWTClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 || len(parts) > 3 {
		return nil, fmt.Errorf("invalid JWT format: expected 2-3 parts, got %d", len(parts))
	}

	header, err := decodeJWTSegment(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid JWT header: %w", err)
	}

	payload, err := decodeJWTSegment(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid JWT payload: %w", err)
	}

	return &JWTClaims{Header: header, Payload: payload}, nil
}

// decodeJWTSegment decodes a base64url-encoded JWT segment into a map.
func decodeJWTSegment(segment string) (map[string]interface{}, error) {
	// Add padding if needed
	switch len(segment) % 4 {
	case 2:
		segment += "=="
	case 3:
		segment += "="
	}

	data, err := base64.URLEncoding.DecodeString(segment)
	if err != nil {
		// Try standard encoding as fallback
		data, err = base64.StdEncoding.DecodeString(segment)
		if err != nil {
			return nil, err
		}
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	return result, nil
}
