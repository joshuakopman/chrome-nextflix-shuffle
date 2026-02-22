(function initTitlePicker() {
  if (window.__netflixShuffleTitleHookInstalled) {
    return;
  }
  window.__netflixShuffleTitleHookInstalled = true;

  const LOG = "[NetflixShuffle:title]";
  let alreadyPickedOnThisPage = false;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function clickElement(element, label) {
    if (!element) {
      log("clickElement missing target", label);
      return false;
    }

    const target = element.closest("a,button,[role='button']") || element.querySelector("a,button,[role='button']") || element;
    if (!target) {
      log("clickElement resolved no clickable target", label);
      return false;
    }

    const beforeHref = window.location.href;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    // Some Netflix controls are keyboard-driven buttons on div containers.
    if (!beforeHref.includes("/watch/") && target.getAttribute("role") === "button") {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    }

    log("clicked", label, {
      tag: target.tagName,
      role: target.getAttribute("role"),
      dataUia: target.getAttribute("data-uia"),
      aria: target.getAttribute("aria-label"),
      text: (target.textContent || "").trim().slice(0, 80),
      hrefChangedImmediately: beforeHref !== window.location.href
    });
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
        log("season picker found", selector);
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

    const all = buckets.flat();
    const filtered = all.filter((node) => /season\s+\d+/i.test((node.textContent || "").trim()));
    log("season options", { totalRaw: all.length, filtered: filtered.length });
    return filtered;
  }

  function isWatchLink(node) {
    const href = node.getAttribute("href") || "";
    return /^\/watch\/\d+/i.test(href);
  }

  function findEpisodeCandidates() {
    const episodeRoots = [
      document.querySelector('[data-uia="episode-selector"] .episodeSelector-container'),
      document.querySelector('[data-uia="episode-selector"]'),
      document.querySelector('.episodeSelector-container'),
      document.querySelector('.episodeSelector')
    ].filter(Boolean);

    if (episodeRoots.length === 0) {
      log("episode root not found");
      return [];
    }

    const root = episodeRoots[0];

    // Primary path from your DOM: episode cards are div role=button elements.
    const cardButtons = [
      ...root.querySelectorAll('div[data-uia="titleCard--container"][role="button"]'),
      ...root.querySelectorAll('div.titleCardList--container.episode-item[role="button"]'),
      ...root.querySelectorAll('.episode-item[role="button"]')
    ].filter((node) => (node.getAttribute("aria-label") || node.textContent || "").trim().length > 0);

    if (cardButtons.length > 0) {
      log("episode card candidates found", {
        count: cardButtons.length,
        sample: (cardButtons[0].getAttribute("aria-label") || cardButtons[0].textContent || "").trim().slice(0, 100)
      });
      return cardButtons;
    }

    const specificSelectors = [
      'a[data-uia*="episode"][href^="/watch/"]',
      '.episode-item a[href^="/watch/"]',
      '.episodeLockup a[href^="/watch/"]',
      '.episode-row a[href^="/watch/"]',
      'a[href^="/watch/"]'
    ];

    for (const selector of specificSelectors) {
      const nodes = [...root.querySelectorAll(selector)]
        .filter((node) => isWatchLink(node))
        .filter((node) => (node.textContent || "").trim().length > 0);

      if (nodes.length > 0) {
        log("episode link candidates found", {
          selector,
          count: nodes.length,
          sample: (nodes[0].textContent || "").trim().slice(0, 100)
        });
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
      log("runPicker skipped: already ran on this page");
      return;
    }

    alreadyPickedOnThisPage = true;
    log("runPicker start", { url: window.location.href, title: document.title });

    waitForSeasonPicker(
      (seasonPicker) => {
        clickElement(seasonPicker, "season-picker");

        setTimeout(() => {
          const seasons = findSeasonOptions();
          const seasonChoice = randomItem(seasons);
          if (seasonChoice) {
            clickElement(seasonChoice, "season-choice");
          } else {
            log("no season options found after opening dropdown");
          }

          let attempts = 0;
          const retry = setInterval(() => {
            attempts += 1;
            const episodes = findEpisodeCandidates();

            if (episodes.length > 0) {
              clearInterval(retry);
              const choice = randomItem(episodes);
              if (choice) {
                clickElement(choice, "episode-choice");
                log("episode clicked", {
                  attempts,
                  totalCandidates: episodes.length,
                  choiceText: (choice.getAttribute("aria-label") || choice.textContent || "").trim().slice(0, 120)
                });
              }
              return;
            }

            log("episode attempt", { attempts, status: "none yet" });

            if (attempts >= 16) {
              clearInterval(retry);
              alreadyPickedOnThisPage = false;
              log("episode candidates not found; picker reset for retry");
            }
          }, 500);
        }, 700);
      },
      () => {
        alreadyPickedOnThisPage = false;
        log("runPicker timeout: no season picker after wait window");
      }
    );
  }

  function maybeRun(trigger) {
    log("maybeRun", { trigger, href: window.location.href });

    chrome.storage.local.get({ shuffleEnabled: false }, ({ shuffleEnabled }) => {
      log("storage read", { shuffleEnabled });

      if (!shuffleEnabled) {
        log("not enabled; exit");
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: "rememberTitleUrl", url: window.location.href });
      } catch (error) {
        log("rememberTitleUrl send failed", String(error));
      }

      runPicker();
    });
  }

  log("title script init", { href: window.location.href, readyState: document.readyState });
  maybeRun("init");

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.shuffleEnabled) {
      return;
    }

    log("storage.onChanged", { shuffleEnabled: changes.shuffleEnabled.newValue });
    if (changes.shuffleEnabled.newValue === true) {
      maybeRun("enabled-change");
    }
  });
})();
