#!/usr/bin/env bash
# =============================================================================
# Start Inspect API server + Dashboard with Docker Compose
# Usage: ./scripts/docker-up.sh           Start API + dashboard
#        ./scripts/docker-up.sh --full    Start everything including tunnel
#        ./scripts/docker-up.sh --down    Stop everything
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if [ "${1:-}" = "--down" ]; then
  docker compose down
  echo "Inspect stopped."
  exit 0
fi

if [ "${1:-}" = "--full" ]; then
  docker compose --profile full up --build -d
  echo ""
  echo "Inspect is running:"
  echo "  API:       http://localhost:${INSPECT_PORT:-4100}"
  echo "  Dashboard: http://localhost:${DASHBOARD_PORT:-5173}"
  echo "  Tunnel:    (check 'docker compose logs tunnel' for URL)"
  echo ""
  echo "Stop with: ./scripts/docker-up.sh --down"
  exit 0
fi

docker compose up --build -d
echo ""
echo "Inspect is running:"
echo "  API:       http://localhost:${INSPECT_PORT:-4100}"
echo "  Dashboard: http://localhost:${DASHBOARD_PORT:-5173}"
echo ""
echo "View logs:  docker compose logs -f"
echo "Stop:       ./scripts/docker-up.sh --down"
echo "Run CLI:    docker compose run cli test -m 'test login' --url https://example.com"
