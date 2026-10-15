#!/usr/bin/env bash
# Autostart serwera deweloperskiego aplikacji web (apps/web).
# Uruchamiany automatycznie przez zadanie VS Code "Start aplikacji web (autostart)".
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"

if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "Serwer deweloperski już działa na http://localhost:${PORT} — pomijam start."
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Brak node_modules — instaluję zależności (pnpm install)..."
  pnpm install
fi

echo "Startuję aplikację web na http://localhost:${PORT} ..."
exec pnpm dev:web
