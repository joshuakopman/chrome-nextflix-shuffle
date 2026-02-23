(function initWatchInterception() {
  if (window.__netflixShuffleWatchHookInstalled) {
    return;
  }
  window.__netflixShuffleWatchHookInstalled = true;

  let shuffleEnabled = false;
  let cachedTitleUrl = "";
  let lastAutoRedirectAt = 0;

  function extensionAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (error) {
      return false;
    }
  }

  function isWatchRoute() {
    return window.location.pathname.includes("/watch/");
  }

  function deriveTitleFromWatchUrl() {
    const match = window.location.pathname.match(/^\/watch\/(\d+)/);
    return match ? `https://www.netflix.com/title/${match[1]}` : "";
  }

  function rememberTitleCandidate(url) {
    if (!url || !url.includes("/title/")) {
      return;
    }

    cachedTitleUrl = url;
    localStorage.setItem("netflixShuffleTitleUrl", url);

    if (extensionAlive()) {
      try {
        chrome.runtime.sendMessage({ type: "rememberTitleUrl", url });
      } catch (error) {
        // no-op
      }
    }
  }

  function primeTitleCandidates() {
    if (!isWatchRoute()) {
      return;
    }

    const referrer = document.referrer || "";
    if (referrer.includes("/title/")) {
      rememberTitleCandidate(referrer);
      return;
    }

    const derived = deriveTitleFromWatchUrl();
    if (derived) {
      rememberTitleCandidate(derived);
    }
  }

  function getTitleUrl() {
    const local = localStorage.getItem("netflixShuffleTitleUrl") || "";
    if (local) {
      return local;
    }

    if (cachedTitleUrl) {
      return cachedTitleUrl;
    }

    const derived = deriveTitleFromWatchUrl();
    if (derived) {
      rememberTitleCandidate(derived);
      return derived;
    }

    return "";
  }

  function syncEnabledState() {
    if (!extensionAlive()) {
      return;
    }

    chrome.storage.local.get({ shuffleEnabled: false, lastTitleUrl: "" }, ({ shuffleEnabled: enabled, lastTitleUrl }) => {
      shuffleEnabled = Boolean(enabled);
      cachedTitleUrl = lastTitleUrl || cachedTitleUrl;
    });
  }

  function isNextEpisodeButton(button) {
    if (!button) {
      return false;
    }

    const dataUia = button.getAttribute("data-uia") || "";
    const aria = button.getAttribute("aria-label") || "";
    const text = button.textContent || "";

    return (
      dataUia === "control-next" ||
      dataUia === "next-episode-seamless-button" ||
      dataUia === "next-episode-seamless-button-draining" ||
      /next episode/i.test(aria) ||
      /next episode/i.test(text) ||
      button.classList.contains("button-nfplayerNextEpisode")
    );
  }

  function redirectToTitle() {
    const titleUrl = getTitleUrl();
    if (!titleUrl) {
      return;
    }

    window.location.href = titleUrl;
  }

  function handleNextInteraction(event) {
    if (!shuffleEnabled || !isWatchRoute()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    redirectToTitle();
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest("button");
      if (!isNextEpisodeButton(button)) {
        return;
      }
      handleNextInteraction(event);
    },
    true
  );

  function maybeHandleSeamlessNext() {
    if (!shuffleEnabled || !isWatchRoute()) {
      return;
    }

    const now = Date.now();
    if (now - lastAutoRedirectAt < 2000) {
      return;
    }

    const seamlessButton =
      document.querySelector('button[data-uia="next-episode-seamless-button"]') ||
      document.querySelector('button[data-uia="next-episode-seamless-button-draining"]');

    if (!seamlessButton) {
      return;
    }

    lastAutoRedirectAt = now;
    redirectToTitle();
  }

  const observer = new MutationObserver(() => {
    if (isWatchRoute()) {
      primeTitleCandidates();
      maybeHandleSeamlessNext();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (extensionAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }

      if (changes.shuffleEnabled) {
        shuffleEnabled = Boolean(changes.shuffleEnabled.newValue);
      }

      if (changes.lastTitleUrl) {
        cachedTitleUrl = changes.lastTitleUrl.newValue || cachedTitleUrl;
      }
    });

    chrome.runtime.sendMessage({ type: "getTitleUrl" }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      cachedTitleUrl = response?.titleUrl || cachedTitleUrl;
    });
  }

  primeTitleCandidates();
  syncEnabledState();
  maybeHandleSeamlessNext();
})();
