(function initTitlePicker() {
  if (window.__netflixShuffleTitleHookInstalled) {
    return;
  }
  window.__netflixShuffleTitleHookInstalled = true;

  let alreadyPickedOnThisPage = false;

  function clickElement(element) {
    if (!element) {
      return false;
    }

    const target = element.closest("a,button,[role='button']") || element.querySelector("a,button,[role='button']") || element;
    if (!target) {
      return false;
    }

    const beforeHref = window.location.href;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    if (!beforeHref.includes("/watch/") && target.getAttribute("role") === "button") {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    }

    return true;
  }

  function randomItem(items) {
    return items.length > 0 ? items[Math.floor(Math.random() * items.length)] : null;
  }

  function findSeasonPicker() {
    const selectors = [
      'button[data-uia="selector-seasons"]',
      'button[data-uia="dropdown-toggle"]',
      'button[aria-label="dropdown-menu-trigger-button"]',
      'button[aria-haspopup="true"][data-uia="dropdown-toggle"]',
      '[data-uia="episode-selector"] button[data-uia="dropdown-toggle"]',
      '.episodeSelector-dropdown button',
      '.episodeSelector button[aria-haspopup="true"]',
      '.episodeSelector button'
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        return node;
      }
    }

    return null;
  }

  function findSeasonOptions() {
    const buckets = [
      [...document.querySelectorAll('li[role="menuitemradio"]')],
      [...document.querySelectorAll('li[role="menuitem"]')],
      [...document.querySelectorAll('[data-uia*="season"] li')],
      [...document.querySelectorAll('.dropdown-menu li')],
      [...document.querySelectorAll('[data-uia="dropdown-menu"] li')],
      [...document.querySelectorAll('[data-uia="dropdown-menu-item"]')]
    ];

    return buckets.flat().filter((node) => /season\s+\d+/i.test((node.textContent || "").trim()));
  }

  function findEpisodeCandidates() {
    const episodeRoots = [
      document.querySelector('[data-uia="episode-selector"] .episodeSelector-container'),
      document.querySelector('[data-uia="episode-selector"]'),
      document.querySelector('.episodeSelector-container'),
      document.querySelector('.episodeSelector')
    ].filter(Boolean);

    if (episodeRoots.length === 0) {
      return [];
    }

    const root = episodeRoots[0];

    const cardButtons = [
      ...root.querySelectorAll('div[data-uia="titleCard--container"][role="button"]'),
      ...root.querySelectorAll('div.titleCardList--container.episode-item[role="button"]'),
      ...root.querySelectorAll('.episode-item[role="button"]')
    ].filter((node) => (node.getAttribute("aria-label") || node.textContent || "").trim().length > 0);

    if (cardButtons.length > 0) {
      return cardButtons;
    }

    const linkSelectors = [
      'a[data-uia*="episode"][href^="/watch/"]',
      '.episode-item a[href^="/watch/"]',
      '.episodeLockup a[href^="/watch/"]',
      '.episode-row a[href^="/watch/"]',
      'a[href^="/watch/"]'
    ];

    for (const selector of linkSelectors) {
      const nodes = [...root.querySelectorAll(selector)].filter((node) => (node.textContent || "").trim().length > 0);
      if (nodes.length > 0) {
        return nodes;
      }
    }

    return [];
  }

  function waitForSeasonPicker(onFound, onTimeout) {
    let attempts = 0;
    const maxAttempts = 30;

    const tick = setInterval(() => {
      attempts += 1;
      const picker = findSeasonPicker();
      if (picker) {
        clearInterval(tick);
        onFound(picker);
        return;
      }

      if (attempts % 6 === 0) {
        window.scrollBy({ top: 250, behavior: "auto" });
      }

      if (attempts >= maxAttempts) {
        clearInterval(tick);
        onTimeout();
      }
    }, 400);
  }

  function runPicker() {
    if (alreadyPickedOnThisPage) {
      return;
    }

    alreadyPickedOnThisPage = true;

    waitForSeasonPicker(
      (seasonPicker) => {
        clickElement(seasonPicker);

        setTimeout(() => {
          const seasons = findSeasonOptions();
          const seasonChoice = randomItem(seasons);
          if (seasonChoice) {
            clickElement(seasonChoice);
          }

          let attempts = 0;
          const retry = setInterval(() => {
            attempts += 1;
            const episodes = findEpisodeCandidates();

            if (episodes.length > 0) {
              clearInterval(retry);
              const choice = randomItem(episodes);
              if (choice) {
                clickElement(choice);
              }
              return;
            }

            if (attempts >= 16) {
              clearInterval(retry);
              alreadyPickedOnThisPage = false;
            }
          }, 500);
        }, 700);
      },
      () => {
        alreadyPickedOnThisPage = false;
      }
    );
  }

  function maybeRun() {
    chrome.storage.local.get({ shuffleEnabled: false }, ({ shuffleEnabled }) => {
      if (!shuffleEnabled) {
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: "rememberTitleUrl", url: window.location.href });
      } catch (error) {
        // no-op
      }

      runPicker();
    });
  }

  maybeRun();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.shuffleEnabled) {
      return;
    }

    if (changes.shuffleEnabled.newValue === true) {
      maybeRun();
    }
  });
})();
