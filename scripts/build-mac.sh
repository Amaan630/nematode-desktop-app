#!/bin/sh
# Builds Nematode.app and Nematode.dmg.
# The app is signed ad-hoc with a requirement on its bundle id instead of the default per-build hash,
# so macOS keeps the Accessibility permission across rebuilds and updates.
# ponytail: a Developer ID certificate replaces this (and the Gatekeeper warning) when it's worth $99/yr.
set -e
cd "$(dirname "$0")/.."
npx tauri build --bundles app "$@"
APP=$(ls -td src-tauri/target/release/bundle/macos/Nematode.app src-tauri/target/*/release/bundle/macos/Nematode.app 2>/dev/null | head -1) # newest; --target builds land in target/<triple>/
OUT=$(dirname "$(dirname "$APP")")
codesign --force --deep --sign - --identifier com.nematode.app \
  -r='designated => identifier "com.nematode.app"' "$APP"
STAGE=$(mktemp -d)
cp -R "$APP" "$STAGE/" && ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Nematode -srcfolder "$STAGE" -ov -format UDZO "$OUT/Nematode.dmg" >/dev/null
rm -rf "$STAGE"
echo "$OUT/Nematode.dmg"
