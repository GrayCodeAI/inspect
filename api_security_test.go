package inspect

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNewAPISecurityChecker(t *testing.T) {
	checker := NewAPISecurityChecker("https://api.example.com/")
	if checker.BaseURL != "https://api.example.com" {
		t.Errorf("expected trailing slash stripped, got %s", checker.BaseURL)
	}
	if checker.Timeout != 10*time.Second {
		t.Errorf("expected 10s timeout, got %s", checker.Timeout)
	}
	if checker.Headers == nil {
		t.Error("expected non-nil Headers map")
	}
}

func TestCheckCORS_ReflectsOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	if len(findings) == 0 {
		t.Fatal("expected CORS findings for reflected origin")
	}

	found := false
	for _, f := range findings {
		if f.Check == "api-cors" && f.Severity == SeverityHigh {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected high severity finding for reflected origin with credentials")
	}
}

func TestCheckCORS_WildcardWithCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	if len(findings) == 0 {
		t.Fatal("expected CORS findings for wildcard with credentials")
	}

	if findings[0].Severity != SeverityCritical {
		t.Errorf("expected critical severity, got %s", findings[0].Severity)
	}
}

func TestCheckCORS_NullOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "null" {
			w.Header().Set("Access-Control-Allow-Origin", "null")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "null origin") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected finding for null origin acceptance")
	}
}

func TestCheckCORS_Secure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Do not reflect origin — secure setup
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckCORS(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings for secure CORS, got %d", len(findings))
	}
}

func TestCheckRateLimiting_NoLimiting(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) == 0 {
		t.Fatal("expected rate limiting finding")
	}
	if findings[0].Check != "api-rate-limit" {
		t.Errorf("expected check api-rate-limit, got %s", findings[0].Check)
	}
}

func TestCheckRateLimiting_WithRateLimiting(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount > 5 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when rate limiting is active, got %d", len(findings))
	}
}

func TestCheckRateLimiting_WithHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Limit", "100")
		w.Header().Set("X-RateLimit-Remaining", "99")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckRateLimiting(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when rate limit headers present, got %d", len(findings))
	}
}

func TestCheckAuthHeaders_MissingHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckAuthHeaders(server.URL + "/api")

	if len(findings) == 0 {
		t.Fatal("expected findings for missing security headers")
	}

	// Should detect missing X-Content-Type-Options, Strict-Transport-Security, etc.
	headerNames := make(map[string]bool)
	for _, f := range findings {
		if strings.Contains(f.Message, "X-Content-Type-Options") {
			headerNames["X-Content-Type-Options"] = true
		}
		if strings.Contains(f.Message, "Strict-Transport-Security") {
			headerNames["Strict-Transport-Security"] = true
		}
	}

	if !headerNames["X-Content-Type-Options"] {
		t.Error("expected finding for missing X-Content-Type-Options")
	}
	if !headerNames["Strict-Transport-Security"] {
		t.Error("expected finding for missing Strict-Transport-Security")
	}
}

func TestCheckAuthHeaders_AllPresent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Request-Id", "abc123")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckAuthHeaders(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings when all headers present, got %d: %+v", len(findings), findings)
	}
}

func TestCheckVerbTampering_TraceEnabled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "TRACE" {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, "TRACE echoed")
			return
		}
		if r.Method == "OPTIONS" {
			w.Header().Set("Allow", "GET, POST, TRACE")
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckVerbTampering(server.URL + "/api")

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "TRACE") && f.Severity == SeverityHigh {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected high severity finding for TRACE enabled")
	}
}

func TestCheckVerbTampering_Secure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			w.WriteHeader(http.StatusOK)
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

	if len(findings) != 0 {
		t.Errorf("expected no findings for secure verb handling, got %d: %+v", len(findings), findings)
	}
}

func TestCheckErrorLeakage_StackTrace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Powered-By", "Express 4.18.2")
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "Error at /usr/local/app/server.js:42\n  at Function.handle (/usr/local/app/node_modules/express/lib/router/index.js:174:3)")
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	if len(findings) == 0 {
		t.Fatal("expected findings for leaked stack trace")
	}

	foundXPB := false
	foundPath := false
	for _, f := range findings {
		if strings.Contains(f.Message, "X-Powered-By") {
			foundXPB = true
		}
		if strings.Contains(f.Message, "file path") || strings.Contains(f.Message, "Stack trace") {
			foundPath = true
		}
	}
	if !foundXPB {
		t.Error("expected finding for X-Powered-By header")
	}
	if !foundPath {
		t.Error("expected finding for leaked file path or stack trace")
	}
}

func TestCheckErrorLeakage_Clean(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error": "Bad Request", "message": "Invalid input"}`)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	findings := checker.CheckErrorLeakage(server.URL + "/api")

	if len(findings) != 0 {
		t.Errorf("expected no findings for clean error responses, got %d: %+v", len(findings), findings)
	}
}

func TestCheckJWTWeakness_NoneAlgorithm(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","name":"test"}`))
	token := header + "." + payload + "."

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if f.Severity == SeverityCritical && strings.Contains(f.Message, "none") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected critical finding for none algorithm")
	}
}

func TestCheckJWTWeakness_MissingExpiry(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","iss":"auth.example.com"}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "expiration") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected finding for missing expiry claim")
	}
}

func TestCheckJWTWeakness_SensitiveData(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","exp":9999999999,"iss":"auth","password":"secret123"}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if f.Severity == SeverityCritical && strings.Contains(f.Message, "password") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected critical finding for password in JWT claims")
	}
}

func TestCheckJWTWeakness_LongExpiry(t *testing.T) {
	now := time.Now().Unix()
	iat := now
	exp := now + 7*24*3600 // 7 days

	payloadData := map[string]interface{}{
		"sub": "1234",
		"iss": "auth.example.com",
		"iat": iat,
		"exp": exp,
	}
	payloadBytes, _ := json.Marshal(payloadData)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "long expiry") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected finding for long expiry JWT")
	}
}

func TestCheckJWTWeakness_HS256(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","exp":9999999999,"iss":"auth"}`))
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "HS256") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected finding for HS256 usage")
	}
}

func TestParseJWT_Valid(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"1234","name":"John"}`))
	token := header + "." + payload + ".signature"

	claims, err := ParseJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if claims.Header["alg"] != "RS256" {
		t.Errorf("expected alg RS256, got %v", claims.Header["alg"])
	}
	if claims.Payload["sub"] != "1234" {
		t.Errorf("expected sub 1234, got %v", claims.Payload["sub"])
	}
}

func TestParseJWT_Invalid(t *testing.T) {
	_, err := ParseJWT("not.a.valid.jwt.token")
	if err == nil {
		t.Error("expected error for invalid JWT")
	}

	_, err = ParseJWT("single")
	if err == nil {
		t.Error("expected error for single-part token")
	}
}

func TestCheckJWTWeakness_ExcessiveClaims(t *testing.T) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))

	claims := map[string]interface{}{
		"sub": "1234", "exp": 9999999999, "iss": "auth",
		"claim1": "v1", "claim2": "v2", "claim3": "v3",
		"claim4": "v4", "claim5": "v5", "claim6": "v6",
		"claim7": "v7", "claim8": "v8",
	}
	payloadBytes, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	token := header + "." + payload + ".signature"

	checker := NewAPISecurityChecker("https://api.example.com")
	findings := checker.CheckJWTWeakness(token)

	found := false
	for _, f := range findings {
		if strings.Contains(f.Message, "claims") && strings.Contains(f.Message, "excessive") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected finding for excessive claims")
	}
}

func TestAPISecurityChecker_CustomHeaders(t *testing.T) {
	var receivedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Request-Id", "test")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	checker := NewAPISecurityChecker(server.URL)
	checker.Headers["Authorization"] = "Bearer test-token"
	checker.CheckAuthHeaders(server.URL + "/api")

	if receivedAuth != "Bearer test-token" {
		t.Errorf("expected custom auth header to be sent, got %q", receivedAuth)
	}
}
