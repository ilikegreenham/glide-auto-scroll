// Settings shared by the popup, the background worker and the page script.
// Speeds are in pixels per second.
//
// This file can be loaded more than once into the same page (each time you
// press the shortcut or open the popup), so it uses `var` and an existing-check
// instead of `const`, which would throw "already declared" the second time.

var GLIDE = self.GLIDE || {
  DEFAULTS: {
    speed: 60,          // starting speed
    showControls: true, // show the small floating control on the page
    stopAtEnd: true     // pause automatically at the bottom of the page
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
  }
};
self.GLIDE = GLIDE;
