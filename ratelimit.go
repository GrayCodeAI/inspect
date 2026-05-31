package inspect

import (
	"context"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// hostLimit pairs a per-host limiter with the time it was last accessed.
type hostLimit struct {
	limiter  *rate.Limiter
	lastUsed time.Time
}

// RateLimiter provides per-host rate limiting for crawl requests. Each host
// gets its own token-bucket limiter so that aggressive crawling of one host
// does not throttle requests to others. Stale limiters are cleaned up
// periodically.
type RateLimiter struct {
	limits            map[string]*hostLimit
	mu                sync.Mutex
	requestsPerSecond float64
	burst             int
	cleanupInterval   time.Duration
	stopCleanup       chan struct{}
}

// RateLimiterOption is a functional option for configuring a RateLimiter.
type RateLimiterOption func(*RateLimiter)

// WithCleanupInterval sets how often stale host limiters are reaped.
// A host is considered stale when it has not been used for 5 minutes.
// The default cleanup interval is 1 minute.
func WithCleanupInterval(d time.Duration) RateLimiterOption {
	return func(rl *RateLimiter) {
		rl.cleanupInterval = d
	}
}

// NewRateLimiter creates a per-host rate limiter that allows rps requests per
// second with the given burst size. Each host that is seen gets its own
// independent limiter. Background cleanup removes limiters for hosts that
// have not been accessed in 5 minutes.
func NewRateLimiter(rps float64, burst int, opts ...RateLimiterOption) *RateLimiter {
	rl := &RateLimiter{
		limits:            make(map[string]*hostLimit),
		requestsPerSecond: rps,
		burst:             burst,
		cleanupInterval:   time.Minute,
		stopCleanup:       make(chan struct{}),
	}

	for _, opt := range opts {
		opt(rl)
	}

	go rl.cleanupLoop()

	return rl
}

// getOrCreate returns the limiter for host, creating one if it does not exist.
// Caller must hold rl.mu.
func (rl *RateLimiter) getOrCreate(host string) *hostLimit {
	hl, ok := rl.limits[host]
	if !ok {
		hl = &hostLimit{
			limiter: rate.NewLimiter(rate.Limit(rl.requestsPerSecond), rl.burst),
		}
		rl.limits[host] = hl
	}
	hl.lastUsed = time.Now()
	return hl
}

// Wait blocks until a request for host is allowed or ctx is cancelled.
func (rl *RateLimiter) Wait(ctx context.Context, host string) error {
	rl.mu.Lock()
	hl := rl.getOrCreate(host)
	rl.mu.Unlock()

	return hl.limiter.Wait(ctx)
}

// Allow reports whether a request for host is allowed right now without
// blocking. Returns true if the request may proceed.
func (rl *RateLimiter) Allow(host string) bool {
	rl.mu.Lock()
	hl := rl.getOrCreate(host)
	rl.mu.Unlock()

	return hl.limiter.Allow()
}

// ActiveHosts returns the number of hosts currently being tracked.
func (rl *RateLimiter) ActiveHosts() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	return len(rl.limits)
}

// Close stops the background cleanup goroutine. After Close is called the
// limiter should not be used.
func (rl *RateLimiter) Close() {
	close(rl.stopCleanup)
}

// cleanupLoop periodically removes limiters for hosts that have not been
// accessed in the stale threshold (5 minutes).
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.reapStale()
		case <-rl.stopCleanup:
			return
		}
	}
}

const staleThreshold = 5 * time.Minute

// reapStale removes host limiters that have not been used recently.
func (rl *RateLimiter) reapStale() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for host, hl := range rl.limits {
		if now.Sub(hl.lastUsed) > staleThreshold {
			delete(rl.limits, host)
		}
	}
}
