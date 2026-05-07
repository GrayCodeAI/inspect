package crawler

import (
	"context"
	"sync"
	"time"
)

// rateLimiter implements a token bucket rate limiter.
type rateLimiter struct {
	interval time.Duration
	mu       sync.Mutex
	last     time.Time
}

func newRateLimiter(reqPerSec int) *rateLimiter {
	if reqPerSec <= 0 {
		reqPerSec = 10
	}
	return &rateLimiter{
		interval: time.Second / time.Duration(reqPerSec),
	}
}

// Wait blocks until the next request is permitted or ctx is cancelled.
func (r *rateLimiter) Wait(ctx context.Context) {
	// Check context before acquiring lock to avoid blocking on a cancelled context.
	select {
	case <-ctx.Done():
		return
	default:
	}

	r.mu.Lock()
	now := time.Now()
	if elapsed := now.Sub(r.last); elapsed < r.interval {
		wait := r.interval - elapsed
		r.last = now.Add(wait)
		r.mu.Unlock()

		// Use select on both ctx.Done() and time.After simultaneously
		select {
		case <-time.After(wait):
		case <-ctx.Done():
		}
		return
	}
	r.last = now
	r.mu.Unlock()
}
