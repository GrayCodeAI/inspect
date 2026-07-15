package inspect

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// mockFindingSink is a test double that records calls to Store and StoreBatch.
type mockFindingSink struct {
	mu         sync.Mutex
	storeCalls []FindingEntry
	batchCalls [][]FindingEntry
	storeErr   error
	batchErr   error
}

func (m *mockFindingSink) Store(ctx context.Context, entry FindingEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.storeCalls = append(m.storeCalls, entry)
	return m.storeErr
}

func (m *mockFindingSink) StoreBatch(ctx context.Context, entries []FindingEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	copied := make([]FindingEntry, len(entries))
	copy(copied, entries)
	m.batchCalls = append(m.batchCalls, copied)
	return m.batchErr
}

func (m *mockFindingSink) batchCallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.batchCalls)
}

func (m *mockFindingSink) totalBatchedEntries() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	total := 0
	for _, batch := range m.batchCalls {
		total += len(batch)
	}
	return total
}

// TestNewFindingsStoreDefaults verifies default batchSize and autoFlush settings.
func TestNewFindingsStoreDefaults(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink)

	if store.batchSize != 50 {
		t.Errorf("expected batchSize 50, got %d", store.batchSize)
	}
	if !store.autoFlush {
		t.Error("expected autoFlush to be true by default")
	}
	if store.sink == nil {
		t.Error("expected sink to be non-nil")
	}
	if store.Size() != 0 {
		t.Errorf("expected initial buffer size 0, got %d", store.Size())
	}
}

// TestAddIncrementsBufferSize confirms that Add grows the buffer.
func TestAddIncrementsBufferSize(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithAutoFlush(false))

	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if err := store.Add(ctx, FindingEntry{URL: "http://example.com"}); err != nil {
			t.Fatalf("Add failed: %v", err)
		}
	}

	if store.Size() != 5 {
		t.Errorf("expected buffer size 5, got %d", store.Size())
	}
}

// TestAutoFlushTriggersAtBatchSize checks that the buffer is flushed
// automatically when it reaches batchSize.
func TestAutoFlushTriggersAtBatchSize(t *testing.T) {
	sink := &mockFindingSink{}
	batchSize := 3
	store := NewFindingsStore(sink, WithBatchSize(batchSize))

	ctx := context.Background()
	// Add exactly batchSize entries; the last Add should trigger a flush.
	for i := 0; i < batchSize; i++ {
		if err := store.Add(ctx, FindingEntry{URL: "http://example.com"}); err != nil {
			t.Fatalf("Add failed: %v", err)
		}
	}

	if sink.batchCallCount() != 1 {
		t.Errorf("expected 1 batch call, got %d", sink.batchCallCount())
	}
	if sink.totalBatchedEntries() != batchSize {
		t.Errorf("expected %d batched entries, got %d", batchSize, sink.totalBatchedEntries())
	}
	if store.Size() != 0 {
		t.Errorf("expected buffer empty after auto-flush, got size %d", store.Size())
	}
}

// TestManualFlushSendsAllEntries verifies Flush sends the entire buffer
// and resets it.
func TestManualFlushSendsAllEntries(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithAutoFlush(false))

	ctx := context.Background()
	for i := 0; i < 7; i++ {
		_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})
	}

	if store.Size() != 7 {
		t.Fatalf("expected buffer size 7 before flush, got %d", store.Size())
	}

	if err := store.Flush(ctx); err != nil {
		t.Fatalf("Flush failed: %v", err)
	}

	if sink.batchCallCount() != 1 {
		t.Errorf("expected 1 batch call, got %d", sink.batchCallCount())
	}
	if sink.totalBatchedEntries() != 7 {
		t.Errorf("expected 7 batched entries, got %d", sink.totalBatchedEntries())
	}
	if store.Size() != 0 {
		t.Errorf("expected buffer empty after flush, got size %d", store.Size())
	}
}

// TestFlushOnEmptyBufferIsNoOp verifies that flushing an empty buffer
// does not call the sink.
func TestFlushOnEmptyBufferIsNoOp(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink)

	if err := store.Flush(context.Background()); err != nil {
		t.Fatalf("Flush failed: %v", err)
	}

	if sink.batchCallCount() != 0 {
		t.Errorf("expected no batch calls on empty flush, got %d", sink.batchCallCount())
	}
}

// TestConvertScanResult verifies that Finding records are converted
// to FindingEntry records with expected mappings.
func TestConvertScanResult(t *testing.T) {
	findings := []Finding{
		{
			Check:    "xss",
			Severity: SeverityHigh,
			Message:  "Reflected XSS detected",
			Evidence: "<script>alert(1)</script>",
		},
		{
			Check:    "missing-header",
			Severity: SeverityMedium,
			Message:  "X-Frame-Options header missing",
		},
	}

	entries := ConvertScanResult("http://example.com", findings)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	if entries[0].URL != "http://example.com" {
		t.Errorf("entry 0: expected URL http://example.com, got %s", entries[0].URL)
	}
	if entries[0].CheckName != "xss" {
		t.Errorf("entry 0: expected check xss, got %s", entries[0].CheckName)
	}
	if entries[0].Passed {
		t.Error("entry 0: expected passed=false for scan findings")
	}
	if entries[0].Severity != "high" {
		t.Errorf("entry 0: expected severity high, got %s", entries[0].Severity)
	}
	if entries[0].Details != "<script>alert(1)</script>" {
		t.Errorf("entry 0: unexpected details %q", entries[0].Details)
	}
	if entries[1].CheckName != "missing-header" {
		t.Errorf("entry 1: expected check missing-header, got %s", entries[1].CheckName)
	}
}

// TestWithBatchSize verifies the WithBatchSize option, including the
// floor of 1.
func TestWithBatchSize(t *testing.T) {
	sink := &mockFindingSink{}

	store := NewFindingsStore(sink, WithBatchSize(5))
	if store.batchSize != 5 {
		t.Errorf("expected batchSize 5, got %d", store.batchSize)
	}

	store = NewFindingsStore(sink, WithBatchSize(0))
	if store.batchSize != 1 {
		t.Errorf("expected batchSize clamped to 1, got %d", store.batchSize)
	}

	store = NewFindingsStore(sink, WithBatchSize(-3))
	if store.batchSize != 1 {
		t.Errorf("expected batchSize clamped to 1 for negative input, got %d", store.batchSize)
	}
}

// TestWithAutoFlush verifies the WithAutoFlush option disables automatic flushing.
func TestWithAutoFlush(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithAutoFlush(false), WithBatchSize(2))

	if store.autoFlush {
		t.Error("expected autoFlush to be false")
	}

	ctx := context.Background()
	for i := 0; i < 3; i++ {
		_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})
	}

	// Even though buffer exceeds batchSize, no flush should have occurred.
	if sink.batchCallCount() != 0 {
		t.Errorf("expected no auto-flush calls, got %d", sink.batchCallCount())
	}
	if store.Size() != 3 {
		t.Errorf("expected buffer size 3, got %d", store.Size())
	}
}

// TestConcurrentAddIsSafe exercises Add from multiple goroutines
// simultaneously and verifies no data races or panics.
func TestConcurrentAddIsSafe(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithBatchSize(100), WithAutoFlush(true))

	const goroutines = 50
	const perGoroutine = 20

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			ctx := context.Background()
			for j := 0; j < perGoroutine; j++ {
				_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})
			}
		}()
	}

	wg.Wait()

	// Flush any remaining entries.
	_ = store.Flush(context.Background())

	totalSent := sink.totalBatchedEntries()
	if totalSent != goroutines*perGoroutine {
		t.Errorf("expected %d total batched entries, got %d", goroutines*perGoroutine, totalSent)
	}
}

// TestNilSinkHandling confirms that Add and Flush are no-ops when the
// sink is nil.
func TestNilSinkHandling(t *testing.T) {
	store := NewFindingsStore(nil)

	ctx := context.Background()
	if err := store.Add(ctx, FindingEntry{URL: "http://example.com"}); err != nil {
		t.Fatalf("Add with nil sink failed: %v", err)
	}
	if store.Size() != 0 {
		t.Errorf("expected buffer size 0 with nil sink, got %d", store.Size())
	}

	// Flush should not panic and should return nil.
	if err := store.Flush(ctx); err != nil {
		t.Fatalf("Flush with nil sink failed: %v", err)
	}
}

// TestFlushPropagatesBatchError ensures that when the sink returns an
// error from StoreBatch, Flush propagates it.
func TestFlushPropagatesBatchError(t *testing.T) {
	expectedErr := errors.New("store failed")
	sink := &mockFindingSink{batchErr: expectedErr}
	store := NewFindingsStore(sink, WithAutoFlush(false))

	ctx := context.Background()
	_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})

	err := store.Flush(ctx)
	if err == nil {
		t.Fatal("expected error from Flush, got nil")
	}
	if !errors.Is(err, expectedErr) {
		t.Errorf("expected wrapped error %v, got %v", expectedErr, err)
	}
}

// TestAutoFlushMultipleBatches verifies that auto-flush triggers correctly
// across multiple batch boundaries.
func TestAutoFlushMultipleBatches(t *testing.T) {
	sink := &mockFindingSink{}
	batchSize := 2
	store := NewFindingsStore(sink, WithBatchSize(batchSize))

	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})
	}

	// Two full batches should have flushed (entries 0-1 and 2-3).
	if sink.batchCallCount() != 2 {
		t.Errorf("expected 2 batch calls, got %d", sink.batchCallCount())
	}
	// One entry remains in buffer.
	if store.Size() != 1 {
		t.Errorf("expected buffer size 1, got %d", store.Size())
	}
}

// TestSeverityFromStatusCode covers the severity derivation helper.
func TestSeverityFromStatusCode(t *testing.T) {
	tests := []struct {
		code     int
		err      string
		expected string
	}{
		{200, "", "info"},
		{301, "", "info"},
		{400, "", "medium"},
		{403, "", "medium"},
		{500, "", "high"},
		{503, "", "high"},
		{0, "", "high"},
		{200, "some error", "high"},
	}

	for _, tt := range tests {
		got := severityFromStatusCode(tt.code, tt.err)
		if got != tt.expected {
			t.Errorf("severityFromStatusCode(%d, %q) = %q, want %q", tt.code, tt.err, got, tt.expected)
		}
	}
}

// TestFlushAfterAutoFlush verifies that a manual Flush after an auto-flush
// correctly drains any remaining buffer.
func TestFlushAfterAutoFlush(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithBatchSize(3))

	ctx := context.Background()
	for i := 0; i < 7; i++ {
		_ = store.Add(ctx, FindingEntry{URL: "http://example.com"})
	}

	// Two auto-flushes happened (entries 0-2 and 3-5), one remains.
	if sink.batchCallCount() != 2 {
		t.Fatalf("expected 2 auto-flushes, got %d", sink.batchCallCount())
	}
	if store.Size() != 1 {
		t.Fatalf("expected 1 remaining, got %d", store.Size())
	}

	if err := store.Flush(ctx); err != nil {
		t.Fatalf("Flush failed: %v", err)
	}
	if sink.batchCallCount() != 3 {
		t.Errorf("expected 3 total batch calls, got %d", sink.batchCallCount())
	}
	if store.Size() != 0 {
		t.Errorf("expected buffer empty, got %d", store.Size())
	}
}

// TestConcurrentAddAndFlush exercises concurrent Add and Flush from
// multiple goroutines and checks no entries are lost.
func TestConcurrentAddAndFlush(t *testing.T) {
	sink := &mockFindingSink{}
	store := NewFindingsStore(sink, WithAutoFlush(false))

	const goroutines = 20
	const perGoroutine = 10

	var addCount int64
	var wg sync.WaitGroup
	wg.Add(goroutines + 1)

	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			ctx := context.Background()
			for j := 0; j < perGoroutine; j++ {
				if err := store.Add(ctx, FindingEntry{URL: "http://example.com"}); err == nil {
					atomic.AddInt64(&addCount, 1)
				}
			}
		}()
	}

	// A separate goroutine repeatedly flushes.
	go func() {
		defer wg.Done()
		ctx := context.Background()
		for i := 0; i < 10; i++ {
			_ = store.Flush(ctx)
			time.Sleep(time.Millisecond)
		}
	}()

	wg.Wait()
	// Final flush to drain anything remaining.
	_ = store.Flush(context.Background())

	totalSent := sink.totalBatchedEntries()
	if totalSent != goroutines*perGoroutine {
		t.Errorf("expected %d total entries flushed, got %d", goroutines*perGoroutine, totalSent)
	}
}
