#!/bin/sh
# Renders every icon from the same drawing code the app uses (src/nematode.js):
# the four switchable app icons (Pink & Blue is the default bundle icon) and the menu bar icon.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=1024,1024 --screenshot="$2" "file://$PWD/scripts/icon.html?$1" 2>/dev/null; }
mkdir -p build src-tauri/icons/variants

for v in pinkblue acid halftone purple; do
  shot "v=$v" "build/icon-$v.png"
  sips -Z 512 "build/icon-$v.png" --out "src-tauri/icons/variants/$v.png" >/dev/null   # applied as the app icon
  sips -Z 64 "build/icon-$v.png" --out "src-tauri/icons/variants/$v-menu.png" >/dev/null # menu preview (shown at 18pt)
done
cp build/icon-pinkblue.png build/icon.png

shot tray build/tray-full.png
sips -Z 64 build/tray-full.png --out src-tauri/icons/tray.png >/dev/null
npx tauri icon build/icon.png -o src-tauri/icons >/dev/null 2>&1
rm -rf src-tauri/icons/ios src-tauri/icons/android src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png
