package inspect

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckRateLimiting_RateLimitLimitHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("RateLimit-Limit", "100")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when RateLimit-Limit header present, got %d", len(findings))
	}
}

func TestCheckRateLimiting_RetryAfterHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when Retry-After header present, got %d", len(findings))
	}
}

func TestCheckCORS_NoOriginSent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Don't set any CORS headers
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when no CORS headers returned, got %d", len(findings))
	}
}

func TestCheckVerbTampering_OptionsAdvertisesTrace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			w.WriteHeader(http.StatusOK)
		case "TRACE":
			w.WriteHeader(http.StatusMethodNotAllowed)
		case "OPTIONS":
			w.Header().Set("Allow", "GET, POST, TRACE")
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckVerbTampering(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "OPTIONS") && strings.Contains(f.Message, "TRACE") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for OPTIONS advertising TRACE method")
	}
}

func TestCheckVerbTampering_PUTAccepted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "PUT":
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, "created")
		case "OPTIONS":
			w.Header().Set("Allow", "GET, POST")
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckVerbTampering(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "PUT") && f.Severity == SeverityMedium {
			found = true
		}
	}
	if !found {
		t.Error("expected medium severity finding for accepted PUT method")
	}
}

func TestCheckErrorLeakage_SQLLeak(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "SQLSTATE[HY000]: General error: 1 table users does not exist")
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "SQL") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for SQL error leakage")
	}
}

func TestCheckErrorLeakage_ServerVersionHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "nginx/1.21.6")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Server version") || strings.Contains(f.Message, "Server") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for server version disclosure")
	}
}

func TestCheckAuthHeaders_PublicCache(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckAuthHeaders(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "cached publicly") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for publicly cacheable API response")
	}
}

func TestCheckJWTWeakness_MissingAlg(t *testing.T) {
	// JWT header without alg field
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","exp":9999999999}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "missing") && strings.Contains(f.Message, "alg") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing alg field in JWT header")
	}
}

func TestCheckJWTWeakness_MissingIssuer(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","exp":9999999999}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "issuer") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for missing issuer claim")
	}
}

func TestCheckJWTWeakness_CleanToken(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","exp":9999999999,"iss":"auth.example.com"}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	// Should have no findings for a clean token
	if len(findings) != 0 {
		t.Errorf("expected no findings for clean RS256 token, got %d: %+v", len(findings), findings)
	}
}

func TestParseJWT_TwoParts(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1"}`))
	token := header + "." + payload

	claims, err := ParseJWT(token)
	if err != nil {
		t.Fatalf("unexpected error for 2-part JWT: %v", err)
	}
	if claims.Header["alg"] != "RS256" {
		t.Errorf("expected alg RS256, got %v", claims.Header["alg"])
	}
}

func TestCheckErrorLeakage_PythonTraceback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "Traceback (most recent call last):\n  File \"/app/main.py\", line 42")
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Python traceback") || strings.Contains(f.Message, "Traceback") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for Python traceback leakage")
	}
}

func TestCheckErrorLeakage_GoStackTrace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "goroutine 1 [running]:\nmain.handler()\n\t/app/main.go:42 +0x1234")
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "Go stack trace") || strings.Contains(f.Message, "goroutine") {
			found = true
		}
	}
	if !found {
		t.Error("expected finding for Go stack trace leakage")
	}
}

func TestAPISecurityChecker_Timeout(t *testing.T) {
	checker := NewAPISecurityChecker("https://api.example.com")
	if checker.Timeout != 10*1e9 { // 10 seconds in nanoseconds
		// Just verify it's set; exact comparison depends on time.Duration
		if checker.Timeout == 0 {
			t.Error("expected non-zero timeout")
		}
	}
}

func TestCheckJWTWeakness_SensitiveDataCreditCard(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256"}`))
	payloadData := map[string]interface{}{
		"sub":        "1234",
		"exp":        float64(9999999999),
		"iss":        "auth",
		"cc_number":  "4111111111111111",
	}
	payloadBytes, _ := json.Marshal(payloadData)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	token := header + "." + payload + ".sig"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if f.Severity == SeverityCritical && strings.Contains(f.Message, "cc_number") {
			found = true
		}
	}
	if !found {
		t.Error("expected critical finding for credit card in JWT claims")
	}
}

func TestCheckCORS_MultipleOriginsReflected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	// Should find at least one reflected origin finding
	if len(findings) == 0 {
		t.Error("expected CORS findings for reflected origins")
	}
}

func TestCheckRateLimiting_PartialRateLimit(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount > 10 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when 429 is returned, got %d", len(findings))
	}
}
