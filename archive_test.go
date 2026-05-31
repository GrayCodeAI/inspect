package inspect

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"testing"
	"time"
)

func TestNewArchive(t *testing.T) {
	a := NewArchive("scan-123", "example.com")

	if a.Version != ArchiveVersion {
		t.Errorf("expected version %q, got %q", ArchiveVersion, a.Version)
	}
	if a.ScanID != "scan-123" {
		t.Errorf("expected scan ID %q, got %q", "scan-123", a.ScanID)
	}
	if a.Metadata.Host != "example.com" {
		t.Errorf("expected host %q, got %q", "example.com", a.Metadata.Host)
	}
	if a.Results == nil {
		t.Error("expected Results to be initialized, got nil")
	}
}

func TestAddEntry(t *testing.T) {
	a := NewArchive("scan-1", "test.com")

	entry := ArchiveEntry{
		URL:        "https://test.com/page",
		StatusCode: 200,
		ScannedAt:  time.Now().UTC(),
	}
	a.AddEntry(entry)

	if len(a.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(a.Results))
	}
	if a.Results[0].URL != "https://test.com/page" {
		t.Errorf("expected URL %q, got %q", "https://test.com/page", a.Results[0].URL)
	}
	if a.Results[0].StatusCode != 200 {
		t.Errorf("expected status code 200, got %d", a.Results[0].StatusCode)
	}
}

func TestSetMetadata(t *testing.T) {
	a := NewArchive("scan-1", "test.com")

	meta := ArchiveMetadata{
		Host:           "updated.com",
		ScanDuration:   5 * time.Second,
		TotalURLs:      100,
		SuccessfulURLs: 90,
		FailedURLs:     10,
		ToolVersion:    "1.0.0",
	}
	a.SetMetadata(meta)

	if a.Metadata.Host != "updated.com" {
		t.Errorf("expected host %q, got %q", "updated.com", a.Metadata.Host)
	}
	if a.Metadata.ScanDuration != 5*time.Second {
		t.Errorf("expected scan duration %v, got %v", 5*time.Second, a.Metadata.ScanDuration)
	}
	if a.Metadata.TotalURLs != 100 {
		t.Errorf("expected total URLs 100, got %d", a.Metadata.TotalURLs)
	}
}

func TestWriteToReadArchiveRoundTrip(t *testing.T) {
	original := NewArchive("scan-rt", "roundtrip.com")
	original.AddEntry(ArchiveEntry{
		URL:         "https://roundtrip.com/api",
		StatusCode:  200,
		ContentType: "application/json",
		BodyHash:    "abc123",
		BodySnippet: `{"ok": true}`,
		Headers:     http.Header{"X-Test": {"value"}},
		ScannedAt:   time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC),
		Tags:        []string{"test"},
	})
	original.SetMetadata(ArchiveMetadata{
		Host:           "roundtrip.com",
		ScanDuration:   3 * time.Second,
		TotalURLs:      1,
		SuccessfulURLs: 1,
		ToolVersion:    "1.0.0",
	})

	var buf bytes.Buffer
	n, err := original.WriteTo(&buf)
	if err != nil {
		t.Fatalf("WriteTo failed: %v", err)
	}
	if n == 0 {
		t.Error("expected bytes written > 0")
	}

	restored, err := ReadArchive(&buf)
	if err != nil {
		t.Fatalf("ReadArchive failed: %v", err)
	}

	if restored.Version != original.Version {
		t.Errorf("version mismatch: %q vs %q", restored.Version, original.Version)
	}
	if restored.ScanID != original.ScanID {
		t.Errorf("scan ID mismatch: %q vs %q", restored.ScanID, original.ScanID)
	}
	if len(restored.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(restored.Results))
	}
	entry := restored.Results[0]
	if entry.URL != "https://roundtrip.com/api" {
		t.Errorf("URL mismatch: %q", entry.URL)
	}
	if entry.StatusCode != 200 {
		t.Errorf("status code mismatch: %d", entry.StatusCode)
	}
	if entry.BodyHash != "abc123" {
		t.Errorf("body hash mismatch: %q", entry.BodyHash)
	}
	if entry.Headers.Get("X-Test") != "value" {
		t.Errorf("header mismatch: %q", entry.Headers.Get("X-Test"))
	}
}

func TestSummaryStatusCounts(t *testing.T) {
	a := NewArchive("scan-1", "test.com")
	a.AddEntry(ArchiveEntry{StatusCode: 200})
	a.AddEntry(ArchiveEntry{StatusCode: 200})
	a.AddEntry(ArchiveEntry{StatusCode: 404})
	a.AddEntry(ArchiveEntry{StatusCode: 301})

	s := a.Summary()

	if s.TotalEntries != 4 {
		t.Errorf("expected total 4, got %d", s.TotalEntries)
	}
	if s.StatusCounts[200] != 2 {
		t.Errorf("expected 200 count 2, got %d", s.StatusCounts[200])
	}
	if s.StatusCounts[404] != 1 {
		t.Errorf("expected 404 count 1, got %d", s.StatusCounts[404])
	}
	if s.StatusCounts[301] != 1 {
		t.Errorf("expected 301 count 1, got %d", s.StatusCounts[301])
	}
}

func TestSummaryErrorRate(t *testing.T) {
	a := NewArchive("scan-1", "test.com")
	a.AddEntry(ArchiveEntry{StatusCode: 200})
	a.AddEntry(ArchiveEntry{StatusCode: 200, Error: "timeout"})
	a.AddEntry(ArchiveEntry{StatusCode: 500})
	a.AddEntry(ArchiveEntry{StatusCode: 500, Error: "internal error"})

	s := a.Summary()

	if s.ErrorCount != 2 {
		t.Errorf("expected error count 2, got %d", s.ErrorCount)
	}
	expectedRate := 0.5
	if s.ErrorRate != expectedRate {
		t.Errorf("expected error rate %v, got %v", expectedRate, s.ErrorRate)
	}
}

func TestBodyHash(t *testing.T) {
	data := []byte("hello world")
	hash1 := BodyHash(data)
	hash2 := BodyHash(data)

	if hash1 != hash2 {
		t.Errorf("expected consistent hash, got %q and %q", hash1, hash2)
	}

	expected := "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
	if hash1 != expected {
		t.Errorf("expected hash %q, got %q", expected, hash1)
	}
}

func TestTruncateBody(t *testing.T) {
	short := []byte("short body")
	result := TruncateBody(short, 1024)
	if result != "short body" {
		t.Errorf("expected %q, got %q", "short body", result)
	}

	long := bytes.Repeat([]byte("a"), 2000)
	result = TruncateBody(long, 1024)
	if len(result) != 1024+3 { // 1024 bytes + "..."
		t.Errorf("expected length 1027, got %d", len(result))
	}
	if result[1024:] != "..." {
		t.Errorf("expected trailing '...', got %q", result[1024:])
	}

	result = TruncateBody([]byte{}, 1024)
	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}

func TestEmptyArchiveRoundTrip(t *testing.T) {
	original := NewArchive("empty-scan", "empty.com")

	var buf bytes.Buffer
	_, err := original.WriteTo(&buf)
	if err != nil {
		t.Fatalf("WriteTo failed: %v", err)
	}

	restored, err := ReadArchive(&buf)
	if err != nil {
		t.Fatalf("ReadArchive failed: %v", err)
	}

	if restored.ScanID != "empty-scan" {
		t.Errorf("scan ID mismatch: %q", restored.ScanID)
	}
	if len(restored.Results) != 0 {
		t.Errorf("expected 0 results, got %d", len(restored.Results))
	}
	if restored.Version != ArchiveVersion {
		t.Errorf("version mismatch: %q", restored.Version)
	}
}

func TestMultipleEntriesStatusCodes(t *testing.T) {
	a := NewArchive("multi-scan", "multi.com")
	codes := []int{200, 200, 301, 404, 500, 500, 500}
	for _, code := range codes {
		a.AddEntry(ArchiveEntry{StatusCode: code})
	}

	s := a.Summary()

	if s.TotalEntries != 7 {
		t.Errorf("expected total 7, got %d", s.TotalEntries)
	}
	if s.StatusCounts[200] != 2 {
		t.Errorf("expected 200 count 2, got %d", s.StatusCounts[200])
	}
	if s.StatusCounts[301] != 1 {
		t.Errorf("expected 301 count 1, got %d", s.StatusCounts[301])
	}
	if s.StatusCounts[404] != 1 {
		t.Errorf("expected 404 count 1, got %d", s.StatusCounts[404])
	}
	if s.StatusCounts[500] != 3 {
		t.Errorf("expected 500 count 3, got %d", s.StatusCounts[500])
	}
}

func TestGzipCompressionIsUsed(t *testing.T) {
	original := NewArchive("gzip-scan", "gzip.com")
	original.AddEntry(ArchiveEntry{
		URL:        "https://gzip.com/test",
		StatusCode: 200,
		ScannedAt:  time.Now().UTC(),
	})

	var buf bytes.Buffer
	_, err := original.WriteTo(&buf)
	if err != nil {
		t.Fatalf("WriteTo failed: %v", err)
	}

	// Keep a copy for the second check
	data := make([]byte, buf.Len())
	copy(data, buf.Bytes())

	// Attempt to read as gzip - should succeed
	gz, err := gzip.NewReader(&buf)
	if err != nil {
		t.Fatalf("expected gzip data, got error: %v", err)
	}
	defer gz.Close()

	// Read the uncompressed content
	decompressed := new(bytes.Buffer)
	if _, err := decompressed.ReadFrom(gz); err != nil {
		t.Fatalf("failed to read decompressed data: %v", err)
	}

	// Verify we got valid JSON (the decompressed content should start with '{')
	d := decompressed.Bytes()
	if len(d) == 0 || d[0] != '{' {
		t.Errorf("expected JSON object starting with '{'")
	}

	// Also verify ReadArchive can round-trip the gzip data
	restored, err := ReadArchive(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("ReadArchive failed on gzip data: %v", err)
	}
	if restored.ScanID != "gzip-scan" {
		t.Errorf("expected scan ID %q, got %q", "gzip-scan", restored.ScanID)
	}
}
