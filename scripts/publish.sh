#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# publish.sh — Publish @inspect/cli to npm
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "📦 Inspect Publish Script"
echo ""

# 1. Clean build
echo "Building all packages..."
pnpm build
echo ""

# 2. Run tests
echo "Running tests..."
npx vitest run
echo ""

# 3. Validate CLI
echo "Validating CLI..."
node apps/cli/dist/index.js --help > /dev/null 2>&1 || { echo "❌ CLI help failed"; exit 1; }
node apps/cli/dist/index.js --version > /dev/null 2>&1 || { echo "❌ CLI version failed"; exit 1; }
echo "✅ CLI validated"
echo ""

# 4. Check npm auth
echo "Checking npm authentication..."
npm whoami > /dev/null 2>&1 || { echo "❌ Not logged in to npm. Run: npm login"; exit 1; }
echo "✅ Authenticated as $(npm whoami)"
echo ""

# 5. Publish
echo "Publishing @inspect/cli to npm..."
cd apps/cli
npm publish --access public
echo ""

echo "✅ Published successfully!"
echo ""
echo "Install with: npm install -g @inspect/cli"
