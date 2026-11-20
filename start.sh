#!/usr/bin/env bash
# Starts PoE Stash Pricer on Linux/macOS: installs dependencies on first run, builds, opens the browser.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Brak Node.js. Zainstaluj wersję LTS: https://nodejs.org/ (albo np. 'sudo apt install nodejs npm')."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Pierwsze uruchomienie – instaluję biblioteki, to potrwa minutę..."
  npm install --no-audit --no-fund
fi

npm start
