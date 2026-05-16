module github.com/GrayCodeAI/inspect

go 1.26.1

require (
	github.com/GrayCodeAI/hawk/sarif v0.1.0
	github.com/mark3labs/mcp-go v0.49.0
	golang.org/x/net v0.40.0
)

require (
	github.com/google/jsonschema-go v0.4.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/spf13/cast v1.7.1 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
)

// TODO(release): remove this `replace` once github.com/GrayCodeAI/hawk is
// pushed and the hawk/sarif sub-module is reachable upstream. While the
// module lives only in the local hawk-eco workspace, the replace points at
// it so `go build` works without the upstream existing.
replace github.com/GrayCodeAI/hawk/sarif => ../hawk/sarif
