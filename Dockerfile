FROM golang:1.26.3-alpine AS builder

RUN apk add --no-cache git ca-certificates chromium

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags="-s -w \
      -X main.Version=${VERSION} \
      -X main.Commit=${COMMIT} \
      -X main.BuildDate=${BUILD_DATE}" \
    -o inspect-ci ./cmd/inspect-ci

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags="-s -w \
      -X main.Version=${VERSION} \
      -X main.Commit=${COMMIT} \
      -X main.BuildDate=${BUILD_DATE}" \
    -o inspect-action ./cmd/inspect-action

FROM alpine:3.21
# chromium is required for browser-based checks
RUN apk add --no-cache ca-certificates tini chromium && \
    adduser -D -u 1000 inspect

COPY --from=builder /build/inspect-ci /usr/local/bin/inspect-ci
COPY --from=builder /build/inspect-action /usr/local/bin/inspect-action
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

USER inspect
ENTRYPOINT ["tini", "--", "inspect-ci"]
CMD ["--help"]
