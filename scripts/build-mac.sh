#!/bin/sh
# Builds Nematode.app, Nematode.dmg and the auto-update package (Nematode.app.tar.gz + .sig).
# The app is signed ad-hoc with a requirement on its bundle id instead of the default per-build hash,
# so macOS keeps the Accessibility permission across rebuilds and updates.
# ponytail: a Developer ID certificate replaces this (and the Gatekeeper warning) when it's worth $99/yr.
set -e
cd "$(dirname "$0")/.."
# Update signing key: a GitHub secret in CI, ~/.tauri/nematode.key locally.
export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$(cat ~/.tauri/nematode.key)}"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

npx tauri build --bundles app "$@"
APP=$(ls -td src-tauri/target/release/bundle/macos/Nematode.app src-tauri/target/*/release/bundle/macos/Nematode.app 2>/dev/null | head -1) # newest; --target builds land in target/<triple>/
OUT=$(dirname "$(dirname "$APP")")

# Dock tile plugin: lets the pinned Dock icon follow the icon picked in the menu bar (universal, with the icons).
PLUG="$APP/Contents/PlugIns/NematodeDockTile.docktileplugin/Contents"
TMP=$(mktemp -d)
mkdir -p "$PLUG/MacOS" "$PLUG/Resources"
for arch in arm64 x86_64; do
  swiftc -parse-as-library -O -target "$arch-apple-macos11" -module-name NematodeDockTile -Xlinker -bundle \
    -o "$TMP/$arch" src-tauri/docktile/NematodeDockTile.swift
done
lipo -create "$TMP/arm64" "$TMP/x86_64" -output "$PLUG/MacOS/NematodeDockTile"
rm -rf "$TMP"
cp src-tauri/docktile/Info.plist "$PLUG/Info.plist"
for f in src-tauri/icons/variants/*.png; do case "$f" in *-menu.png) ;; *) cp "$f" "$PLUG/Resources/" ;; esac; done

codesign --force --deep --sign - --identifier com.nematode.app \
  -r='designated => identifier "com.nematode.app"' "$APP"

# Tauri packed the update before the re-sign above; repack and re-sign it so updates keep the stable signature.
TAR="$OUT/macos/Nematode.app.tar.gz"
rm -f "$TAR" "$TAR.sig"
COPYFILE_DISABLE=1 tar -czf "$TAR" -C "$OUT/macos" Nematode.app
npx tauri signer sign -k "$TAURI_SIGNING_PRIVATE_KEY" -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" "$TAR" >/dev/null

STAGE=$(mktemp -d)
cp -R "$APP" "$STAGE/" && ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Nematode -srcfolder "$STAGE" -ov -format UDZO "$OUT/Nematode.dmg" >/dev/null
rm -rf "$STAGE"
echo "$OUT"
