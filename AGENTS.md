# AGENTS.md — working on Nematode

Read this before changing anything. It is the single source of truth for how the project fits together, how it is
built and released, how to test it, what the owner expects, and which mistakes have already been made once.
When you change how something works, update this file in the same commit.

---

## 1. What this is

**Nematode** is a desktop buddy for Mac and Windows. A small character lives in a transparent, click-through
overlay over your screen:

- When the active Chrome tab is **claude.ai**, he walks in from the left edge, stands on that exact tab (horizontal
  or vertical tab strips) and stomps on it. When you leave Claude he walks off.
- From the menu bar you can **Summon** him (he roams above the Dock, wanders, sometimes runs from the cursor) and
  **Dismiss** him.
- You can **grab and throw** him: gravity, spin, bounces off screen edges, he stands up and walks back.
- **Click** him (a press under 5 px and 0.25 s) and a cel-shaded heart pops out above his head and floats away.
  A press that moves or lasts longer becomes a grab (`CLICK_PX`, `CLICK_S` in `overlay.js`).
- Two **characters**: Nematode (the original) and Croissant. More will be added (see §6).
- Five **app icons**, all fixed. **Soft Pink** (Croissant on the site pink) is the default; the dithered four show Nematode.
  The **menu bar icon** is the current character.
- Opens at login, **auto-updates** from GitHub Releases, one-time **Accessibility** permission on macOS.

Repo: <https://github.com/Amaan630/nematode-desktop-app> (public). Site: <https://amaan630.github.io/nematode-desktop-app/>.
Owner: Amaan (GitHub `Amaan630`). The installed copy lives at `/Applications/Nematode.app`.

---

## 2. Owner's rules (non-negotiable)

These came from direct feedback. Breaking them has cost real time before.

**Process**
- **Never add `Co-Authored-By:` or any AI attribution** to commits or PRs. Plain commit messages only.
- **Do not push, tag or release unless asked.** "Commit locally" is the default. When asked to publish/release,
  do the whole thing (bump, push, tag, watch CI, verify the release and the site).
- When the owner says "don't rebuild/release yet", respect it exactly.
- Visual or design changes: **show an image first** (render it, send it), don't just change the app and describe it.
- Verify before claiming. If something couldn't be tested (e.g. Windows on a real PC), say so plainly.

**Design taste**
- **Quiet, minimal, native.** No wordy UI, no decorative cards/gradients, one action per screen, one short line of copy.
  Design and *look at* every state (before/after, hints appearing, granted, errors) at the real size before shipping.
- **Simple for non-technical people.** No Chrome extensions, no developer mode, no terminal steps for users.
- Never do anything invasive to the user's system: e.g. **never restart the Dock** (`killall Dock` un-minimizes all
  windows — this was tried and rejected). Find the proper API instead (see the Dock tile plugin).
- Characters are **flat 2D cel-shaded** (solid fills, one hard shadow, bold **dark** outline; the dithered icons alone draw Nematode with a light rim). No soft 3D shading, no crumbs,
  no gradients on characters. **Nematode has no shine** (only a flat shadow band down his back; highlights were
  rejected as too glossy). **Croissant keeps his small glint strokes.**
- Icon/tile backgrounds are **flat colors, never gradients**. The soft pink everywhere is the site's `#ffc9d9`;
  dark pink is `#c2185b`.
- Croissant: **waddle walk with straight stubby legs** (the jointed-knee walk was rejected). **Jiggle only from real
  movement** — holding him still must not move him; legs stay still while held; jiggle moderate, not floppy.
- Website: **pink + cream** (`#ffc9d9` / `#fff7ec`, berry `#9c2552` text). No dither anywhere on the site (tried twice,
  rejected both times), characters drawn in their real colors. Favicon = the toggled character's **silhouette**, dark
  pink on light pink, padded evenly. No "Made with Claude" or any AI credit on the site.
- Phones/tablets never get download links (the app can't run there).

---

## 3. Repository map

```
src/                          web code, bundled into the app (Tauri frontendDist)
  index.html                  overlay window shell: defines CHARACTERS, loads characters + overlay.js
  overlay.js                  behavior engine (never draws). Contract for characters at the top.
  heart.js                    drawHeart(): the cel-shaded heart a click pops out (drawn by overlay.js)
  characters/nematode.js      drawNematode() + CHARACTERS.nematode adapter
  characters/croissant.js     drawCroissant() + CroissantJiggle + CHARACTERS.croissant adapter
                              (drawNematode/drawCroissant are THE central drawings: overlay, icons, menu-bar icons,
                              previews, site, favicon and preview card all draw through them)
  setup.html                  one-time Accessibility window (macOS)
src-tauri/                    native app (Rust, Tauri v2)
  src/main.rs                 startup wiring only
  src/presence.rs             Away / On your tab / Summoned state machine + the overlay window
  src/locate.rs               finds the active claude.ai tab (calls mac.rs / win.rs)
  src/mac.rs                  macOS: Accessibility scan, frontmost app, focus, window level, app icon, Dock prefs
  src/win.rs                  Windows: UI Automation scan, foreground, focus restore, shortcut icons
  src/menu.rs                 menu-bar/tray menu and click routing
  src/picker.rs               reusable "remembered choice" submenu with image previews (+ choice! macro)
  src/characters.rs           Character menu (one row per character) + menu-bar icon per character
  src/icons.rs                App Icon menu (one row per icon) + applying it per platform
  src/grab.rs                 cursor polling / click-through toggling / focus hand-back (Tauri commands)
  src/screen.rs               monitor geometry (logical px, top-left origin)
  src/setup.rs                setup window + its commands
  src/autostart.rs            Open at Login (on by default the first time)
  src/update.rs               auto-update loop
  src/store.rs                tiny text files in the app data dir that remember choices
  docktile/                   macOS Dock tile plugin (Swift) so the pinned Dock icon follows the chosen icon
  Info.plist                  merged into the app's Info.plist (registers the Dock tile plugin)
  icons/                      generated icons (do not hand-edit; see §8)
    variants/<id>.png|-menu.png|.ico   fixed app icons; soft-<character>.* = Soft Pink per character;
                                       soft-menu.png = Soft Pink's preview before the app swaps in the active one
    characters/<id>-menu.png|-tray.png per-character menu preview and menu-bar icon
scripts/
  build-mac.sh                full macOS build: app, Dock plugin, stable re-sign, update package, styled DMG
  icons.sh                    regenerates every icon/preview/background from code
  icon.html                   renders app icons (?v=, ?v=soft), previews (?char=), menu-bar icons (?tray=)
  favicon.html                renders the site's fixed favicon.png / apple-touch-icon.png from site/favicon.js
  dmg-background.html, dmg.py install-window background and layout (dmgbuild)
  og-card.html                the site's 1200x630 link-preview card (rendered in CI on every deploy)
site/index.html               the website (GitHub Pages)
site/favicon.js               the site's silhouette favicon (live, follows the toggle; also used for the fixed icons)
build/                        committed renders used by README/site (icon*.png, dmg-background.tiff); rest ignored
.github/workflows/build.yml   builds Mac + Windows; on a v* tag also publishes the Release + latest.json
.github/workflows/pages.yml   publishes the site (copies characters + icons, renders og.png)
```

---

## 4. Architecture

### 4.1 Overlay (web, `src/`)

The overlay is one transparent, frameless, always-on-top window covering one monitor. It ignores the mouse
(click-through) except while the cursor is over the character.

`overlay.js` owns **behavior**: where he goes (`want.mode` = `away` | `tab` | `free`), states
(`gone`, `walk`, `leap`, `stomp`, `idle`, `held`, `fly`), physics (gravity 2600 px/s², bounces), dust, grabbing,
click hearts. It **never draws a character** (dust and hearts are its own). Each frame it builds a neutral **`motion`** and calls the current character:

```
CHARACTERS[id] = {
  name, width, height,          rough on-screen px (edges, cursor distance, stomp height)
  dust,                         puff color
  gait: { hz, pace(phase) },    walk cycles/s and speed multiplier through the cycle
  draw(ctx, at, motion) -> Path2D (outline in screen px, used for hit-testing)
}
at     = { x, ground, face (1 right / -1 left), rot, accel: [ax, ay] px/s², dt, now, zoom? }
motion = { state, phase, t, stretch (1 normal, <1 squashed), hop (px), crouch (0..1), impact (0..1), airborne }
```

The app talks to the overlay with `nema({ mode, x, y, floor, reset })` and `setCharacter(id)` via `eval`.
The overlay calls Tauri commands: `cursor`, `set_grabbable`, `release`, `get_character`.

Each character file is self-contained: a pure drawing function (`drawNematode(ctx, pose)`,
`drawCroissant(ctx, pose)`) used by icons/site too, plus the adapter at the bottom, guarded by
`if (typeof CHARACTERS !== 'undefined')` so files can be loaded where no registry exists.

Character notes:
- **Nematode**: a banded tube along a bendable spine; inchworm gait (surging pace); curls on crouch/impact.
  Cel shading = one flat translucent shadow band down his back side, clipped to his outline. No highlights.
- **Croissant**: seven cel-shaded layers on a crescent, straight stubby legs, waddle (one boot lifts at a time,
  body rocks); `CroissantJiggle` is a spring on each end driven *only* by the body's on-screen acceleration
  (gain 0.22, clamp ±0.45 rad, k 260, damping 12). Legs don't move while held.

### 4.2 Native (Rust, `src-tauri/src/`)

**State machine (`presence.rs`)** — exactly one mode at a time, both the overlay and the menu derive from it:

| Mode | When | Overlay | Menu item |
|---|---|---|---|
| Away | not on Claude, not summoned | `nema({mode:'away'})` | "Summon <Character>" enabled |
| OnTab | claude.ai tab active | `mode:'tab'` at the tab | "Summon <Character>" grayed out |
| Summoned | user summoned | `mode:'free'` (or `tab` when on Claude) | "Dismiss <Character>" |

Dismiss while on Claude sets `snoozed` (he leaves; returns next time you switch to Claude).
A poll thread runs `locate()` every 250 ms and calls `sync()`, which only `eval`s when the message changed.

**Locking rule (deadlock happened once):** never call into Tauri (monitors, windows, menu items, `eval`) while
holding `STATE`. Those calls hop to the main thread, and menu clicks on the main thread wait for `STATE`.
Read a snapshot, release, do Tauri calls, re-lock to record.

**Finding the tab (`locate.rs`)**:
- macOS (`mac.rs`): frontmost app must be `com.google.Chrome*`; walk Chrome's Accessibility tree (skip
  `AXWebArea`), read the address bar (`AXTextField` whose description contains "address") and the selected tab
  (`AXRadioButton` in an `AXTabGroup`/`AXTabButton`, `AXValue`==1), position from `AXPosition`/`AXSize`.
- Windows (`win.rs`): foreground process `chrome.exe`; UI Automation: Edit control named "Address and search bar",
  selected `TabItem` via SelectionItemPattern, bounds converted physical→logical with the monitor DPI.
- He stands at the middle of the tab's bottom edge. If our own app is frontmost (you're holding him), change nothing.

**Grabbing (`grab.rs`)**: the overlay polls `cursor` each frame; when over his outline it calls
`set_grabbable(true)` (window stops ignoring the mouse). macOS remembers the frontmost pid first and `release`
re-activates it after a throw so Chrome keeps focus; Windows uses `WS_EX_NOACTIVATE` (`focusable:false`) plus a
restore fallback.

**Overlay window details**: `backgroundThrottling: "disabled"` (WebKit otherwise suspends an inactive window —
caused a mid-landing freeze), `acceptFirstMouse`, macOS window level 25 + collection behavior so it floats above the
menu bar on every Space. Floor = monitor work area bottom (above Dock/taskbar).

**Menus (`menu.rs`, `picker.rs`)**: Summon/Dismiss · Character ▸ · App Icon ▸ · Open at Login · Quit.
`Picker` builds a submenu of `IconMenuItem`s (18 pt previews), ids `"<key>:<id>"`, ticks the current one with `  ✓`,
and stores the choice in a file named `<key>` in the app data dir (`~/Library/Application Support/com.nematode.app/`).

**Characters (`characters.rs`)**: `apply()` stores the choice, renames Summon/Dismiss, sets the **tray/menu-bar icon**
to `<id>-tray.png`, and tells the overlay. The tray icon is the character's on **both** platforms.

**App icons (`icons.rs`)**: re-applied at every launch (updates reset the bundle). Icons don't depend on the
character. **Soft Pink** (`soft`, first row = default) always shows Croissant and is the bundle's own icon; anything
else is applied on top.
- macOS: `NSWorkspace setIcon` on the bundle (Finder/Launchpad) — verified that the signature still validates
  (non-strict) and Accessibility stays granted; plus the **Dock tile plugin**: the app writes `icon` to its
  preferences (`com.nematode.app`) and posts `com.nematode.app.iconChanged`; the plugin (loaded by the Dock, see
  `docktile/`) redraws the pinned tile. A Dock that pinned Nematode before the plugin existed only loads it after
  the item is re-pinned or the user logs out/in. Never restart the Dock.
- Windows: writes `icon-<id>.ico` (one path per icon, so the icon cache can't go stale) into the app data dir,
  repoints Nematode's Start menu / desktop / taskbar-pin `.lnk` files (matched by target exe), then
  `SHChangeNotify(SHCNE_ASSOCCHANGED)`. Default icon → back to the exe's own icon.

**Setup (`setup.rs`, `src/setup.html`)**: shown only when Accessibility is missing (macOS). States: not asked
("Allow" → system prompt) → asked ("Open System Settings" + hint) → granted ("✓ All set", hop, closes itself).

**Open at Login (`autostart.rs`)**: LaunchAgent (macOS) / Run key (Windows); enabled on first run only, then the
menu checkbox rules.

**Updates (`update.rs`)**: checks `latest.json` at launch and every 24 h, installs signed updates, relaunches only
when he's Away (never yanks him mid-stomp).

### 4.3 Signing and permissions (macOS)

- The app is **ad-hoc signed with a designated requirement on its bundle id** (`designated => identifier
  "com.nematode.app"`) in `scripts/build-mac.sh`. This is why the Accessibility permission survives rebuilds and
  updates. Default ad-hoc signing ties TCC to a per-build hash and silently drops the permission.
- Because of that, the updater package must be **repacked and re-signed after** the re-sign (done in the script).
- No Apple Developer ID yet (owner has an account but chose not to do it now). Users see "Apple could not verify"
  once and use System Settings → Privacy & Security → Open Anyway. Windows shows SmartScreen.
- Reset Accessibility for testing a fresh install: `tccutil reset Accessibility com.nematode.app`.
- Testing a local build on the owner's Mac: don't use `npm run dev` or run the binary from a shell (macOS then checks
  Accessibility for the terminal, not Nematode). Build an app, sign it like a release, quit the installed copy, open it:
  `npx tauri build --debug --bundles app` (the updater-key error at the end is harmless), then
  `codesign --force --deep --sign - --identifier com.nematode.app -r='designated => identifier "com.nematode.app"' src-tauri/target/debug/bundle/macos/Nematode.app`
  and `open -n` that path. Check with `pgrep -fl MacOS/nematode` that only the local one runs.

---

## 5. Build, release, site

### Local
```bash
npm install
npm run dev          # live dev build
npm run build:mac    # Nematode.app + Nematode.dmg (+ update package), stable signature, Dock plugin, styled DMG
npm run icons        # regenerate every icon/preview/background from the drawing code
```
Install locally: quit Nematode, `rm -rf /Applications/Nematode.app && ditto src-tauri/target/release/bundle/macos/Nematode.app /Applications/Nematode.app && open /Applications/Nematode.app`.

`build-mac.sh` steps: `tauri build --bundles app` → compile `docktile/NematodeDockTile.swift` (arm64 + x86_64, lipo)
into `Contents/PlugIns` with the icon PNGs → re-sign with the stable requirement → repack + sign
`Nematode.app.tar.gz` (key from `TAURI_SIGNING_PRIVATE_KEY` or `~/.tauri/nematode.key`) → DMG via `dmgbuild`
(venv in `build/.venv`, layout in `scripts/dmg.py`: 540×380, app left, Applications right, hand-drawn pink arrow).

### Release (only when asked)
The release build is tuned for size in `Cargo.toml` (`[profile.release]`: strip, LTO, `opt-level = "s"`); keep it.
1. Bump the version in **three places**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
   (Cargo.lock updates on build). Also bump the example tag in README's Release section.
2. Commit, `git push`, `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. `build.yml` builds Mac (universal) + Windows; the `release` job renames assets and publishes:
   `Nematode-Mac.dmg`, `Nematode-Windows-Setup.exe`, `Nematode-Mac-update.app.tar.gz`, `latest.json`, with a short
   Download section as release notes. **`latest.json` must keep that exact name** — installed copies look for it.
4. Watch CI (`gh run watch`). GitHub's macOS runners sometimes queue for a long time; a run once got cancelled and
   never published (v0.3.2). If so, re-run or cut the next version.
5. Verify: release assets exist, `curl -sL .../releases/latest/download/latest.json` shows the new version, the site
   shows it, and the local app self-updates (quit + reopen; it updates within ~15 s and relaunches).

Update signing key: `~/.tauri/nematode.key` (+ `.pub`, embedded in `tauri.conf.json`), also the repo secret
`TAURI_SIGNING_PRIVATE_KEY`. Losing it means installed copies can never update — the owner was told to back it up.

### Site (GitHub Pages)
- `site/index.html`, pink + cream. Platform-aware button: Mac → "Download for Mac", Windows → "Download for Windows"
  (+ link to the other), phones/tablets (incl. iPads reporting "Mac" with touch) → **"Send to your computer"**
  (share sheet, else copy link) and **no download links**, other computers → both links. Live version from the GitHub
  API. A **character toggle** (Nematode/Croissant, remembered in localStorage) picks who walks in, hops onto the
  button and stomps — drawn by the same `src/characters/*.js` adapters with the same `motion` shape.
  Reduced motion: he just stands on the button.
- `pages.yml` deploys on changes to the site, characters, icons, the card or the favicon page: copies
  `site/index.html` + `site/favicon.js`, `src/characters/*.js` → `characters/`, `build/icon-*.png` +
  `src-tauri/icons/characters/*-menu.png` → `icons/`, and **renders with headless Chrome on every deploy**:
  `og.png` (from `scripts/og-card.html`), `favicon.png` (64) and `apple-touch-icon.png` (180, square) (from
  `scripts/favicon.html`). So previews, search results and home-screen icons always show the current characters.
  The card auto-shrinks text to fit (CI's Linux font is wider than macOS's).
- The page's live favicon is drawn by `site/favicon.js` from the toggled character; the `<link rel="icon">` points at
  the CI-rendered `favicon.png` for crawlers and no-JS. A page script that appends to `document.body` must come after
  `<body>` (a blank favicon render was caused by this once).
- Link previews are cached by Slack/iMessage etc.; a new image can take a while to show there.

---

## 6. How to change things (checklists)

**Add a character**
1. `src/characters/<id>.js`: a drawing function + `CHARACTERS.<id>` adapter (contract in `src/overlay.js`). Keep the
   cel style. Support `at.zoom`. Return an outline `Path2D`.
2. Load it in `src/index.html` and `site/index.html` (+ a toggle button there), and in `scripts/og-card.html` if it
   should appear on the card.
3. `npm run icons` — renders `<id>-menu.png` and `<id>-tray.png` automatically.
4. One row in `characters![...]` in `src-tauri/src/characters.rs`.
5. Test in the browser harness (§7) through every state, then build/install.
6. Update README (features, character list, icons row), the site copy (toggle, "Pick who and how"), and this file.
   The favicon, fixed site icons and preview card update themselves.

**Add a fixed app icon**: add `?v=<id>` to `variants` in `scripts/icon.html`, `<id>` to the loop in `scripts/icons.sh`,
`npm run icons`, one row in `icons![...]` in `src-tauri/src/icons.rs`; README + site "looks" row (and the count in
their copy: "Five app icons").

**Change anything visible**: render it and show the owner first; check light/dark where relevant, real sizes,
small sizes (64/32 px for icons, 18 pt for menu items), phone width for the site.

**Every change**: keep README, site copy, and this file in sync with reality. README's "How it works" and "Adding a
character" sections describe the architecture for humans.

---

## 7. Testing recipes

- **Overlay in a browser**: serve `src/` (e.g. `python3 -m http.server 8765 -d src`), open
  `index.html?demo` or `?char=croissant`. For deterministic tests stub `requestAnimationFrame`, then step frames
  manually: `let T=performance.now(); last=T; for(...) frame(T += 1000/60)`. Drive `nema({...})`, dispatch
  `PointerEvent`s on the canvas (stub `cv.setPointerCapture`), inspect `n.state`, `CHARACTERS.croissant.jiggle.angles`.
  The browser pane throttles real animation when hidden — always step manually.
- **Renders**: headless Chrome screenshots (`--headless --screenshot --window-size`), e.g. for icons, the DMG
  background, the og card, and design mockups. Headless has a minimum viewport width (~500 px); for narrow views
  render inside an iframe of the exact size.
- **Mac app checks**: `codesign -dr - /Applications/Nematode.app` (must show the identifier requirement),
  `codesign --verify --deep --strict`, list Nematode's windows with a small Swift `CGWindowListCopyWindowInfo`
  script (a 340×300 window means the setup window opened = permission missing).
- **Windows type-check on a Mac**: a full `cargo check --target x86_64-pc-windows-msvc` fails because `ring`
  (via the updater) needs a Windows C compiler. Copy `src-tauri` to a scratch dir, remove `tauri-plugin-updater`
  from Cargo.toml/main.rs/tauri.conf.json and stub `update.rs`, put a no-op `llvm-rc` on PATH, then check. CI is the
  real Windows build. Nothing has ever run on a real Windows PC — say so when relevant.

---

## 8. Gotchas we already hit

- Rebuilding with default ad-hoc signing drops Accessibility → use `build-mac.sh` (stable requirement).
- Deadlock between the poll thread and menu clicks → the locking rule in §4.2.
- First frame `dt = 0` → speeds divide by zero → NaN → character vanished. Clamp `dt >= 0.001`; spring ignores
  non-finite input.
- One thrown exception used to kill the animation loop forever → `frame()` schedules the next frame and wraps `tick()`.
- WebKit suspended the inactive overlay → `backgroundThrottling: "disabled"`.
- `killall Dock` to refresh icons → rejected (un-minimizes windows). Use the Dock tile plugin.
- `npx tauri icon` output is not byte-reproducible; revert unrelated `icon.icns` churn before committing.
- `sips -c` crops around the center; trimming is done in `icon.html` instead and the size is read from the page title.
- Headless Chrome on CI (Linux) has different fonts → fit text in code, don't hard-code sizes for one font.
- Overlapping edit scripts once deleted `locate()`; after large edits always diff and `cargo check`.
- Changing a central drawing (`drawNematode`/`drawCroissant`) changes every icon: run `npm run icons` and look at all
  of them (dithered icons, Soft Pink, previews, menu-bar icons) before committing.

---

## 9. Open items / not done

- Windows has never been run on a real PC (tab detection, updates, shortcut icons are compile-checked only).
- No Apple Developer ID / notarization yet (owner's choice for now); no Windows code-signing certificate.
- `Mac Dock tile`: users who pinned Nematode before v0.3.3 must re-pin once for the Dock icon to follow.
