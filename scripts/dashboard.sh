#!/usr/bin/env bash
#
# Sunschool Ecosystem Dashboard — localhost-only, token-gated ops view.
#
# Usage:
#   ./scripts/dashboard.sh              # Start dashboard server on port 9090
#   ./scripts/dashboard.sh --port 8080  # Custom port
#   ./scripts/dashboard.sh --html       # Generate static HTML file only
#   ./scripts/dashboard.sh --json       # Output JSON probe data
#
# The server is localhost-only and requires a token for access.
# A random token is generated on each start and printed to the console.
# Set DASHBOARD_TOKEN env var to use a fixed token.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Default to serve mode if no flags given
if [[ $# -eq 0 ]]; then
  set -- --serve
fi

# Check if ts-node is available
if ! command -v npx &>/dev/null; then
  echo "Error: npx not found. Install Node.js first." >&2
  exit 1
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SUNSCHOOL ECOSYSTEM DASHBOARD          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

exec npx ts-node "$SCRIPT_DIR/ecosystem-dashboard.ts" "$@"
