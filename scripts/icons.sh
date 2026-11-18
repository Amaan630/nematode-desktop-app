#!/bin/sh
# Renders icons from the same drawing code the app uses, then fans them out to every size Tauri needs.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=1024,1024 --screenshot="$2" "file://$PWD/scripts/icon.html?$1" 2>/dev/null; }
mkdir -p build src-tauri/icons
shot icon build/icon.png
shot tray build/tray-full.png
sips -Z 64 build/tray-full.png --out src-tauri/icons/tray.png >/dev/null
npx tauri icon build/icon.png -o src-tauri/icons >/dev/null 2>&1
rm -rf src-tauri/icons/ios src-tauri/icons/android src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png
