#!/bin/sh
# Renders every icon from the same drawing code the app uses (src/characters/):
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
  ICO=$(mktemp -d)                                                                         # Windows shortcuts use .ico
  npx tauri icon "build/icon-$v.png" -o "$ICO" >/dev/null 2>&1 && cp "$ICO/icon.ico" "src-tauri/icons/variants/$v.ico"
  rm -rf "$ICO"
done
cp build/icon-pinkblue.png build/icon.png

# Every character in src/characters/: its Character-menu preview and its menu bar icon (trimmed to his outline).
mkdir -p src-tauri/icons/characters
for f in src/characters/*.js; do
  c=$(basename "$f" .js)
  shot "char=$c" "build/char-$c.png"
  sips -Z 64 "build/char-$c.png" --out "src-tauri/icons/characters/$c-menu.png" >/dev/null
  shot "tray=$c" "build/tray-$c.png"
  size=$("$CHROME" --headless --disable-gpu --dump-dom "file://$PWD/scripts/icon.html?tray=$c" 2>/dev/null | sed -n 's:.*<title>\(.*\)</title>.*:\1:p')
  sips -c "${size#* }" "${size% *}" "build/tray-$c.png" --out "build/tray-$c.png" >/dev/null  # height width
  sips -Z 64 "build/tray-$c.png" --out "src-tauri/icons/characters/$c-tray.png" >/dev/null
done
npx tauri icon build/icon.png -o src-tauri/icons >/dev/null 2>&1
rm -rf src-tauri/icons/ios src-tauri/icons/android src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png

# Install window background (1x + 2x in one .tiff)
"$CHROME" --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=540,380 --screenshot="$PWD/build/dmg-background.png" "file://$PWD/scripts/dmg-background.html" 2>/dev/null
"$CHROME" --headless --hide-scrollbars --force-device-scale-factor=2 --window-size=540,380 --screenshot="$PWD/build/dmg-background@2x.png" "file://$PWD/scripts/dmg-background.html" 2>/dev/null
tiffutil -cathidpicheck build/dmg-background.png build/dmg-background@2x.png -out build/dmg-background.tiff >/dev/null
