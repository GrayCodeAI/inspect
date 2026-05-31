package inspect

import (
	"context"
	"testing"
	"time"
)

func TestNewRateLimiter(t *testing.T) {
	t.Run("creates limiter with default settings", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		if rl == nil {
			t.Fatal("NewRateLimiter returned nil")
		}
		if rl.ActiveHosts() != 0 {
			t.Errorf("expected 0 active hosts, got %d", rl.ActiveHosts())
		}
	})

	t.Run("creates limiter with cleanup interval option", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5, WithCleanupInterval(30*time.Second))
		defer rl.Close()

		if rl.cleanupInterval != 30*time.Second {
			t.Errorf("expected cleanup interval 30s, got %v", rl.cleanupInterval)
		}
	})

	t.Run("default cleanup interval is one minute", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		if rl.cleanupInterval != time.Minute {
			t.Errorf("expected cleanup interval 1m, got %v", rl.cleanupInterval)
		}
	})
}

func TestRateLimiterAllow(t *testing.T) {
	t.Run("allows first request", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		if !rl.Allow("example.com") {
			t.Error("expected first request to be allowed")
		}
	})

	t.Run("allows requests within burst", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		for i := 0; i < 5; i++ {
			if !rl.Allow("example.com") {
				t.Errorf("request %d should be allowed (within burst)", i+1)
			}
		}
	})

	t.Run("denies request beyond burst", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 2)
		defer rl.Close()

		// Use up burst
		rl.Allow("example.com")
		rl.Allow("example.com")

		if rl.Allow("example.com") {
			t.Error("expected request beyond burst to be denied")
		}
	})

	t.Run("tracks active hosts", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		rl.Allow("host1.com")
		rl.Allow("host2.com")
		rl.Allow("host3.com")

		if rl.ActiveHosts() != 3 {
			t.Errorf("expected 3 active hosts, got %d", rl.ActiveHosts())
		}
	})

	t.Run("each host has independent rate limit", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 2)
		defer rl.Close()

		// Use up burst for host1
		rl.Allow("host1.com")
		rl.Allow("host1.com")

		// host1 should be denied
		if rl.Allow("host1.com") {
			t.Error("expected host1 to be denied (burst exhausted)")
		}

		// host2 should still be allowed (independent limit)
		if !rl.Allow("host2.com") {
			t.Error("expected host2 to be allowed (independent limit)")
		}
	})
}

func TestRateLimiterWait(t *testing.T) {
	t.Run("wait allows first request immediately", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		ctx := context.Background()
		start := time.Now()
		err := rl.Wait(ctx, "example.com")
		duration := time.Since(start)

		if err != nil {
			t.Errorf("Wait returned error: %v", err)
		}
		// Should be nearly instant (< 10ms)
		if duration > 10*time.Millisecond {
			t.Errorf("Wait took too long: %v", duration)
		}
	})

	t.Run("wait respects context cancellation", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 1)
		defer rl.Close()

		// Use up the single token
		rl.Wait(context.Background(), "example.com")

		// Create context with short timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()

		// This should block and then fail due to timeout
		err := rl.Wait(ctx, "example.com")
		if err == nil {
			t.Error("expected Wait to fail with cancelled context")
		}
	})

	t.Run("wait blocks when burst exhausted", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 1)
		defer rl.Close()

		// Use up the single token
		rl.Wait(context.Background(), "example.com")

		// This immediate call should fail (no tokens available)
		// We need to use a timeout context to avoid infinite wait
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
		defer cancel()

		err := rl.Wait(ctx, "example.com")
		if err == nil {
			t.Error("expected Wait to fail when no tokens available")
		}
	})
}

func TestRateLimiterActiveHosts(t *testing.T) {
	t.Run("starts with zero hosts", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		if rl.ActiveHosts() != 0 {
			t.Errorf("expected 0 active hosts, got %d", rl.ActiveHosts())
		}
	})

	t.Run("counts unique hosts", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		rl.Allow("host1.com")
		rl.Allow("host2.com")
		rl.Allow("host1.com") // duplicate

		if rl.ActiveHosts() != 2 {
			t.Errorf("expected 2 active hosts, got %d", rl.ActiveHosts())
		}
	})

	t.Run("allows empty host", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		rl.Allow("")

		if rl.ActiveHosts() != 1 {
			t.Errorf("expected 1 active host, got %d", rl.ActiveHosts())
		}
	})
}

func TestRateLimiterReapStale(t *testing.T) {
	t.Run("removes hosts unused for 5 minutes", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5, WithCleanupInterval(10*time.Millisecond))

		rl.Allow("host1.com")
		rl.Allow("host2.com")

		if rl.ActiveHosts() != 2 {
			t.Fatalf("expected 2 active hosts, got %d", rl.ActiveHosts())
		}

		// Manually set lastUsed to simulate stale hosts
		rl.mu.Lock()
		for _, hl := range rl.limits {
			hl.lastUsed = time.Now().Add(-6 * time.Minute)
		}
		rl.mu.Unlock()

		// Trigger cleanup
		rl.reapStale()

		if rl.ActiveHosts() != 0 {
			t.Errorf("expected 0 active hosts after cleanup, got %d", rl.ActiveHosts())
		}

		rl.Close()
	})

	t.Run("keeps recently used hosts", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5)
		defer rl.Close()

		rl.Allow("host1.com")
		rl.Allow("host2.com")

		// Manually set one host to be stale
		rl.mu.Lock()
		rl.limits["host1.com"].lastUsed = time.Now().Add(-6 * time.Minute)
		rl.mu.Unlock()

		rl.reapStale()

		if rl.ActiveHosts() != 1 {
			t.Errorf("expected 1 active host after cleanup, got %d", rl.ActiveHosts())
		}

		// Should still have host2
		if !rl.Allow("host2.com") {
			t.Error("expected host2 to still be available")
		}
	})
}

func TestRateLimiterClose(t *testing.T) {
	t.Run("close stops cleanup goroutine", func(t *testing.T) {
		rl := NewRateLimiter(10.0, 5, WithCleanupInterval(10*time.Millisecond))

		rl.Close()

		// Allow should still work after close
		if !rl.Allow("example.com") {
			t.Error("expected Allow to work after Close")
		}
	})
}
