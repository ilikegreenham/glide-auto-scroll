# Glide - Smooth Auto Scroll

Hands-free, adjustable auto scrolling for Chrome. It's made for long articles, docs, notes and anything else you'd rather not keep scrolling by hand.

![Glide popup and floating control](store/screenshot-1-read-hands-free.png)

## Features
- Smooth, steady scrolling from 5 to 600 pixels per second
- Popup with a play/pause button, a speed slider, and Slow / Read / Skim / Fast presets
- Keyboard shortcuts: `Alt+Shift+S` start/pause, `Alt+Shift+↑/↓` speed, `Esc` pause
- Floating on-page control (optional)
- Scrolls the panel under your mouse, so it works in web apps with inner scroll areas
- Pauses itself at the end of the page (optional)
- Light and dark mode
- No data collection, and only three permissions (`activeTab`, `scripting`, `storage`)

## Install from source
1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

## Project layout
| Path | What it is |
|---|---|
| `extension/manifest.json` | Extension name, permissions, icons and shortcuts |
| `extension/content.js` | Runs on the page: the scroll loop, finding the scroll target, the floating control |
| `extension/background.js` | Keyboard shortcuts and the "ON" toolbar badge |
| `extension/popup.*` | The toolbar popup |
| `extension/shared.js` | Default settings and speed limits |
| `store/` | Chrome Web Store screenshots, promo tiles and listing text |
| `PRIVACY.md` | Privacy policy |
| `PUBLISHING.md` | How to publish an update to the Chrome Web Store |

## How the smooth scrolling works
`content.js` uses `requestAnimationFrame`, which runs once per screen refresh. Each frame it moves the page by *speed × time since the last frame*. Browsers scroll in whole pixels, so leftover fractions are carried over to the next frame. That keeps very slow speeds smooth.

## Limitations
Chrome doesn't let extensions run on `chrome://` pages, the Chrome Web Store, or its built-in PDF viewer.

## License
MIT. See [LICENSE](LICENSE).
