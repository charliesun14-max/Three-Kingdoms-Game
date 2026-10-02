#!/bin/bash
# Double-click to export every region of the game for Unreal Engine (files go to the unreal-export folder).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org (opening it now), then double-click Export-Unreal-Mac.command again."
  open https://nodejs.org
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules/playwright ]; then
  echo "First run: downloading the game's tools. This takes a few minutes..."
  npm install || { read -r -p "Installing failed. Check your internet connection, then press Enter."; exit 1; }
fi
echo "Making sure the hidden browser used for exporting is installed..."
npx playwright install chromium
echo "Exporting every region for Unreal Engine. This can take 10-20 minutes; leave this window open."
if node tools/unreal/export-world.mjs; then
  open unreal-export
else
  echo "The export stopped with an error. Copy the text above and send it to Claude."
fi
read -r -p "Press Enter to close."
