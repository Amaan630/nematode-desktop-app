# Nematode

A little nematode who walks in from the left edge of your screen and stomps on your claude.ai tab in Chrome.
Grab him and throw him around; he'll find his way back.

- `src/`: the character (`nematode.js`), the transparent click-through overlay (`index.html`), and setup (`setup.html`)
- `src-tauri/`: the native shell. On macOS it reads Chrome's address bar and selected tab through Accessibility.

## Install

Download from [Releases](https://github.com/Amaan630/nematode-desktop-app/releases/latest):
`Nematode.dmg` (Mac) or the `-setup.exe` (Windows). On Mac, drag Nematode to Applications, open it, and click
**Allow**. It lives in the menu bar and updates itself: it checks at launch and once a day.

## Develop

```bash
npm install
npm run dev         # run with live reload
npm run build:mac   # Nematode.app + Nematode.dmg, signed so Accessibility survives rebuilds
npm run icons       # re-render icons from src/nematode.js
```

Preview the animation in a browser: serve `src/` and open `index.html?demo`.

## Release

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, commit, then:

```bash
git tag v0.2.1 && git push --tags
```

GitHub Actions builds Mac and Windows, then publishes a release with `latest.json`. Installed apps pick it up
within a day (or at next launch). Updates are signed with `~/.tauri/nematode.key` (also the
`TAURI_SIGNING_PRIVATE_KEY` repo secret); losing that key means installed copies can't update.
