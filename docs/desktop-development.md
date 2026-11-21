# Test on your actual desktop

From this project folder, run:

```sh
npm run desktop-dev
```

This builds a development copy, signs it with Nematode's stable macOS identity, pauses the installed app,
and opens the development copy on your desktop. Your `/Applications/Nematode.app` stays untouched.
The character starts summoned. Use the menu bar's **Hat** menu to try Pink beret, Blue baseball cap,
Cloud beanie, Ribbon sun hat, or No hat. **Character** switches between Nematode, Croissant, and Kitten.

Save a file under `src/` to reload the actual desktop overlay. No rebuild is needed for JavaScript, CSS,
HTML, or fonts. Reloading restarts the current animation and restores the native Summon/Tab state and
selected character/hat. Changes to Rust or native menus require stopping and rerunning the command;
Cargo reuses its previous build work. Don't run another app build while desktop-dev is running.

Press **Ctrl+C** in that terminal, or choose **Quit Nematode** from the menu bar, to close the development
copy and reopen your installed app. A second desktop-dev command fails before touching the running app.
If the launcher is forcibly killed, close the dev app and reopen `/Applications/Nematode.app` manually.

## What stays separate

- The development copy has auto-updates disabled. Your installed app keeps its normal GitHub updates.
- Dev character/hat preferences live under the app's `desktop-dev` data folder. They don't change your
  normal app's preferences. App Icon and Open at Login controls are disabled during development.
- Dev gestures are local previews: the server serves an empty backend address. It does not register a new
  Cloudflare user or send gestures to the other computer. **Debug → Receive…** previews incoming gestures.
- The server binds only to `127.0.0.1:18765` and serves `src/`, never credentials or Terraform files.
- This launcher is Mac-only. Real Windows interaction and physical sleep/lock still need native testing.

## How it works

`scripts/desktop-dev.mjs` serves the UI and watches `src/`. A server-sent event reloads the page after edits.
`tauri.desktop-dev.conf.json` points the debug bundle at that loopback server, with narrowly scoped native
command access. The `desktop-dev` Cargo feature disables updater/autostart/icon changes and separates saved
choices. `overlay_ready` resends native presence after each reload so a summoned character doesn't vanish.
The launcher builds before closing the installed app, and restores it when the dev session ends.

Checks: `node tests/desktop-dev.mjs` tests the server and reload event; `node tests/social.mjs` tests the
fan, gestures, and hat hit areas at Retina scale. `scripts/hats.html` renders all hat designs on both characters.

**Character → Kitten** is the approved orange tabby with a staggered four-paw walk, sage-green eyes,
and fitted hats. `src/characters/kitten.js` uses the same character/appearance contract in the app,
playground, website, shared gestures, and menu previews.
