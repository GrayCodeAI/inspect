package check

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/GrayCodeAI/inspect/internal/crawler"
	"golang.org/x/net/html"
)

// pageFingerprint holds structural metrics extracted from an HTML page.
type pageFingerprint struct {
	Title     string
	H1        string
	WordCount int
	LinkCount int
	BodyHash  string // fnv32 of the signature fields for quick compare
}

// Soft404Detector detects servers that return 200 OK for non-existent pages
// (so-called "soft 404s") by probing random nonexistent URLs on each host
// and comparing the resulting page fingerprints.
type Soft404Detector struct {
	mu    sync.Mutex
	cache map[string]*pageFingerprint // host -> fingerprint of a known 404 page
}

// NewSoft404Detector creates a new detector with an empty cache.
func NewSoft404Detector() *Soft404Detector {
	return &Soft404Detector{
		cache: make(map[string]*pageFingerprint),
	}
}

// FingerprintPage extracts a structural signature from an HTML page body.
// It records the title, first h1, total word count, and number of links.
func FingerprintPage(body string) *pageFingerprint {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return &pageFingerprint{}
	}

	fp := &pageFingerprint{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "title":
				fp.Title = extractTextContent(n)
			case "h1":
				if fp.H1 == "" {
					fp.H1 = extractTextContent(n)
				}
			case "a":
				if hasHref(n) {
					fp.LinkCount++
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	// Compute word count from the visible text
	visibleText := extractVisibleText(doc)
	fp.WordCount = len(strings.Fields(visibleText))

	// Build a fingerprint hash from the signature fields
	sig := fp.Title + "|" + fp.H1 + "|" + fmt.Sprintf("%d", fp.WordCount) + "|" + fmt.Sprintf("%d", fp.LinkCount)
	fp.BodyHash = fmt.Sprintf("%08x", fnv32(sig))

	return fp
}

// IsSoft404 compares the fingerprint of a page suspected to be a soft 404
// against a known soft-404 fingerprint from the same host.
// Returns true when the fingerprints are close enough to indicate the page
// is not actually serving real content.
func IsSoft404(currentPage, notFoundPage *pageFingerprint) bool {
	if notFoundPage == nil || currentPage == nil {
		return false
	}

	// If the not-found page has a distinguishing title/h1 and the current
	// page matches exactly, it is very likely a soft 404.
	if notFoundPage.Title != "" && currentPage.Title == notFoundPage.Title {
		// Also check H1 if both have one
		if notFoundPage.H1 != "" && currentPage.H1 == notFoundPage.H1 {
			return true
		}
		// If titles match and word counts are very close (within 10%), flag it
		if absDiff(currentPage.WordCount, notFoundPage.WordCount) <= maxInt(1, notFoundPage.WordCount/10) {
			return true
		}
	}

	// If both pages have zero links and their H1s match, the page is empty/uniform
	if currentPage.LinkCount == 0 && notFoundPage.LinkCount == 0 &&
		currentPage.H1 != "" && currentPage.H1 == notFoundPage.H1 {
		return true
	}

	// Final heuristic: if the body hashes are identical, the pages are structurally the same
	if currentPage.BodyHash == notFoundPage.BodyHash {
		return true
	}

	return false
}

// GenerateProbeURL creates a random non-existent URL on the same host as the
// given page. The path is constructed from random hex segments so it is
// unlikely to collide with any real page.
func GenerateProbeURL(pageURL string) string {
	parsed, err := url.Parse(pageURL)
	if err != nil {
		return ""
	}
	if parsed.Host == "" {
		return ""
	}

	seg1 := randomHexSegment()
	seg2 := randomHexSegment()

	probePath := fmt.Sprintf("/__soft404_probe_%s_%s__", seg1, seg2)

	probe := &url.URL{
		Scheme: parsed.Scheme,
		Host:   parsed.Host,
		Path:   probePath,
	}
	return probe.String()
}

// Detect fetches a random non-existent URL on the same host as the given page
// and compares the returned fingerprint to the current page's fingerprint.
// Returns true if the current page appears to be a soft 404.
func (d *Soft404Detector) Detect(ctx context.Context, client *http.Client, page *crawler.Page) (bool, error) {
	host := extractHostFromURL(page.URL)
	if host == "" {
		return false, nil
	}

	// Check if we already have a not-found fingerprint for this host
	d.mu.Lock()
	notFoundFP, cached := d.cache[host]
	d.mu.Unlock()

	if !cached {
		// Probe a random nonexistent URL on the host
		probeURL := GenerateProbeURL(page.URL)
		if probeURL == "" {
			return false, nil
		}

		probeReq, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL, nil)
		if err != nil {
			return false, nil
		}
		probeReq.Header.Set("User-Agent", "inspect/1.0 (soft-404 probe)")

		probeResp, err := client.Do(probeReq)
		if err != nil {
			// If probe fails (connection refused, timeout, etc.), skip detection
			return false, nil
		}
		probeBody, err := io.ReadAll(io.LimitReader(probeResp.Body, 1*1024*1024))
		probeResp.Body.Close()
		if err != nil {
			return false, nil
		}

		// If the probe returns a genuine non-200, the server handles missing
		// pages correctly; no soft 404 to detect.
		if probeResp.StatusCode != 200 {
			d.mu.Lock()
			d.cache[host] = nil // sentinel: host handles 404 correctly
			d.mu.Unlock()
			return false, nil
		}

		notFoundFP = FingerprintPage(string(probeBody))
		d.mu.Lock()
		d.cache[host] = notFoundFP
		d.mu.Unlock()
	}

	// nil sentinel means the host handles 404 correctly
	if notFoundFP == nil {
		return false, nil
	}

	// Fetch the current page's full content to build its fingerprint
	pageReq, err := http.NewRequestWithContext(ctx, http.MethodGet, page.URL, nil)
	if err != nil {
		return false, nil
	}
	pageReq.Header.Set("User-Agent", "inspect/1.0 (soft-404 probe)")

	pageResp, err := client.Do(pageReq)
	if err != nil {
		return false, nil
	}
	pageBody, err := io.ReadAll(io.LimitReader(pageResp.Body, 1*1024*1024))
	pageResp.Body.Close()
	if err != nil {
		return false, nil
	}

	currentFP := FingerprintPage(string(pageBody))
	return IsSoft404(currentFP, notFoundFP), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func extractTextContent(n *html.Node) string {
	var buf bytes.Buffer
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			buf.WriteString(node.Data)
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.TrimSpace(buf.String())
}

func extractVisibleText(doc *html.Node) string {
	var buf bytes.Buffer
	var walk func(*html.Node)
	skip := map[string]bool{"script": true, "style": true}
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && skip[n.Data] {
			return
		}
		if n.Type == html.TextNode {
			buf.WriteString(n.Data)
			buf.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return buf.String()
}

func hasHref(n *html.Node) bool {
	for _, a := range n.Attr {
		if a.Key == "href" {
			return true
		}
	}
	return false
}

func extractHostFromURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return parsed.Host
}

func randomHexSegment() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// fnv32 is a simple FNV-1a hash for quick fingerprints.
func fnv32(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

func absDiff(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

// WithSoft404Detection enables or disables soft 404 false-positive detection
// on a LinksCheck. When enabled, 200 OK external links are probed to detect
// pages that return 200 for non-existent URLs.
func WithSoft404Detection(check *LinksCheck, enabled bool) {
	check.Soft404Detection = enabled
	if enabled && check.soft404Detector == nil {
		check.soft404Detector = NewSoft404Detector()
	}
	if !enabled {
		check.soft404Detector = nil
	}
}

// GetSoft404Detector returns the detector (used in tests).
func GetSoft404Detector(check *LinksCheck) *Soft404Detector {
	return check.soft404Detector
}

// GetSoft404Detection returns the soft 404 detection setting (used in tests).
func GetSoft404Detection(check *LinksCheck) bool {
	return check.Soft404Detection
}

// SetSoft404Detector sets the detector (used in tests to inject a pre-configured detector).
func SetSoft404Detector(check *LinksCheck, d *Soft404Detector) {
	check.soft404Detector = d
}

// GetSoft404Cache returns the internal cache (used in tests).
func (d *Soft404Detector) GetSoft404Cache() map[string]*pageFingerprint {
	return d.cache
}

// SetSoft404Cache replaces the internal cache (used in tests).
func (d *Soft404Detector) SetSoft404Cache(c map[string]*pageFingerprint) {
	d.cache = c
}

// Equal reports whether two fingerprints are structurally identical.
func (fp *pageFingerprint) Equal(other *pageFingerprint) bool {
	if fp == nil || other == nil {
		return fp == other
	}
	return fp.Title == other.Title &&
		fp.H1 == other.H1 &&
		fp.WordCount == other.WordCount &&
		fp.LinkCount == other.LinkCount
}
