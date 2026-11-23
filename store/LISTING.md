# Chrome Web Store listing text

Copy each section into the matching box in the Chrome Web Store Developer Dashboard.

---

## Store listing tab

**Name** (comes from manifest.json)
Glide - Smooth Auto Scroll

**Summary** (comes from manifest.json, max 132 characters)
Hands-free, adjustable auto scrolling for reading articles, docs, and long pages.

**Description**
```
Glide scrolls the page for you at a smooth, steady speed, so you can sit back and read.

Perfect for long articles, documentation, recipes, lyrics, scripts, study notes, and anything else you'd rather not keep scrolling by hand.

FEATURES
• Smooth, steady scrolling, from a slow crawl to a quick skim
• Speed slider plus one-tap presets: Slow, Read, Skim, Fast
• Keyboard shortcuts: Alt+Shift+S to start or pause, Alt+Shift+Up/Down to change speed, Esc to pause (all shortcuts can be changed)
• Small floating control on the page (−, play/pause, +, close), or turn it off
• Works on web apps with inner scrolling panels: Glide scrolls the part of the page under your mouse
• Pauses automatically at the end of the page (optional)
• Remembers your speed
• Light and dark mode

PRIVATE BY DESIGN
• No tracking, no analytics, no accounts, no ads
• Collects no data, and nothing leaves your computer
• Runs on a page only after you click the Glide icon or press a Glide shortcut on it
• Needs only three permissions: activeTab, scripting, and storage

HOW TO USE
1. Click the Glide icon in your toolbar (pin it first, from the puzzle-piece menu).
2. Press the play button or Alt+Shift+S.
3. Use the slider or Alt+Shift+Up/Down to set your speed.

Note: Chrome doesn't allow any extension to run on chrome:// pages, the Chrome Web Store, or Chrome's built-in PDF viewer.

Glide is free and open source.
```

**Category:** Tools. (Accessibility would also fit.)
**Language:** English

**Graphics** (all in this `store` folder)
| Dashboard box | File |
|---|---|
| Store icon (128×128) | `store-icon-128.png` |
| Screenshots (1280×800, upload in this order) | `screenshot-1-read-hands-free.png`, `screenshot-2-speed-and-shortcuts.png`, `screenshot-3-works-everywhere.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `promo-marquee-1400x560.png` |

**Homepage URL** (optional): your GitHub repo link
**Support URL** (optional): your GitHub repo's Issues page, for example `https://github.com/ilikegreenham/glide-auto-scroll/issues`

---

## Privacy practices tab

**Single purpose description**
```
Glide automatically scrolls the current web page at a speed the user chooses, so they can read long pages hands-free.
```

**Permission justifications**

activeTab:
```
Used to run Glide on the current tab only after the user clicks the toolbar icon or presses a Glide keyboard shortcut. Glide does not access any other tabs.
```

scripting:
```
Used to insert Glide's scrolling script and its small floating control into the current tab after the user activates Glide there.
```

storage:
```
Used to save the user's preferred scroll speed and two on/off settings (show floating control, pause at end of page) locally on their device.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage:** leave every data type **unchecked**. Glide collects none of them.
Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
`https://github.com/ilikegreenham/glide-auto-scroll/blob/main/PRIVACY.md`
(This works once the repo is public. If the repo is private, leave the box empty. I believe it's optional when you collect no data.)

---

## Distribution tab
- **Payments:** Free
- **Visibility:** Public
- **Regions:** All regions
