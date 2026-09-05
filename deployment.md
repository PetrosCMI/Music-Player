# Deploying Audio Player to GitHub Pages

Audio Player is a dependency-free web app (vanilla HTML/CSS/JS). It deploys as static files to **GitHub Pages**, which provides HTTPS — required for IndexedDB persistence and PWA install to work.

---

## 1. Prepare the files

Make sure these files are in your deploy folder:

| File | Purpose |
|------|---------|
| `index.html` | App markup |
| `styles.css` | Styling |
| `app.js` | App logic (IndexedDB, playback, MediaSession) |
| `worklet.js` | Phase-vocoder DSP (optional; referenced by app) |
| `manifest.json` | PWA manifest |
| `icon.svg` | App icon |
| `sw.js` | Service worker (offline caching) |

**Do NOT commit these:**

- `d80.Series01.mp3` — your 114 MB test audio file. It's far too large to push to GitHub and isn't part of the app.
- `debug-dsp.js`, `test-dsp.js`, `test-logic.js` — local dev/test scripts, not needed at runtime.

Optionally delete them, or move them out of the deploy folder:

```bash
cd /path/to/audio-player
rm debug-dsp.js test-dsp.js test-logic.js d80.Series01.mp3
```

---

## 2. Create a git repository

```bash
cd /path/to/audio-player
git init
```

Create a `.gitignore` to keep accidental large files out:

```gitignore
# Audio files (too large, not part of the app)
*.mp3
*.wav
*.flac

# Local test artifacts
debug-dsp.js
test-dsp.js
test-logic.js
```

Stage and commit:

```bash
git add .
git commit -m "Initial commit: Audio Player"
```

---

## 3. Push to GitHub

Create a new empty repo on [github.com](https://github.com/new) (do **not** check the "Add a README" box — you already have files). Then push:

```bash
git remote add origin https://github.com/PetrosCMI/Music-Player
git branch -M main
git push -u origin main
```

Replace `USERNAME` and `REPO` with your GitHub username and chosen repo name.

---

## 4. Enable GitHub Pages

1. Open your repo on GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select **Commit from a branch**.
4. Set **Branch** to `main`, folder to `/ (root)`.
5. Click **Save**.

After a minute or two, GitHub shows a live URL like:

```
https://USERNAME.github.io/REPO/
```

Click it — the app should load and play.

---

## 5. Install as a PWA (optional)

Open your deployed site in Chrome or Safari on Android/iOS:

- **Android (Chrome):** tap the menu (⋮) → **Add to Home screen**.
- **iOS (Safari):** tap the Share button (▴) → **Add to Home Screen**.

The app installs standalone with its own icon and hides the browser UI.

---

## Notes

- **HTTPS is required** for IndexedDB persistence and PWA install. GitHub Pages serves HTTPS automatically, so this works out of the box.
- **Offline use:** the service worker (`sw.js`) caches the app shell on first load.
- **File picker adds local audio** to the playlist; selections are stored in IndexedDB and restored next time the app opens.
- **Hard refresh** if you ever see stale content after redeploying — the service worker may be serving cached files from a previous version.

---

## Deploying an update

```bash
cd /path/to/audio-player
git add .
git commit -m "Update: <what changed>"
git push
```

GitHub Pages rebuilds automatically within a minute. Hard-refresh your browser to pick up the new code.
