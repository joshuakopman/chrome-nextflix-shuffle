let shuffleEnabled = false;

function applyEnabledState(enabled) {
  shuffleEnabled = enabled;
  chrome.action.setBadgeText({ text: enabled ? "On" : "Off" });
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
}

chrome.storage.local.get({ shuffleEnabled: false }, ({ shuffleEnabled: enabled }) => {
  applyEnabledState(Boolean(enabled));
});

chrome.action.onClicked.addListener(() => {
  const nextEnabled = !shuffleEnabled;
  applyEnabledState(nextEnabled);
  chrome.storage.local.set({ shuffleEnabled: nextEnabled });
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
