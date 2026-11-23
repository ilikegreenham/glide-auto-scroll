// Background service worker: handles the keyboard shortcuts and keeps the
// toolbar badge in sync. Chrome starts it when needed and stops it when idle.

importScripts("shared.js");

const COMMAND_MESSAGES = {
  "toggle-scroll": "toggle",
  "speed-up": "faster",
  "slow-down": "slower"
};

chrome.commands.onCommand.addListener(async (command, tab) => {
  const type = COMMAND_MESSAGES[command];
  if (!type || !tab?.id) return;

  if (await GLIDE.prepareTab(tab)) {
    await GLIDE.sendToTab(tab, type);
  } else if (type === "toggle" && GLIDE.couldBePdf(tab.url)) {
    // Probably Chrome's PDF viewer, which extensions can't touch.
    // Reopen the PDF in Glide's own reader instead.
    chrome.tabs.update(tab.id, { url: GLIDE.readerUrl(tab.url) });
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
