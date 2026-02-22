(function initWatchInterception() {
  if (window.__netflixShuffleWatchHookInstalled) {
    return;
  }
  window.__netflixShuffleWatchHookInstalled = true;

  const LOG = "[NetflixShuffle:watch]";
  let shuffleEnabled = false;
  let cachedTitleUrl = "";
  let lastHref = window.location.href;

  function extensionAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (error) {
      return false;
    }
  }

  function log(...args) {
    console.log(LOG, ...args);
  }

  function isWatchRoute() {
    return window.location.pathname.includes("/watch/");
  }

  function deriveTitleFromWatchUrl() {
    const match = window.location.pathname.match(/^\/watch\/(\d+)/);
    if (!match) {
      return "";
    }
    return `https://www.netflix.com/title/${match[1]}`;
  }

  function primeTitleCandidates() {
    if (!isWatchRoute()) {
      return;
    }

    const referrer = document.referrer || "";
    if (referrer.includes("/title/")) {
      cachedTitleUrl = referrer;
      localStorage.setItem("netflixShuffleTitleUrl", referrer);
      log("primed title from referrer", referrer);
      return;
    }

    const derived = deriveTitleFromWatchUrl();
    if (derived) {
      cachedTitleUrl = derived;
      localStorage.setItem("netflixShuffleTitleUrl", derived);
      log("primed title from watch id", derived);
    }
  }

  function readTitleUrlLocal() {
    return localStorage.getItem("netflixShuffleTitleUrl") || "";
  }

  function getTitleUrl() {
    const candidate = readTitleUrlLocal() || cachedTitleUrl || "";
    if (candidate) {
      return candidate;
    }

    const derived = deriveTitleFromWatchUrl();
    if (derived) {
      localStorage.setItem("netflixShuffleTitleUrl", derived);
      cachedTitleUrl = derived;
      return derived;
    }

    return "";
  }

  function syncEnabledState() {
    if (!extensionAlive()) {
      return;
    }

    try {
      chrome.storage.local.get({ shuffleEnabled: false, lastTitleUrl: "" }, ({ shuffleEnabled: enabled, lastTitleUrl }) => {
        if (!extensionAlive()) {
          return;
        }

        shuffleEnabled = Boolean(enabled);
        cachedTitleUrl = lastTitleUrl || cachedTitleUrl;
        log("watch enabled state", shuffleEnabled);
      });
    } catch (error) {
      log("storage get skipped", String(error));
    }
  }

  function isNextEpisodeButton(button) {
    if (!button) {
      return false;
    }

    const dataUia = button.getAttribute("data-uia") || "";
    const aria = button.getAttribute("aria-label") || "";
    const text = button.textContent || "";

    if (
      dataUia === "control-next" ||
      dataUia === "next-episode-seamless-button" ||
      dataUia === "next-episode-seamless-button-draining"
    ) {
      return true;
    }

    if (/next episode/i.test(aria) || /next episode/i.test(text)) {
      return true;
    }

    return button.classList.contains("button-nfplayerNextEpisode");
  }

  function isNextEpisodeControl(element) {
    const button = element?.closest("button");
    return isNextEpisodeButton(button);
  }

  function redirectToTitle(reason) {
    const titleUrl = getTitleUrl();
    log("redirect requested", { reason, titleUrl, current: window.location.href, enabled: shuffleEnabled });

    if (!titleUrl) {
      log("no stored title URL; skip redirect");
      return;
    }

    if (extensionAlive()) {
      try {
        chrome.runtime.sendMessage({ type: "rememberTitleUrl", url: titleUrl });
      } catch (error) {
        log("rememberTitleUrl send failed", String(error));
      }
    }

    window.location.href = titleUrl;
  }

  function handleNextInteraction(source, event) {
    if (!isWatchRoute()) {
      return;
    }

    log("next interaction", { source, enabled: shuffleEnabled, href: window.location.href });
    if (!shuffleEnabled) {
      return;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      }
    }

    redirectToTitle(source);
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!isNextEpisodeControl(event.target)) {
        return;
      }
      handleNextInteraction("delegated-click", event);
    },
    true
  );

  function bindDirectListeners() {
    if (!isWatchRoute()) {
      return;
    }

    const allButtons = [...document.querySelectorAll("button")];
    const nextButtons = allButtons.filter(isNextEpisodeButton);

    nextButtons.forEach((button) => {
      if (button.dataset.netflixShuffleBound === "true") {
        return;
      }

      button.dataset.netflixShuffleBound = "true";
      button.addEventListener(
        "click",
        (event) => {
          handleNextInteraction("direct-button", event);
        },
        true
      );
    });

    if (nextButtons.length > 0) {
      log("bound next buttons", nextButtons.length);
    }
  }

  const periodicBinder = setInterval(bindDirectListeners, 1000);
  setTimeout(() => clearInterval(periodicBinder), 1000 * 60 * 30);

  const observer = new MutationObserver(() => {
    bindDirectListeners();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 1000 * 60 * 30);

  const seamlessPoll = setInterval(() => {
    if (!shuffleEnabled || !isWatchRoute()) {
      return;
    }

    const seamlessNextButton =
      document.querySelector('button[data-uia="next-episode-seamless-button"]') ||
      document.querySelector('button[data-uia="next-episode-seamless-button-draining"]');

    if (seamlessNextButton) {
      clearInterval(seamlessPoll);
      redirectToTitle("seamless-next-visible");
    }
  }, 1000);
  setTimeout(() => clearInterval(seamlessPoll), 1000 * 60 * 20);

  const routePoll = setInterval(() => {
    if (window.location.href === lastHref) {
      return;
    }

    const previous = lastHref;
    lastHref = window.location.href;
    log("route changed", { previous, current: lastHref });

    if (isWatchRoute()) {
      primeTitleCandidates();
      syncEnabledState();
      bindDirectListeners();
    }
  }, 300);
  setTimeout(() => clearInterval(routePoll), 1000 * 60 * 30);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!extensionAlive() || area !== "local") {
        return;
      }

      if (changes.shuffleEnabled) {
        shuffleEnabled = Boolean(changes.shuffleEnabled.newValue);
        log("watch enabled changed", shuffleEnabled);
      }

      if (changes.lastTitleUrl) {
        cachedTitleUrl = changes.lastTitleUrl.newValue || cachedTitleUrl;
        log("watch title updated", cachedTitleUrl);
      }
    });
  } catch (error) {
    log("onChanged listener skipped", String(error));
  }

  primeTitleCandidates();
  syncEnabledState();
  bindDirectListeners();

  if (extensionAlive()) {
    try {
      chrome.runtime.sendMessage({ type: "getTitleUrl" }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        cachedTitleUrl = response?.titleUrl || cachedTitleUrl;
      });
    } catch (error) {
      // no-op
    }
  }

  log("watch interception initialized", { href: window.location.href, path: window.location.pathname });
})();
