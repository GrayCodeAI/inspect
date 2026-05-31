package inspect

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// FindingSink is the interface for external stores that persist scan findings.
// Implementations should be safe for concurrent use by multiple goroutines.
type FindingSink interface {
	Store(ctx context.Context, entry FindingEntry) error
	StoreBatch(ctx context.Context, entries []FindingEntry) error
}

// FindingEntry is a single finding record for the external store.
type FindingEntry struct {
	ScanID    string    `json:"scan_id"`
	URL       string    `json:"url"`
	CheckName string    `json:"check_name"`
	Passed    bool      `json:"passed"`
	Severity  string    `json:"severity"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	Tags      []string  `json:"tags,omitempty"`
	ScannedAt time.Time `json:"scanned_at"`
}

// FindingsStore buffers scan findings and flushes them to a FindingSink
// in batches for efficiency.
type FindingsStore struct {
	sink      FindingSink
	buffer    []FindingEntry
	mu        sync.Mutex
	batchSize int
	autoFlush bool
}

// FindingsStoreOption configures a FindingsStore.
type FindingsStoreOption func(*FindingsStore)

// NewFindingsStore creates a FindingsStore backed by the given sink.
// If sink is nil, all operations are no-ops.
func NewFindingsStore(sink FindingSink, opts ...FindingsStoreOption) *FindingsStore {
	s := &FindingsStore{
		sink:      sink,
		batchSize: 50,
		autoFlush: true,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// WithBatchSize sets the number of buffered entries that triggers an
// automatic flush. Values less than 1 are corrected to 1.
func WithBatchSize(n int) FindingsStoreOption {
	return func(s *FindingsStore) {
		if n < 1 {
			n = 1
		}
		s.batchSize = n
	}
}

// WithAutoFlush controls whether the store automatically flushes when the
// buffer reaches batchSize. When disabled, callers must call Flush explicitly.
func WithAutoFlush(enabled bool) FindingsStoreOption {
	return func(s *FindingsStore) {
		s.autoFlush = enabled
	}
}

// Add appends an entry to the buffer. If autoFlush is enabled and the
// buffer has reached batchSize, the buffer is flushed to the sink.
// A nil sink causes Add to return immediately with no error.
func (s *FindingsStore) Add(ctx context.Context, entry FindingEntry) error {
	if s.sink == nil {
		return nil
	}

	s.mu.Lock()
	s.buffer = append(s.buffer, entry)
	shouldFlush := s.autoFlush && len(s.buffer) >= s.batchSize
	s.mu.Unlock()

	if shouldFlush {
		return s.Flush(ctx)
	}
	return nil
}

// Flush sends all buffered entries to the sink and clears the buffer.
// A nil sink causes Flush to clear the buffer without error.
func (s *FindingsStore) Flush(ctx context.Context) error {
	s.mu.Lock()
	if len(s.buffer) == 0 {
		s.mu.Unlock()
		return nil
	}
	batch := s.buffer
	s.buffer = make([]FindingEntry, 0, s.batchSize)
	s.mu.Unlock()

	if s.sink == nil {
		return nil
	}

	if err := s.sink.StoreBatch(ctx, batch); err != nil {
		return fmt.Errorf("inspect: flushing findings batch (%d entries): %w", len(batch), err)
	}
	return nil
}

// Size returns the number of entries currently in the buffer.
func (s *FindingsStore) Size() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.buffer)
}

// ConvertArchiveToEntries converts the results in an Archive into
// FindingEntry records suitable for the store.
func ConvertArchiveToEntries(archive *Archive) []FindingEntry {
	if archive == nil {
		return nil
	}
	entries := make([]FindingEntry, 0, len(archive.Results))
	for _, r := range archive.Results {
		passed := r.StatusCode >= 200 && r.StatusCode < 400 && r.Error == ""
		msg := fmt.Sprintf("HTTP %d", r.StatusCode)
		if r.Error != "" {
			msg = r.Error
		}
		entries = append(entries, FindingEntry{
			ScanID:    archive.ScanID,
			URL:       r.URL,
			CheckName: "archive-entry",
			Passed:    passed,
			Severity:  severityFromStatusCode(r.StatusCode, r.Error),
			Message:   msg,
			Details:   r.BodySnippet,
			Tags:      r.Tags,
			ScannedAt: r.ScannedAt,
		})
	}
	return entries
}

// ConvertScanResult converts a slice of Finding records from a scan into
// FindingEntry records for the store.
func ConvertScanResult(url string, findings []Finding) []FindingEntry {
	entries := make([]FindingEntry, 0, len(findings))
	for _, f := range findings {
		entries = append(entries, FindingEntry{
			URL:       url,
			CheckName: f.Check,
			Passed:    false,
			Severity:  f.Severity.String(),
			Message:   f.Message,
			Details:   f.Evidence,
			ScannedAt: time.Now().UTC(),
		})
	}
	return entries
}

// severityFromStatusCode derives a severity string from an HTTP status code
// and optional error string.
func severityFromStatusCode(statusCode int, err string) string {
	if err != "" {
		return "high"
	}
	switch {
	case statusCode == 0:
		return "high"
	case statusCode >= 500:
		return "high"
	case statusCode >= 400:
		return "medium"
	default:
		return "info"
	}
}
