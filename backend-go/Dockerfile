# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM golang:1.25-alpine AS builder

WORKDIR /src

# Never auto-download a different toolchain inside the image build.
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOTOOLCHAIN=local

# Cache module downloads separately from source changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /out/taskflow-api ./cmd/api

# ---------- Runtime stage ----------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S -g 10001 taskflow \
 && adduser -S -D -H -u 10001 -G taskflow taskflow

COPY --from=builder /out/taskflow-api /usr/local/bin/taskflow-api

USER taskflow:taskflow

ENV PORT=8080
EXPOSE 8080

# busybox wget ships with alpine — no extra packages needed.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health || exit 1

ENTRYPOINT ["/usr/local/bin/taskflow-api"]
