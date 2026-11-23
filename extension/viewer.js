// Glide Reader: a simple PDF viewer built on Mozilla's pdf.js.
//
// Chrome's own PDF viewer is a protected page that no extension can run in,
// so Glide opens PDFs here instead. The scrolling itself is the normal Glide
// page script (content.js), which this page loads directly.

import * as pdfjsLib from "./pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdfjs/pdf.worker.min.mjs");

const $ = (id) => document.getElementById(id);
const fileUrl = new URLSearchParams(location.search).get("file");
const TOOLBAR_HEIGHT = 48;
const PAGE_GAP = 14;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

let pdf = null;
let pages = [];          // one entry per page, see buildPages()
let scale = 1;           // CSS pixels per PDF point
let fitToWidth = true;   // re-fit when the window is resized
const visible = new Set();

// ---------------------------------------------------------------------------
// Messages shown instead of the PDF (permission needed, loading, errors)
// ---------------------------------------------------------------------------

function showMessage(title, textParts = [], actions = [], { spinner = false } = {}) {
  $("message").hidden = false;
  $("messageTitle").textContent = title;
  const text = $("messageText");
  text.replaceChildren();
  for (const part of textParts) {
    if (typeof part === "string") text.append(part);
    else {
      const strong = document.createElement("span");
      strong.className = "host";
      strong.textContent = part.host;
      text.append(strong);
    }
  }
  const box = $("messageActions");
  box.replaceChildren();
  if (spinner) {
    const s = document.createElement("div");
    s.className = "spinner";
    box.append(s);
  }
  for (const action of actions) {
    const el = document.createElement(action.href ? "a" : "button");
    el.textContent = action.label;
    if (action.primary) el.className = "primary";
    if (action.href) {
      el.href = action.href;
      el.target = "_blank";
      el.rel = "noopener";
    } else {
      el.addEventListener("click", action.onClick);
    }
    box.append(el);
  }
}

const hideMessage = () => { $("message").hidden = true; };

// ---------------------------------------------------------------------------
// Start-up: check permission, then load
// ---------------------------------------------------------------------------

async function main() {
  let url;
  try {
    url = new URL(fileUrl);
  } catch {
    showMessage("No PDF to open", ["Open a PDF in Chrome, then press the Glide icon and choose Open in Glide Reader."]);
    return;
  }

  const name = decodeURIComponent(url.pathname.split("/").pop() || url.hostname);
  $("title").textContent = name;
  document.title = `${name} · Glide Reader`;
  $("original").href = fileUrl;

  if (url.protocol === "file:" && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    showMessage("Let Glide open files on your computer", [
      "This PDF is saved on your computer. In Glide's settings, turn on ",
      { host: "Allow access to file URLs" },
      ", then come back and press Try again."
    ], [
      { label: "Open Glide settings", primary: true, onClick: () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }) },
      { label: "Try again", onClick: () => location.reload() }
    ]);
    return;
  }

  const origins = [url.protocol === "file:" ? "file:///*" : `${url.origin}/*`];
  if (await chrome.permissions.contains({ origins })) {
    load();
    return;
  }

  const ask = async (wanted) => {
    if (await chrome.permissions.request({ origins: wanted })) load();
  };
  showMessage("Allow Glide to open this PDF", [
    "To show this PDF, Glide needs permission to download files from ",
    { host: url.protocol === "file:" ? "your computer" : url.host },
    ". It only uses this for PDFs you open in Glide Reader."
  ], [
    { label: "Allow for this site", primary: true, onClick: () => ask(origins) },
    { label: "Allow for all sites", onClick: () => ask(["<all_urls>"]) }
  ]);
}

async function load() {
  showMessage("Opening PDF…", [], [], { spinner: true });

  const task = pdfjsLib.getDocument({
    url: fileUrl,
    cMapUrl: chrome.runtime.getURL("pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: chrome.runtime.getURL("pdfjs/standard_fonts/"),
    isEvalSupported: false
  });
  task.onProgress = ({ loaded, total }) => {
    const mb = (n) => (n / 1048576).toFixed(1);
    $("messageText").textContent = total ? `${mb(loaded)} of ${mb(total)} MB` : `${mb(loaded)} MB`;
  };

  try {
    pdf = await task.promise;
  } catch (error) {
    showMessage("Couldn't open this PDF", [
      "The file may need you to be signed in, may have moved, or may not be a PDF. ",
      `(${error?.message || error})`
    ], [{ label: "Open the original", primary: true, href: fileUrl }]);
    return;
  }

  hideMessage();
  await buildPages();
  restorePosition();
}

// ---------------------------------------------------------------------------
// Pages: each one is a placeholder box, and its picture is drawn only while
// it is on or near the screen. A 1,000-page textbook stays fast that way.
// ---------------------------------------------------------------------------

async function buildPages() {
  const first = await pdf.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const container = $("pages");

  pages = [];
  for (let num = 1; num <= pdf.numPages; num++) {
    const el = document.createElement("div");
    el.className = "page";
    el.dataset.num = num;
    el.setAttribute("aria-label", `Page ${num}`);
    container.append(el);
    // Size is a guess (same as page 1) until the page itself is loaded.
    pages.push({ num, el, width: base.width, height: base.height, canvas: null, drawnScale: 0, drawing: null, text: null });
  }

  $("pageCount").textContent = pdf.numPages;
  $("pageInfo").hidden = false;
  $("zoomControls").hidden = false;

  scale = fitScale();
  layout();

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const page = pages[Number(entry.target.dataset.num) - 1];
      if (entry.isIntersecting) {
        visible.add(page);
        draw(page);
      } else {
        visible.delete(page);
        forget(page);
      }
    }
  }, { rootMargin: "150% 0px" });
  for (const page of pages) observer.observe(page.el);
}

function fitScale() {
  const available = Math.min(document.documentElement.clientWidth - 32, 1400);
  return clampScale(available / pages[0].width);
}

const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

function layout() {
  for (const page of pages) {
    page.el.style.width = `${Math.floor(page.width * scale)}px`;
    page.el.style.height = `${Math.floor(page.height * scale)}px`;
  }
  for (const page of visible) draw(page);
}

async function draw(page) {
  if (page.drawnScale === scale || page.drawing === scale) return;
  const wanted = scale;
  page.drawing = wanted;

  const pdfPage = await pdf.getPage(page.num);
  const base = pdfPage.getViewport({ scale: 1 });
  if (base.width !== page.width || base.height !== page.height) {
    const anchor = getAnchor();
    page.width = base.width;
    page.height = base.height;
    page.el.style.width = `${Math.floor(page.width * scale)}px`;
    page.el.style.height = `${Math.floor(page.height * scale)}px`;
    restoreAnchor(anchor);
  }

  // Remember where the text is, for auto speed.
  if (!page.text) {
    try {
      const content = await pdfPage.getTextContent();
      page.text = content.items
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
          y: base.convertToViewportPoint(item.transform[4], item.transform[5])[1],
          n: item.str.replace(/\s+/g, " ").trim().length
        }));
    } catch {
      page.text = [];
    }
  }

  if (!visible.has(page) || scale !== wanted) {
    if (page.drawing === wanted) page.drawing = null;
    return;
  }

  // Draw at the screen's real pixel density so text stays sharp.
  const ratio = window.devicePixelRatio || 1;
  const viewport = pdfPage.getViewport({ scale: wanted * ratio });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  try {
    await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  } catch {
    if (page.drawing === wanted) page.drawing = null;
    return;
  }
  if (page.drawing !== wanted) return; // zoom changed while drawing
  page.drawing = null;
  if (!visible.has(page)) {
    canvas.width = 0; // scrolled away while drawing
    return;
  }
  if (scale !== wanted) {
    draw(page);
    return;
  }
  page.canvas?.remove();
  page.canvas = canvas;
  page.drawnScale = wanted;
  page.el.prepend(canvas);
}

function forget(page) {
  if (!page.canvas) return;
  page.canvas.width = 0; // frees the memory right away
  page.canvas.remove();
  page.canvas = null;
  page.drawnScale = 0;
}

// ---------------------------------------------------------------------------
// Auto speed hook: content.js asks how many characters are in a band of
// the screen. Returns characters per pixel, or null if we don't know yet.
// ---------------------------------------------------------------------------

window.__glideDensity = (top, bottom) => {
  let chars = 0;
  for (const page of visible) {
    const r = page.el.getBoundingClientRect();
    if (r.bottom < top || r.top > bottom) continue;
    if (!page.text) return null;
    const s = r.height / page.height;
    for (const item of page.text) {
      const y = r.top + item.y * s;
      if (y >= top && y < bottom) chars += item.n;
    }
  }
  return chars / (bottom - top);
};

// ---------------------------------------------------------------------------
// Keeping your place: page number box, zoom, and resume-where-you-left-off
// ---------------------------------------------------------------------------

function pageAt(y) {
  for (const page of pages) {
    const r = page.el.getBoundingClientRect();
    if (r.bottom + PAGE_GAP >= y) return { page, rect: r };
  }
  return { page: pages[pages.length - 1], rect: pages[pages.length - 1].el.getBoundingClientRect() };
}

function getAnchor() {
  if (!pages.length) return null;
  const { page, rect } = pageAt(TOOLBAR_HEIGHT);
  return { num: page.num, fraction: (TOOLBAR_HEIGHT - rect.top) / rect.height };
}

function restoreAnchor(anchor) {
  if (!anchor) return;
  const page = pages[anchor.num - 1];
  const top = page.el.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + anchor.fraction * page.el.offsetHeight - TOOLBAR_HEIGHT, behavior: "instant" });
}

function setScale(next, fit = false) {
  next = clampScale(next);
  fitToWidth = fit;
  if (Math.abs(next - scale) < 0.001) return;
  const anchor = getAnchor();
  scale = next;
  layout();
  restoreAnchor(anchor);
}

$("zoomIn").addEventListener("click", () => setScale(scale * 1.15));
$("zoomOut").addEventListener("click", () => setScale(scale / 1.15));
$("zoomFit").addEventListener("click", () => setScale(fitScale(), true));

let resizeTimer = null;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (fitToWidth && pages.length) setScale(fitScale(), true);
  }, 150);
});

$("pageInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const num = Math.round(Number($("pageInput").value));
  if (num >= 1 && num <= pages.length) restoreAnchor({ num, fraction: 0 });
  $("pageInput").blur();
});

// Update the page number and save your place as you scroll.
let scrollQueued = false;
let saveTimer = null;
addEventListener("scroll", () => {
  if (!pages.length || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const { page } = pageAt(innerHeight * 0.3);
    if (document.activeElement !== $("pageInput")) $("pageInput").value = page.num;
  });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 800);
}, { passive: true });

async function savePosition() {
  const anchor = getAnchor();
  if (!anchor) return;
  const { readerPositions = {} } = await chrome.storage.local.get("readerPositions");
  readerPositions[fileUrl] = { ...anchor, time: Date.now() };
  // Only remember the 30 most recent PDFs.
  const recent = Object.entries(readerPositions).sort((a, b) => b[1].time - a[1].time).slice(0, 30);
  await chrome.storage.local.set({ readerPositions: Object.fromEntries(recent) });
}

async function restorePosition() {
  const { readerPositions = {} } = await chrome.storage.local.get("readerPositions");
  const saved = readerPositions[fileUrl];
  if (saved && saved.num <= pages.length && (saved.num > 1 || saved.fraction > 0.05)) {
    restoreAnchor(saved);
  }
  $("pageInput").value = pageAt(innerHeight * 0.3).page.num;
}

main();
