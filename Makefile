.PHONY: all build test test-race cover vet lint bench clean

all: vet test build

build:
	go build ./...

test:
	go test ./... -timeout 60s

test-race:
	go test -race ./... -timeout 60s

cover:
	go test -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out
	@rm -f coverage.out

vet:
	go vet ./...

lint:
	@which staticcheck > /dev/null 2>&1 || (echo "install: go install honnef.co/go/tools/cmd/staticcheck@latest" && exit 1)
	staticcheck ./...

bench:
	go test -bench=. -benchmem ./...

clean:
	go clean
	rm -f coverage.out
