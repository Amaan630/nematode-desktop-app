#!/bin/sh
# Renders every icon from the same drawing code the app uses (src/characters/):
#   - the app icons: Soft Pink (the default, Croissant on the site's pink) and four dithered ones
#   - each character's Character-menu preview and menu bar icon
#   - the install-window background and a local copy of the site's link-preview card
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=1024,1024 --screenshot="$2" "file://$PWD/scripts/icon.html?$1" 2>/dev/null; }
node scripts/hat-icons.mjs
mkdir -p build src-tauri/icons/variants src-tauri/icons/characters

# One app icon: build/icon-<name>.png (1024) -> variants/<name>.png (applied), -menu.png (18pt preview), .ico (Windows).
app_icon() {
  shot "$1" "build/icon-$2.png"
  sips -Z 512 "build/icon-$2.png" --out "src-tauri/icons/variants/$2.png" >/dev/null
  sips -Z 64 "build/icon-$2.png" --out "src-tauri/icons/variants/$2-menu.png" >/dev/null
  ICO=$(mktemp -d)
  npx tauri icon "build/icon-$2.png" -o "$ICO" >/dev/null 2>&1 && cp "$ICO/icon.ico" "src-tauri/icons/variants/$2.ico"
  rm -rf "$ICO"
}

app_icon "v=soft" soft
for v in pinkblue acid halftone purple; do app_icon "v=$v" "$v"; done

# Every character in src/characters/: its menu preview and menu bar icon (trimmed to his outline).
for f in src/characters/*.js; do
  c=$(basename "$f" .js)
  shot "char=$c" "build/char-$c.png"
  sips -Z 64 "build/char-$c.png" --out "src-tauri/icons/characters/$c-menu.png" >/dev/null
  shot "tray=$c" "build/tray-$c.png"
  size=$("$CHROME" --headless --disable-gpu --dump-dom "file://$PWD/scripts/icon.html?tray=$c" 2>/dev/null | sed -n 's:.*<title>\(.*\)</title>.*:\1:p')
  sips -c "${size#* }" "${size% *}" "build/tray-$c.png" --out "build/tray-$c.png" >/dev/null  # height width
  sips -Z 64 "build/tray-$c.png" --out "src-tauri/icons/characters/$c-tray.png" >/dev/null
done

# The default (Soft Pink) is baked into the app bundle.
cp build/icon-soft.png build/icon.png
npx tauri icon build/icon.png -o src-tauri/icons >/dev/null 2>&1
rm -rf src-tauri/icons/ios src-tauri/icons/android src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png

# Install window background (1x + 2x in one .tiff)
"$CHROME" --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=540,380 --screenshot="$PWD/build/dmg-background.png" "file://$PWD/scripts/dmg-background.html" 2>/dev/null
"$CHROME" --headless --hide-scrollbars --force-device-scale-factor=2 --window-size=540,380 --screenshot="$PWD/build/dmg-background@2x.png" "file://$PWD/scripts/dmg-background.html" 2>/dev/null
tiffutil -cathidpicheck build/dmg-background.png build/dmg-background@2x.png -out build/dmg-background.tiff >/dev/null

# Link-preview card for the site (CI renders its own copy on every deploy; this one is for looking at)
"$CHROME" --headless --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=800 --screenshot="$PWD/build/og.png" "file://$PWD/scripts/og-card.html" 2>/dev/null
