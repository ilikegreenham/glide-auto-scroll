// Settings and helpers shared by the popup, the background worker, the PDF
// reader and the page script. Speeds are in pixels per second.
//
// This file can be loaded more than once into the same page (each time you
// press the shortcut or open the popup), so it uses `var` and an existing-check
// instead of `const`, which would throw "already declared" the second time.

var GLIDE = self.GLIDE || {
  DEFAULTS: {
    speed: 60,          // starting speed
    showControls: true, // show the small floating control on the page
    stopAtEnd: true,    // pause automatically at the bottom of the page
    autoSpeed: false    // beta: adjust speed to how dense the text is
  },
  MIN_SPEED: 5,
  MAX_SPEED: 600,
  SPEED_STEP: 1.2,      // each "faster" press multiplies speed by this

  clampSpeed(value) {
    return Math.round(Math.min(GLIDE.MAX_SPEED, Math.max(GLIDE.MIN_SPEED, value)));
  },

  // Load all settings, filling in defaults for anything never saved.
  async loadSettings() {
    const saved = await chrome.storage.local.get(Object.keys(GLIDE.DEFAULTS));
    return { ...GLIDE.DEFAULTS, ...saved };
  },

  // ----- The Glide PDF reader -----

  readerUrl(fileUrl) {
    return chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(fileUrl);
  },

  isReaderUrl(url) {
    return typeof url === "string" && url.startsWith(chrome.runtime.getURL("viewer.html"));
  },

  // Chrome's built-in PDF viewer blocks every extension. Pages that fail for
  // that reason are ordinary web or file addresses, unlike chrome:// pages.
  couldBePdf(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      if (u.protocol === "file:") return /\.pdf$/i.test(u.pathname);
      if (!/^https?:$/.test(u.protocol)) return false;
      if (/(^|\.)chromewebstore\.google\.com$/.test(u.hostname)) return false;
      if (u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore")) return false;
      return true;
    } catch {
      return false;
    }
  },

  // ----- Talking to a tab -----

  // Make sure the scrolling script is running in this tab.
  // Returns false on pages Chrome protects (chrome://, Web Store, its PDF viewer).
  async prepareTab(tab) {
    if (GLIDE.isReader(tab)) return true; // the reader has Glide built in
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared.js", "content.js"] });
      return true;
    } catch {
      // Chrome sometimes hides the address of extension pages. Ask whether
      // this tab is the Glide reader before giving up.
      const reply = await chrome.runtime.sendMessage({ type: "getState", tabId: tab.id }).catch(() => null);
      if (reply) tab.isGlideReader = true;
      return Boolean(reply);
    }
  },

  isReader(tab) {
    return Boolean(tab.isGlideReader) || GLIDE.isReaderUrl(tab.url);
  },

  // Send a command ("toggle", "faster", ...) and get back the scroll state.
  async sendToTab(tab, type) {
    try {
      if (GLIDE.isReader(tab)) {
        // Extension pages don't get tab messages, so broadcast with the tab id.
        return await chrome.runtime.sendMessage({ type, tabId: tab.id });
      }
      return await chrome.tabs.sendMessage(tab.id, { type });
    } catch {
      return null;
    }
  }
};
self.GLIDE = GLIDE;
