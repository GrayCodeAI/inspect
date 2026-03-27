#!/usr/bin/env bash
# =============================================================================
# Run Inspect CLI commands inside Docker
# Usage: ./scripts/docker-run.sh test -m "test login" --url https://example.com
#        ./scripts/docker-run.sh doctor
#        ./scripts/docker-run.sh --help
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Build if image doesn't exist
if ! docker image inspect inspect:latest &>/dev/null; then
  echo "Building Inspect Docker image..."
  docker build -t inspect:latest -f "$PROJECT_DIR/docker/Dockerfile" "$PROJECT_DIR"
fi

# Pass environment variables from host
ENV_ARGS=()
for var in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_AI_KEY DEEPSEEK_API_KEY INSPECT_LOG_LEVEL; do
  if [ -n "${!var:-}" ]; then
    ENV_ARGS+=(-e "$var=${!var}")
  fi
done

# Run the CLI command
docker run --rm \
  "${ENV_ARGS[@]}" \
  -e CI=true \
  -v "$(pwd)/.inspect:/app/.inspect" \
  inspect:latest \
  node apps/cli/dist/index.js "$@"
