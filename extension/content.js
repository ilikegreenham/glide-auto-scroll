// The page script: does the actual scrolling and draws the small floating
// control. It is injected into a tab only when you use Glide on it (opening
// the popup or pressing a shortcut), so the extension never needs the
// "read all your websites" permission. The Glide PDF reader loads it directly.

(() => {
  // Already injected into this page? Then the listeners below already exist.
  if (window.__glideLoaded) return;
  window.__glideLoaded = true;

  const settings = { ...GLIDE.DEFAULTS };
  let running = false;
  let reachedEnd = false;

  // Scroll engine state
  let target = null;      // the element we scroll (page or an inner panel)
  let carry = 0;          // fractional pixels waiting to be scrolled
  let lastTime = null;    // timestamp of the previous animation frame
  let bottomSince = null; // when we first noticed we were at the bottom
  let failedMoves = 0;    // scroll attempts that did not move anything
  let pointerX = innerWidth / 2;
  let pointerY = innerHeight / 2;

  GLIDE.loadSettings().then((s) => {
    Object.assign(settings, s);
    updateControls();
  });

  // ---------------------------------------------------------------------
  // Finding what to scroll
  // Many sites (Google Docs, Gmail, Notion, chat apps) scroll an inner
  // panel rather than the whole page, so we look for the scrollable box
  // under the mouse pointer and fall back to the page itself.
  // ---------------------------------------------------------------------

  const root = () => document.scrollingElement || document.documentElement;

  function canScroll(el) {
    if (el === root()) return el.scrollHeight > el.clientHeight + 1;
    const overflow = getComputedStyle(el).overflowY;
    return /(auto|scroll|overlay)/.test(overflow) && el.scrollHeight > el.clientHeight + 1;
  }

  function findTarget() {
    let el = document.elementFromPoint(pointerX, pointerY);
    while (el && el !== document.body && el !== document.documentElement) {
      if (el !== controlHost && canScroll(el)) return el;
      el = el.parentElement;
    }
    if (canScroll(root())) return root();
    // Nothing under the pointer: pick the largest scrollable box on the page.
    let best = null;
    let bestArea = 0;
    for (const candidate of document.querySelectorAll("body *")) {
      if (candidate.clientHeight < 100) continue;
      const area = candidate.clientWidth * candidate.clientHeight;
      if (area > bestArea && canScroll(candidate)) {
        best = candidate;
        bestArea = area;
      }
    }
    return best || root();
  }

  const isAtBottom = (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

  // The visible part of the scroll target, in window coordinates.
  function visibleBox(el) {
    if (!el || el === root()) return { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    const r = el.getBoundingClientRect();
    return {
      top: Math.max(0, r.top),
      bottom: Math.min(innerHeight, r.bottom),
      left: Math.max(0, r.left),
      right: Math.min(innerWidth, r.right)
    };
  }

  // ---------------------------------------------------------------------
  // Auto speed (beta)
  // Every quarter second we measure how much text is in the "reading band"
  // (the middle of the screen, where your eyes are), as characters per
  // pixel of height. Dense text slows down, sparse text, short lines and
  // gaps speed up. It compares against this page's own running average,
  // so your chosen speed stays the average speed on any site.
  // ---------------------------------------------------------------------

  const AUTO = {
    SAMPLE_MS: 250,     // how often to measure
    AVG_SECONDS: 25,    // how long the "normal density" memory is
    SMOOTH_SECONDS: 1.2,// how gently the speed changes
    MIN_FACTOR: 0.45,   // never slower than 45% of your speed...
    MAX_FACTOR: 2.0     // ...or faster than 200%
  };
  let autoFactor = 1;
  let avgDensity = null;
  let lastSampleTime = 0;
  const ownTextCache = new WeakMap();

  // Text that belongs to this block itself, not to blocks nested inside it.
  function ownTextLength(block) {
    if (ownTextCache.has(block)) return ownTextCache.get(block);
    let text = "";
    for (const node of block.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue;
      else if (node.nodeType === Node.ELEMENT_NODE && isInline(node)) text += node.textContent;
    }
    const length = text.replace(/\s+/g, " ").trim().length;
    ownTextCache.set(block, length);
    return length;
  }

  function isInline(el) {
    const display = getComputedStyle(el).display;
    return display === "inline" || display === "contents";
  }

  function blockOf(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === Node.ELEMENT_NODE && !isInline(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Characters per pixel of height between bandTop and bandBottom.
  function measureDensity() {
    const box = visibleBox(target);
    const height = box.bottom - box.top;
    if (height < 80) return null;
    const bandTop = box.top + height * 0.3;
    const bandBottom = box.top + height * 0.8;

    // The PDF reader knows exactly where its text is, so it answers directly.
    if (typeof window.__glideDensity === "function") {
      return window.__glideDensity(bandTop, bandBottom);
    }

    const blocks = new Set();
    for (let y = bandTop; y < bandBottom; y += 16) {
      for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        const x = box.left + (box.right - box.left) * fraction;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === controlHost) continue;
        const block = blockOf(hit);
        if (block) blocks.add(block);
      }
    }
    let chars = 0;
    for (const block of blocks) {
      const r = block.getBoundingClientRect();
      const overlap = Math.min(r.bottom, bandBottom) - Math.max(r.top, bandTop);
      if (r.height <= 0 || overlap <= 0) continue;
      chars += (ownTextLength(block) * overlap) / r.height;
    }
    return chars / (bandBottom - bandTop);
  }

  function updateAutoFactor(now) {
    if (now - lastSampleTime < AUTO.SAMPLE_MS) return;
    const elapsed = lastSampleTime ? (now - lastSampleTime) / 1000 : AUTO.SAMPLE_MS / 1000;
    lastSampleTime = now;

    const density = measureDensity();
    if (density === null || density === undefined) return; // can't tell: keep going as we are

    // Learn this page's normal density (ignoring blank stretches).
    if (avgDensity === null) {
      if (density > 0) avgDensity = density;
      return;
    }
    if (density > avgDensity * 0.15) {
      avgDensity += (density - avgDensity) * (1 - Math.exp(-elapsed / AUTO.AVG_SECONDS));
    }

    const wanted = Math.min(AUTO.MAX_FACTOR,
      Math.max(AUTO.MIN_FACTOR, avgDensity / Math.max(density, 1e-6)));
    autoFactor += (wanted - autoFactor) * (1 - Math.exp(-elapsed / AUTO.SMOOTH_SECONDS));
  }

  const currentSpeed = () =>
    Math.round(settings.speed * (settings.autoSpeed ? autoFactor : 1));

  // ---------------------------------------------------------------------
  // The scroll loop. requestAnimationFrame runs once per screen refresh
  // (usually 60 times a second) and pauses itself in background tabs.
  // ---------------------------------------------------------------------

  let lastLabelTime = 0;

  function frame(now) {
    if (!running) return;
    if (lastTime === null) lastTime = now;
    const elapsed = Math.min(now - lastTime, 100); // ms; cap big gaps (tab was hidden)
    lastTime = now;

    if (!target || !target.isConnected) target = findTarget();
    if (settings.autoSpeed) {
      updateAutoFactor(now);
      if (now - lastLabelTime > 700) {
        lastLabelTime = now;
        updateLabel();
      }
    }

    // Browsers only scroll in whole pixels, so we save up fractions.
    carry += (settings.speed * (settings.autoSpeed ? autoFactor : 1) * elapsed) / 1000;
    const step = Math.floor(carry);

    if (step >= 1) {
      carry -= step;
      const before = target.scrollTop;
      target.scrollBy({ top: step, behavior: "instant" });

      if (target.scrollTop === before && !isAtBottom(target)) {
        // Stuck but not at the bottom: we probably picked the wrong box.
        if (++failedMoves >= 3) {
          target = findTarget();
          failedMoves = 0;
        }
      } else {
        failedMoves = 0;
      }
    }

    if (isAtBottom(target)) {
      bottomSince ??= now;
      // Wait a moment in case the site loads more content (infinite scroll).
      if (settings.stopAtEnd && now - bottomSince > 1500) {
        reachedEnd = true;
        stop();
        return;
      }
    } else {
      bottomSince = null;
    }

    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    reachedEnd = false;
    target = findTarget();
    carry = 0;
    lastTime = null;
    bottomSince = null;
    failedMoves = 0;
    autoFactor = 1;
    avgDensity = null;
    lastSampleTime = 0;
    controlsDismissed = false;
    requestAnimationFrame(frame);
    announce();
  }

  function stop() {
    running = false;
    announce();
  }

  function toggle() {
    running ? stop() : start();
  }

  function changeSpeed(direction) {
    const factor = direction > 0 ? GLIDE.SPEED_STEP : 1 / GLIDE.SPEED_STEP;
    let next = GLIDE.clampSpeed(settings.speed * factor);
    if (next === settings.speed) next = GLIDE.clampSpeed(settings.speed + direction);
    settings.speed = next;
    chrome.storage.local.set({ speed: next }); // popup and other tabs pick this up
    announce();
  }

  const getState = () => ({
    running,
    speed: settings.speed,
    currentSpeed: currentSpeed(),
    autoSpeed: settings.autoSpeed,
    reachedEnd
  });

  // Tell the popup (if open) and the toolbar badge what changed.
  function announce() {
    updateControls();
    chrome.runtime.sendMessage({ type: "state", state: getState() }).catch(() => {});
  }

  // ---------------------------------------------------------------------
  // The floating control in the corner of the page.
  // It lives inside a "shadow root" so the website's CSS can't break it.
  // ---------------------------------------------------------------------

  let controlHost = null;
  let controls = null;
  let controlsDismissed = false;

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  function buildControls() {
    controlHost = document.createElement("glide-auto-scroll");
    controlHost.style.cssText = "all: initial; position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;";
    const shadow = controlHost.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .bar {
          display: flex; align-items: center; gap: 2px; padding: 4px;
          font: 500 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #f4f4f6; background: rgba(28, 28, 34, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 999px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(8px);
          opacity: 0.6; transition: opacity 0.2s;
          user-select: none;
        }
        .bar:hover, .bar.flash { opacity: 1; }
        button {
          all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 50%;
          display: grid; place-items: center; font-size: 16px; color: inherit;
        }
        button:hover { background: rgba(255, 255, 255, 0.12); }
        button:focus-visible { outline: 2px solid #7c8cff; }
        .play { background: #5b6cff; width: 32px; height: 32px; }
        .play:hover { background: #6f7eff; }
        svg { width: 16px; height: 16px; fill: currentColor; }
        .label { min-width: 62px; text-align: center; font-variant-numeric: tabular-nums; padding: 0 4px; white-space: nowrap; }
        .auto { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: #aab4ff; margin-right: 4px; }
        .close { width: 24px; height: 24px; font-size: 14px; opacity: 0.7; }
      </style>
      <div class="bar" role="toolbar" aria-label="Glide auto scroll">
        <button class="slower" title="Slower (Alt+Shift+Down)" aria-label="Slower">&minus;</button>
        <button class="play" title="Start or pause (Alt+Shift+S)" aria-label="Start or pause"></button>
        <button class="faster" title="Faster (Alt+Shift+Up)" aria-label="Faster">+</button>
        <span class="label"></span>
        <button class="close" title="Stop and hide (Esc)" aria-label="Stop and hide">&#x2715;</button>
      </div>`;
    controls = {
      bar: shadow.querySelector(".bar"),
      play: shadow.querySelector(".play"),
      label: shadow.querySelector(".label")
    };
    shadow.querySelector(".slower").addEventListener("click", () => changeSpeed(-1));
    shadow.querySelector(".faster").addEventListener("click", () => changeSpeed(1));
    controls.play.addEventListener("click", toggle);
    shadow.querySelector(".close").addEventListener("click", () => {
      controlsDismissed = true;
      stop();
    });
    (document.body || document.documentElement).appendChild(controlHost);
  }

  function updateLabel() {
    if (!controls) return;
    if (reachedEnd && !running) {
      controls.label.textContent = "The end";
    } else if (settings.autoSpeed) {
      controls.label.innerHTML = `<span class="auto">AUTO</span>${running ? currentSpeed() : settings.speed} px/s`;
    } else {
      controls.label.textContent = `${settings.speed} px/s`;
    }
  }

  let flashTimer = null;
  function updateControls() {
    const visible = settings.showControls && !controlsDismissed && (running || reachedEnd || controlHost);
    if (!visible) {
      if (controlHost) controlHost.style.display = "none";
      return;
    }
    if (!controlHost) buildControls();
    controlHost.style.display = "";
    controls.play.innerHTML = running ? ICON_PAUSE : ICON_PLAY;
    updateLabel();
    // Briefly brighten so you notice the change.
    controls.bar.classList.add("flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => controls.bar.classList.remove("flash"), 1200);
  }

  // ---------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------

  function handleCommand(type) {
    switch (type) {
      case "toggle": toggle(); break;
      case "start": start(); break;
      case "stop": stop(); break;
      case "faster": changeSpeed(1); break;
      case "slower": changeSpeed(-1); break;
      case "getState": break;
      default: return null;
    }
    return getState();
  }

  if (location.protocol === "chrome-extension:") {
    // Inside the Glide PDF reader. Messages are broadcast to every Glide
    // page, so only answer the ones addressed to this tab.
    let myTabId = null;
    chrome.tabs.getCurrent((tab) => { myTabId = tab?.id ?? null; });
    chrome.runtime.onMessage.addListener((message, _sender, reply) => {
      if (message.tabId === undefined || message.tabId !== myTabId) return;
      const state = handleCommand(message.type);
      if (state) reply(state);
    });
  } else {
    chrome.runtime.onMessage.addListener((message, _sender, reply) => {
      const state = handleCommand(message.type);
      if (state) reply(state);
    });
  }

  // Settings changed in the popup (or in another tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings && newValue !== undefined) settings[key] = newValue;
    }
    if (changes.autoSpeed) autoFactor = 1;
    updateControls();
  });

  // Remember where the mouse is, so we scroll the panel you are looking at.
  addEventListener("mousemove", (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }, { passive: true, capture: true });

  // Clicking into a different scrollable panel switches to it.
  addEventListener("mousedown", (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (running && !(controlHost && e.composedPath().includes(controlHost))) target = findTarget();
  }, { passive: true, capture: true });

  // Esc pauses.
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && running) stop();
  }, { capture: true });
})();
