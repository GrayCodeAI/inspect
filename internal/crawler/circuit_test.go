package crawler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// --- HostCircuitBreaker unit tests ---

func TestHostCircuitBreaker_AllowRequest_Closed(t *testing.T) {
	b := newHostCircuitBreaker(3, time.Second)
	if !b.AllowRequest() {
		t.Error("closed circuit should allow request")
	}
}

func TestHostCircuitBreaker_OpensAfterThreshold(t *testing.T) {
	b := newHostCircuitBreaker(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !b.AllowRequest() {
			t.Fatalf("request %d should be allowed before threshold", i)
		}
		b.RecordFailure()
	}

	if b.AllowRequest() {
		t.Error("request should be blocked after threshold failures")
	}
	if b.State() != CircuitOpen {
		t.Errorf("expected circuit open, got %v", b.State())
	}
}

func TestHostCircuitBreaker_HalfOpenAfterCooldown(t *testing.T) {
	b := newHostCircuitBreaker(2, 50*time.Millisecond)

	b.AllowRequest()
	b.RecordFailure()
	b.AllowRequest()
	b.RecordFailure()

	if b.State() != CircuitOpen {
		t.Fatalf("expected circuit open, got %v", b.State())
	}

	time.Sleep(60 * time.Millisecond)
	if !b.AllowRequest() {
		t.Error("half-open circuit should allow one probe request")
	}
	if b.State() != CircuitHalfOpen {
		t.Errorf("expected circuit half-open, got %v", b.State())
	}
}

func TestHostCircuitBreaker_FailureDuringHalfOpenReopens(t *testing.T) {
	b := newHostCircuitBreaker(2, 50*time.Millisecond)

	b.AllowRequest()
	b.RecordFailure()
	b.AllowRequest()
	b.RecordFailure()

	time.Sleep(60 * time.Millisecond)
	b.AllowRequest()
	b.RecordFailure()

	if b.State() != CircuitOpen {
		t.Errorf("expected circuit re-opened after half-open failure, got %v", b.State())
	}
}

func TestHostCircuitBreaker_SuccessClosesCircuit(t *testing.T) {
	b := newHostCircuitBreaker(2, time.Hour)

	b.AllowRequest()
	b.RecordFailure()
	b.AllowRequest()
	b.RecordFailure()

	if b.State() != CircuitOpen {
		t.Fatalf("expected circuit open, got %v", b.State())
	}

	time.Sleep(60 * time.Millisecond)
	b.AllowRequest() // half-open probe
	b.RecordSuccess()

	if b.State() != CircuitClosed {
		t.Errorf("expected circuit closed after success, got %v", b.State())
	}
}

func TestHostCircuitBreaker_ConcurrentAccess(t *testing.T) {
	b := newHostCircuitBreaker(10, time.Minute)

	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			b.AllowRequest()
			b.RecordFailure()
		}
		close(done)
	}()

	<-done
	if b.State() != CircuitOpen {
		t.Errorf("expected circuit open after concurrent failures, got %v", b.State())
	}
}

// --- CircuitBreakerRegistry tests ---

func TestRegistry_AllowRequest_BlocksOpenHost(t *testing.T) {
	r := NewCircuitBreakerRegistry(2, time.Hour)

	r.RecordFailure("dead.example.com")
	r.RecordFailure("dead.example.com")

	if r.AllowRequest("dead.example.com") {
		t.Error("registry should block request to open circuit")
	}
	if !r.AllowRequest("healthy.example.com") {
		t.Error("healthy host should still be allowed")
	}
}

func TestRegistry_PerHostIsolation(t *testing.T) {
	r := NewCircuitBreakerRegistry(2, time.Hour)

	r.RecordFailure("a.example.com")
	r.RecordFailure("a.example.com")

	if r.AllowRequest("a.example.com") {
		t.Error("a.example.com should be blocked")
	}
	if !r.AllowRequest("b.example.com") {
		t.Error("b.example.com should still be allowed")
	}
}

func TestRegistry_SuccessResets(t *testing.T) {
	r := NewCircuitBreakerRegistry(2, time.Hour)

	r.RecordFailure("host.example.com")
	r.RecordFailure("host.example.com")
	r.RecordSuccess("host.example.com")

	if !r.AllowRequest("host.example.com") {
		t.Error("success should reset circuit to closed")
	}
}

// --- Integration with crawler ---

func TestCrawl_CircuitBreakerSkipsDeadHost(t *testing.T) {
	deadAttempts := 0

	deadMu := http.NewServeMux()
	deadMu.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		deadAttempts++
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `<html><body>unavailable</body></html>`)
	})
	deadSrv := httptest.NewServer(deadMu)
	defer deadSrv.Close()

	healthyMu := http.NewServeMux()
	healthyMu.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body><a href="`+deadSrv.URL+`/">dead link</a></body></html>`)
	})
	healthyMu.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})
	healthyMu.HandleFunc("/sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})
	healthySrv := httptest.NewServer(healthyMu)
	defer healthySrv.Close()

	threshold := 3
	c := New(Config{
		MaxDepth:        2,
		Concurrency:     2,
		Timeout:         30 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       1000,
		RetryAttempts:   1,
		RetryDelay:      10 * time.Millisecond,
		UserAgent:       "test",
		AllowPrivateIPs: true,
		CircuitBreaker:  NewCircuitBreakerRegistry(threshold, time.Hour),
	})

	_, err := c.Crawl(context.Background(), healthySrv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// Dead host may be hit on the initial few attempts but should be skipped
	// once the circuit opens, keeping the total at or below the threshold
	// plus a small margin for race conditions in concurrent workers.
	if deadAttempts > threshold+2 {
		t.Errorf("dead host was called %d times, expected <= %d after circuit opened",
			deadAttempts, threshold+2)
	}
}

func TestCrawl_CircuitBreakerProbesAfterCooldown(t *testing.T) {
	probeCount := 0

	mu := http.NewServeMux()
	mu.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		probeCount++
		w.Header().Set("Content-Type", "text/html")
		if probeCount <= 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `<html><body>unavailable</body></html>`)
			return
		}
		// Recover on attempt 4 (the half-open probe)
		fmt.Fprint(w, `<html><body>healthy</body></html>`)
	})
	mu.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})
	mu.HandleFunc("/sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	})
	srv := httptest.NewServer(mu)
	defer srv.Close()

	c := New(Config{
		MaxDepth:        1,
		Concurrency:     1,
		Timeout:         30 * time.Second,
		PageTimeout:     5 * time.Second,
		RateLimit:       1000,
		RetryAttempts:   1,
		RetryDelay:      10 * time.Millisecond,
		UserAgent:       "test",
		AllowPrivateIPs: true,
		CircuitBreaker:  NewCircuitBreakerRegistry(3, 50*time.Millisecond),
	})

	pages, err := c.Crawl(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("Crawl failed: %v", err)
	}

	// After recovery, the root page should succeed.
	var root *Page
	for _, p := range pages {
		if p.URL == srv.URL || p.URL == srv.URL+"/" {
			root = p
			break
		}
	}
	if root == nil {
		t.Fatal("root page not found")
	}
	if root.Error != nil {
		t.Errorf("expected root page to succeed after recovery, got error: %v", root.Error)
	}
}
