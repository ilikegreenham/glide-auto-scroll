// The page script: does the actual scrolling and draws the small floating
// control. It is injected into a tab only when you use Glide on it (opening
// the popup or pressing a shortcut), so the extension never needs the
// "read all your websites" permission.

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

  // ---------------------------------------------------------------------
  // The scroll loop. requestAnimationFrame runs once per screen refresh
  // (usually 60 times a second) and pauses itself in background tabs.
  // ---------------------------------------------------------------------

  function frame(now) {
    if (!running) return;
    if (lastTime === null) lastTime = now;
    const elapsed = Math.min(now - lastTime, 100); // ms; cap big gaps (tab was hidden)
    lastTime = now;

    // Browsers only scroll in whole pixels, so we save up fractions.
    carry += (settings.speed * elapsed) / 1000;
    const step = Math.floor(carry);

    if (step >= 1) {
      carry -= step;
      if (!target || !target.isConnected) target = findTarget();
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

    if (target && isAtBottom(target)) {
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

  const getState = () => ({ running, speed: settings.speed, reachedEnd });

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
        .label { min-width: 62px; text-align: center; font-variant-numeric: tabular-nums; padding: 0 4px; }
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
    controls.label.textContent = reachedEnd && !running ? "The end" : `${settings.speed} px/s`;
    // Briefly brighten so you notice the change.
    controls.bar.classList.add("flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => controls.bar.classList.remove("flash"), 1200);
  }

  // ---------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------

  // Messages from the popup and the keyboard shortcuts.
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    switch (message.type) {
      case "toggle": toggle(); break;
      case "start": start(); break;
      case "stop": stop(); break;
      case "faster": changeSpeed(1); break;
      case "slower": changeSpeed(-1); break;
      case "getState": break;
      default: return;
    }
    reply(getState());
  });

  // Settings changed in the popup (or in another tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings && newValue !== undefined) settings[key] = newValue;
    }
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
