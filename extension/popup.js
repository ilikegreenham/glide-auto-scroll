// The popup you see when clicking the toolbar icon.

const $ = (id) => document.getElementById(id);
let tab = null;
let pageReady = false;

// The slider is logarithmic, so slow speeds get as much room as fast ones.
const RATIO = GLIDE.MAX_SPEED / GLIDE.MIN_SPEED;
const sliderToSpeed = (v) => GLIDE.clampSpeed(GLIDE.MIN_SPEED * RATIO ** (v / 1000));
const speedToSlider = (s) => Math.round((Math.log(s / GLIDE.MIN_SPEED) / Math.log(RATIO)) * 1000);

function showSpeed(speed) {
  $("speedValue").textContent = speed;
  if (document.activeElement !== $("speed")) $("speed").value = speedToSlider(speed);
  for (const b of document.querySelectorAll(".presets button")) {
    b.classList.toggle("active", Number(b.dataset.speed) === speed);
  }
}

function showUnit(state) {
  const auto = $("autoSpeed").checked;
  if (auto && state?.running && state.currentSpeed) {
    $("unit").textContent = `px / sec average · now ${state.currentSpeed}`;
  } else {
    $("unit").textContent = auto ? "px / sec average (auto)" : "pixels / sec";
  }
}

function showRunning(running, reachedEnd) {
  $("toggle").classList.toggle("running", running);
  $("toggle").setAttribute("aria-label", running ? "Pause scrolling" : "Start scrolling");
  $("status").classList.toggle("on", running);
  $("status").textContent = running ? "Scrolling" : reachedEnd ? "Reached the end" : "Paused";
}

let lastState = null;
function showState(state) {
  if (!state) return;
  lastState = state;
  showRunning(state.running, state.reachedEnd);
  showSpeed(state.speed);
  showUnit(state);
}

const send = (type) => (pageReady ? GLIDE.sendToTab(tab, type) : Promise.resolve(null));

function saveSpeed(speed) {
  showSpeed(speed);
  chrome.storage.local.set({ speed });
}

async function init() {
  const settings = await GLIDE.loadSettings();
  showSpeed(settings.speed);
  $("showControls").checked = settings.showControls;
  $("stopAtEnd").checked = settings.stopAtEnd;
  $("autoSpeed").checked = settings.autoSpeed;
  showUnit(null);

  // Put the scrolling script into the current tab (opening the popup gives
  // the extension temporary permission to do this).
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageReady = Boolean(tab) && (await GLIDE.prepareTab(tab));

  if (pageReady) {
    showState(await send("getState"));
  } else {
    $("controls").hidden = true;
    $("status").textContent = "Unavailable";
    if (GLIDE.couldBePdf(tab?.url)) $("pdfOffer").hidden = false;
    else $("unsupported").hidden = false;
  }

  showShortcuts();
}

async function showShortcuts() {
  const labels = {
    "toggle-scroll": "Start / pause",
    "speed-up": "Faster",
    "slow-down": "Slower"
  };
  const order = Object.keys(labels);
  const commands = (await chrome.commands.getAll())
    .filter((c) => labels[c.name])
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const prettyKey = (k) =>
    k.replace(/\s*Arrow$/, "").replace(/^Up$/, "↑").replace(/^Down$/, "↓");

  const list = $("shortcuts");
  for (const command of commands) {
    const dt = document.createElement("dt");
    if (command.shortcut) {
      dt.innerHTML = command.shortcut
        .split("+")
        .map((k) => `<kbd>${prettyKey(k.trim())}</kbd>`)
        .join(" ");
    } else {
      dt.textContent = "Not set";
    }
    const dd = document.createElement("dd");
    dd.textContent = labels[command.name];
    list.append(dt, dd);
  }
  const dt = document.createElement("dt");
  dt.innerHTML = "<kbd>Esc</kbd>";
  const dd = document.createElement("dd");
  dd.textContent = "Pause (on the page)";
  list.append(dt, dd);
}

// ----- Wire up the buttons -----

$("toggle").addEventListener("click", async () => showState(await send("toggle")));

$("speed").addEventListener("input", (e) => saveSpeed(sliderToSpeed(Number(e.target.value))));

$("faster").addEventListener("click", async () => {
  const state = await send("faster");
  if (state) showState(state);
  else saveSpeed(GLIDE.clampSpeed(Number($("speedValue").textContent) * GLIDE.SPEED_STEP));
});

$("slower").addEventListener("click", async () => {
  const state = await send("slower");
  if (state) showState(state);
  else saveSpeed(GLIDE.clampSpeed(Number($("speedValue").textContent) / GLIDE.SPEED_STEP));
});

for (const button of document.querySelectorAll(".presets button")) {
  button.addEventListener("click", () => saveSpeed(Number(button.dataset.speed)));
}

$("showControls").addEventListener("change", (e) => chrome.storage.local.set({ showControls: e.target.checked }));
$("stopAtEnd").addEventListener("change", (e) => chrome.storage.local.set({ stopAtEnd: e.target.checked }));
$("autoSpeed").addEventListener("change", (e) => {
  chrome.storage.local.set({ autoSpeed: e.target.checked });
  showUnit(lastState);
});

$("openReader").addEventListener("click", async () => {
  await chrome.tabs.update(tab.id, { url: GLIDE.readerUrl(tab.url) });
  window.close();
});

$("editShortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

// Keep the popup in sync when you use the floating control or a shortcut.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "state" && sender.tab?.id === tab?.id) showState(message.state);
});

// While auto speed is on, refresh the live speed now and then.
setInterval(async () => {
  if (pageReady && $("autoSpeed").checked && lastState?.running) showState(await send("getState"));
}, 1000);

init();
