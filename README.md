# Nematode

A little nematode who walks in from the left edge of your screen and stomps on your claude.ai tab in Chrome.
Grab him and throw him around; he'll find his way back.

- `src/`: the character (`nematode.js`), the transparent click-through overlay (`index.html`), and setup (`setup.html`)
- `src-tauri/`: the native shell. On macOS it reads Chrome's address bar and selected tab through Accessibility.

## Install (Mac)

Open `Nematode.dmg`, drag Nematode to Applications, open it, and click **Allow**. It lives in the menu bar.

## Develop

```bash
npm install
npm run dev         # run with live reload
npm run build:mac   # Nematode.app + Nematode.dmg, signed so Accessibility survives rebuilds
npm run icons       # re-render icons from src/nematode.js
```

Preview the animation in a browser: serve `src/` and open `index.html?demo`.

Windows: the `build` workflow in GitHub Actions builds the installer. Tab detection on Windows isn't done yet.
