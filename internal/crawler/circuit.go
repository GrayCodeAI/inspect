package crawler

import (
	"net/url"
	"sync"
	"time"
)

// CircuitState represents the state of a per-host circuit breaker.
type CircuitState int

const (
	// CircuitClosed is the normal operating state; requests are allowed.
	CircuitClosed CircuitState = iota
	// CircuitOpen means the host has exceeded the failure threshold; requests are blocked.
	CircuitOpen
	// CircuitHalfOpen allows a single probe request through to test if the host has recovered.
	CircuitHalfOpen
)

// HostCircuitBreaker tracks consecutive failures for a single host and
// automatically opens the circuit when the threshold is reached, closing
// it again after a cooldown period.
type HostCircuitBreaker struct {
	mu          sync.Mutex
	failures    int
	lastFailure time.Time
	state       CircuitState
	threshold   int
	cooldown    time.Duration
}

// newHostCircuitBreaker creates a breaker with the given threshold and cooldown.
func newHostCircuitBreaker(threshold int, cooldown time.Duration) *HostCircuitBreaker {
	return &HostCircuitBreaker{
		threshold: threshold,
		cooldown:  cooldown,
		state:     CircuitClosed,
	}
}

// AllowRequest reports whether a request to this host should be allowed.
// It transitions from Open to HalfOpen when the cooldown has elapsed.
func (b *HostCircuitBreaker) AllowRequest() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case CircuitClosed:
		return true
	case CircuitOpen:
		if time.Since(b.lastFailure) >= b.cooldown {
			b.state = CircuitHalfOpen
			return true // allow one probe
		}
		return false
	case CircuitHalfOpen:
		return true // allow the in-flight probe
	}
	return false
}

// RecordFailure increments the consecutive failure count and may open the circuit.
func (b *HostCircuitBreaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.failures++
	b.lastFailure = time.Now()

	if b.failures >= b.threshold {
		b.state = CircuitOpen
	}
}

// RecordSuccess resets the failure count and closes the circuit.
func (b *HostCircuitBreaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.failures = 0
	b.state = CircuitClosed
}

// State returns the current circuit state (for testing/diagnostics).
func (b *HostCircuitBreaker) State() CircuitState {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

// CircuitBreakerRegistry manages per-host circuit breakers.
// It is safe for concurrent use.
type CircuitBreakerRegistry struct {
	mu        sync.Mutex
	breakers  map[string]*HostCircuitBreaker
	threshold int
	cooldown  time.Duration
}

// NewCircuitBreakerRegistry creates a registry with the given failure threshold
// and cooldown duration. When threshold consecutive failures are recorded for a
// host, the circuit opens. After cooldown elapses the circuit half-opens to
// allow a single probe request.
func NewCircuitBreakerRegistry(threshold int, cooldown time.Duration) *CircuitBreakerRegistry {
	return &CircuitBreakerRegistry{
		breakers:  make(map[string]*HostCircuitBreaker),
		threshold: threshold,
		cooldown:  cooldown,
	}
}

// get returns the breaker for the given host, creating one if necessary.
func (r *CircuitBreakerRegistry) get(host string) *HostCircuitBreaker {
	r.mu.Lock()
	defer r.mu.Unlock()

	b, ok := r.breakers[host]
	if !ok {
		b = newHostCircuitBreaker(r.threshold, r.cooldown)
		r.breakers[host] = b
	}
	return b
}

// AllowRequest reports whether a request to the given host should be allowed.
// The host is typically the hostname portion of a URL (e.g. "example.com").
func (r *CircuitBreakerRegistry) AllowRequest(host string) bool {
	return r.get(host).AllowRequest()
}

// RecordFailure records a failure for the given host.
func (r *CircuitBreakerRegistry) RecordFailure(host string) {
	r.get(host).RecordFailure()
}

// RecordSuccess records a successful response for the given host, resetting
// the failure count and closing the circuit.
func (r *CircuitBreakerRegistry) RecordSuccess(host string) {
	r.get(host).RecordSuccess()
}

// extractHost parses a hostname from a raw URL string.
func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Hostname()
}
