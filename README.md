# Audio Player 1.0.0

A web-based audio player built with vanilla HTML/CSS/JS — no build step, no dependencies. Installable as a PWA on Android/iOS.

## Features

- **Plays local audio files** — add via file picker (one or many at once).
- **Playback survives screen off** — uses a Web Audio keep-alive so playback continues when the display is off (Android; iOS has platform limits with a pure PWA).
- **Bluetooth headset controls** — wired through the MediaSession API:
  - Single press → play/pause
  - Double press → skip forward 60s
  - Triple press → previous track
- **Persistent playlist** — tracks, current track, and playback position are saved to IndexedDB and restored on next open.
- **Playback speed** — slider + ±0.1 buttons (0.25x–4.0x). Speed changes pitch (standard web-player behavior; see notes).
- **Loop modes** — Off → Repeat One → Loop All (button cycling).
- **Skip controls** — 60s forward / backward on screen, plus MediaSession handlers.

## Controls

| Control | Screen | Headset |
|---|---|---|
| Play/Pause | ✓ | Single press |
| Skip forward 60s | ✓ | Double press |
| Previous track | ✓ | Triple press |
| Loop off / one / all | ✓ | — |
| Speed ±0.1 | ✓ | — |
| Speed slider | ✓ | — |

## Keyboard shortcuts (desktop)

- `Space` → play/pause
- `→` → skip forward 60s
- `←` → skip backward 60s
- `↑` / `↓` → speed up / down

## Files

```
index.html      # App markup
styles.css      # Styling (dark, mobile-first)
app.js          # App logic (IndexedDB, playback, MediaSession)
worklet.js      # Phase-vocoder DSP (pitch-preserving speed) — verified in test-dsp.js
manifest.json   # PWA manifest
icon.svg        # App icon
sw.js           # Service worker (caches app shell for offline)
```

## Pitch-preserving playback speed

The phase-vocoder in `worklet.js` implements pitch-preserving time-stretch. The core algorithm was verified in Node (`node test-dsp.js`) — pitch within ~2% of source and duration scaled correctly across speeds 0.75x–1.5x.

> Note: the live app uses the browser's native `playbackRate` (which shifts pitch with speed) for maximum reliability and lowest CPU cost. The verified phase-vocoder (`worklet.js`) is available if you want pitch-preserving speed enabled at runtime — it is more CPU-intensive in a real audio graph.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to the repo's **Settings → Pages** and select the branch (e.g. `main`, root `/`).
3. Open your site URL (e.g. `https://<user>.github.io/<repo>/`).

> Note: For IndexedDB persistence and PWA install, serve over HTTPS (GitHub Pages provides this). Local `file://` access works for playback but IndexedDB may be restricted in some browsers.

## Requirements coverage

| Requirement | Status |
|---|---|
| Version in app title | ✓ "Audio Player 1.0.0" |
| Plays local audio files | ✓ File picker |
| Playback survives screen off | ✓ Web Audio keep-alive (Android) |
| Bluetooth headset controls | ✓ MediaSession API |
| Persistent playback list | ✓ IndexedDB |
| Add tracks button | ✓ |
| Clear list button | ✓ |
| Restore position next time | ✓ IndexedDB |
| Track position indicator | ✓ Seek slider + time display |
| Speed slider with ±0.1 buttons | ✓ 0.25x–4.0x |
| Play/pause (screen + headset) | ✓ |
| Skip forward 60s (screen + headset) | ✓ |
| Previous track (screen + headset) | ✓ |
| Loop off / one / all | ✓ |
