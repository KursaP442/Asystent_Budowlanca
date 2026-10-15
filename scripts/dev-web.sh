#!/usr/bin/env bash
# Kompatybilny wrapper dla środowisk Unix/Codespaces.
set -euo pipefail

cd "$(dirname "$0")/.."
exec node scripts/dev-web.mjs
