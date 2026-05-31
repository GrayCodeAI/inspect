# inspect

Security, accessibility, and performance auditing tool for web properties.

## Build & Test
- go test ./... -count=1 — run all tests
- go test -run "TestArchive|TestFindingsStore|TestCircuit" -count=1 — new feature tests

## Architecture
- Root package: inspect — scanner, archive, findings store
- internal/check/ — check implementations (links, soft404)
- internal/crawler/ — crawler with circuit breaker
- internal/report/ — report generation

## Key Patterns
- Circuit breaker pattern for per-host error throttling
- Soft 404 detection for false positive reduction
- Gzipped JSON archive format for scan results
- Findings storage bridge with batch buffering

## Recent Additions
- Soft 404 / false positive detection
- Per-host circuit breaker with auto-throttle
- Scan result archive format
- Findings storage bridge
