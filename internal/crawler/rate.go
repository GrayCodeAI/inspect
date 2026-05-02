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
	r.mu.Lock()
	now := time.Now()
	if elapsed := now.Sub(r.last); elapsed < r.interval {
		wait := r.interval - elapsed
		r.last = now.Add(wait)
		r.mu.Unlock()

		select {
		case <-time.After(wait):
		case <-ctx.Done():
		}
		return
	}
	r.last = now
	r.mu.Unlock()
}
