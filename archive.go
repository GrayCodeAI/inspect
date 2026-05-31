package inspect

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ArchiveVersion is the current archive format version.
const ArchiveVersion = "1.0"

// Archive is a structured container for scan results, designed for
// durable storage and interoperability between components.
type Archive struct {
	// Version is the archive format version for forward compatibility.
	Version string `json:"version"`

	// CreatedAt is when this archive was created.
	CreatedAt time.Time `json:"created_at"`

	// ScanID is a unique identifier for the originating scan.
	ScanID string `json:"scan_id"`

	// Metadata holds summary-level information about the scan.
	Metadata ArchiveMetadata `json:"metadata"`

	// Results contains each individual scan entry.
	Results []ArchiveEntry `json:"results"`
}

// ArchiveMetadata captures high-level information about the scan that
// produced this archive.
type ArchiveMetadata struct {
	// Host is the target hostname or IP.
	Host string `json:"host"`

	// ScanDuration is how long the scan took.
	ScanDuration time.Duration `json:"scan_duration"`

	// TotalURLs is the number of URLs that were attempted.
	TotalURLs int `json:"total_urls"`

	// SuccessfulURLs is the count of URLs that returned a response.
	SuccessfulURLs int `json:"successful_urls"`

	// FailedURLs is the count of URLs that returned an error.
	FailedURLs int `json:"failed_urls"`

	// ToolVersion identifies the scanning tool version.
	ToolVersion string `json:"tool_version"`
}

// ArchiveEntry represents one scanned URL and its response.
type ArchiveEntry struct {
	// URL is the fully-qualified URL that was scanned.
	URL string `json:"url"`

	// StatusCode is the HTTP response status code. Zero indicates no response.
	StatusCode int `json:"status_code"`

	// ContentType is the value of the Content-Type header.
	ContentType string `json:"content_type"`

	// BodyHash is the SHA-256 hex digest of the full response body.
	BodyHash string `json:"body_hash"`

	// Headers are the full set of response headers.
	Headers http.Header `json:"headers"`

	// BodySnippet is the first 1 KB of the response body, useful for
	// quick inspection without loading the full payload.
	BodySnippet string `json:"body_snippet"`

	// Error holds the string representation of any error encountered
	// during the request. Empty when the request succeeded.
	Error string `json:"error,omitempty"`

	// ScannedAt is when this URL was scanned.
	ScannedAt time.Time `json:"scanned_at"`

	// Tags are user-defined labels for this entry (e.g. "interesting", "redirect").
	Tags []string `json:"tags,omitempty"`
}

// ArchiveSummary provides aggregate counts from an archive's results.
type ArchiveSummary struct {
	// TotalEntries is the number of results in the archive.
	TotalEntries int `json:"total_entries"`

	// StatusCounts maps each HTTP status code to its occurrence count.
	StatusCounts map[int]int `json:"status_counts"`

	// ContentTypeCounts maps each Content-Type to its occurrence count.
	ContentTypeCounts map[string]int `json:"content_type_counts"`

	// ErrorCount is how many entries have a non-empty Error field.
	ErrorCount int `json:"error_count"`

	// ErrorRate is ErrorCount divided by TotalEntries (0.0 when empty).
	ErrorRate float64 `json:"error_rate"`
}

// NewArchive creates a new Archive with the given scan ID and host,
// initialised to version 1.0 and the current time.
func NewArchive(scanID, host string) *Archive {
	return &Archive{
		Version:   ArchiveVersion,
		CreatedAt: time.Now().UTC(),
		ScanID:    scanID,
		Metadata: ArchiveMetadata{
			Host: host,
		},
		Results: make([]ArchiveEntry, 0),
	}
}

// AddEntry appends a scan result to the archive.
func (a *Archive) AddEntry(entry ArchiveEntry) {
	a.Results = append(a.Results, entry)
}

// SetMetadata replaces the archive's metadata.
func (a *Archive) SetMetadata(meta ArchiveMetadata) {
	a.Metadata = meta
}

// WriteTo writes the archive as gzipped JSON to w.
// It implements the io.WriterTo interface.
func (a *Archive) WriteTo(w io.Writer) (int64, error) {
	gz, err := gzip.NewWriterLevel(w, gzip.BestSpeed)
	if err != nil {
		return 0, fmt.Errorf("inspect: creating gzip writer: %w", err)
	}
	defer gz.Close()

	cw := &countingWriter{w: gz}
	enc := json.NewEncoder(cw)
	enc.SetIndent("", "  ")
	if err := enc.Encode(a); err != nil {
		return cw.n, fmt.Errorf("inspect: encoding archive: %w", err)
	}
	if err := gz.Close(); err != nil {
		return cw.n, fmt.Errorf("inspect: closing gzip writer: %w", err)
	}
	return cw.n, nil
}

// countingWriter wraps an io.Writer and counts bytes written through it.
type countingWriter struct {
	w io.Writer
	n int64
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.w.Write(p)
	cw.n += int64(n)
	return n, err
}

// ReadArchive reads a gzipped JSON archive from r.
func ReadArchive(r io.Reader) (*Archive, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("inspect: creating gzip reader: %w", err)
	}
	defer gz.Close()

	var a Archive
	dec := json.NewDecoder(gz)
	if err := dec.Decode(&a); err != nil {
		return nil, fmt.Errorf("inspect: decoding archive: %w", err)
	}
	return &a, nil
}

// Summary returns an ArchiveSummary computed from the current results.
func (a *Archive) Summary() ArchiveSummary {
	s := ArchiveSummary{
		TotalEntries:      len(a.Results),
		StatusCounts:      make(map[int]int),
		ContentTypeCounts: make(map[string]int),
	}

	for _, e := range a.Results {
		s.StatusCounts[e.StatusCode]++

		ct := e.ContentType
		if ct == "" {
			ct = "unknown"
		}
		s.ContentTypeCounts[ct]++

		if e.Error != "" {
			s.ErrorCount++
		}
	}

	if s.TotalEntries > 0 {
		s.ErrorRate = float64(s.ErrorCount) / float64(s.TotalEntries)
	}

	return s
}

// BodyHash returns the SHA-256 hex digest of data.
func BodyHash(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}

// TruncateBody returns the first maxLen bytes of data as a string.
// When data exceeds maxLen, it is truncated and "..." is appended.
// The caller is responsible for ensuring data is valid UTF-8 if
// they expect text output; this function treats the bytes opaquely.
func TruncateBody(data []byte, maxLen int) string {
	if maxLen < 0 {
		maxLen = 0
	}
	if len(data) <= maxLen {
		return string(data)
	}
	return string(bytes.TrimRight(data[:maxLen], "\x00")) + "..."
}
