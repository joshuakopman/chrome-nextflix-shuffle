let disableRandom = true;
const LOG = "[NetflixShuffle]";

function log(...args) {
  console.log(LOG, ...args);
}

function applyEnabledState(enabled) {
  disableRandom = !enabled;
  chrome.action.setBadgeText({ text: enabled ? "On" : "Off" });
  log("enabled state", enabled);
}

function deriveTitleFromWatchUrl(url) {
  const match = (url || "").match(/^https:\/\/www\.netflix\.com\/watch\/(\d+)/);
  return match ? `https://www.netflix.com/title/${match[1]}` : "";
}

function rememberTitleUrl(url) {
  if (!url) {
    return;
  }

  const titleUrl = url.includes("/title/") ? url : deriveTitleFromWatchUrl(url);
  if (!titleUrl) {
    return;
  }

  chrome.storage.local.set({ lastTitleUrl: titleUrl });
  log("remember title", titleUrl);
}

chrome.storage.local.get({ shuffleEnabled: false }, ({ shuffleEnabled }) => {
  applyEnabledState(shuffleEnabled);
});

chrome.action.onClicked.addListener(async () => {
  const nextEnabled = disableRandom;
  applyEnabledState(nextEnabled);
  chrome.storage.local.set({ shuffleEnabled: nextEnabled });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    rememberTitleUrl(tab.url);
  }

  log("action clicked", { nextEnabled });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "rememberTitleUrl" && request.url) {
    rememberTitleUrl(request.url);
  }

  if (request.type === "getTitleUrl") {
    chrome.storage.local.get({ lastTitleUrl: "" }, ({ lastTitleUrl }) => {
      sendResponse({ titleUrl: lastTitleUrl || "" });
    });
    return true;
  }

  return false;
});
