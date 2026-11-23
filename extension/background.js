// Background service worker: handles the keyboard shortcuts and keeps the
// toolbar badge in sync. Chrome starts it when needed and stops it when idle.

importScripts("shared.js");

// Put the page script into a tab (does nothing if it is already there).
// Returns false on pages Chrome protects, like chrome:// or the Web Store.
async function injectInto(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["shared.js", "content.js"] });
    return true;
  } catch {
    return false;
  }
}

const COMMAND_MESSAGES = {
  "toggle-scroll": "toggle",
  "speed-up": "faster",
  "slow-down": "slower"
};

chrome.commands.onCommand.addListener(async (command, tab) => {
  const type = COMMAND_MESSAGES[command];
  if (!type || !tab?.id) return;
  if (!(await injectInto(tab.id))) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    // Page was closed or navigated away; nothing to do.
  }
});

// The page script reports start/stop so we can show "ON" on the icon.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "state" || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: message.state.running ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#5b6cff" });
});

// Save the defaults the first time the extension is installed.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await chrome.storage.local.set(await GLIDE.loadSettings());
  }
});
