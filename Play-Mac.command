#!/bin/bash
# Double-click to play on macOS (the first run installs the game's tools).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org (opening it now), then double-click Play-Mac.command again."
  open https://nodejs.org
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules/electron ]; then
  echo "First run: downloading the game's tools. This takes a few minutes..."
  npm install || { read -r -p "Installing failed. Check your internet connection, then press Enter."; exit 1; }
fi
echo "Starting Mandate of Heaven..."
npm run desktop || read -r -p "Press Enter to close."
