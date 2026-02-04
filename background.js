/* global chrome */

const DEFAULTS = {
  seen: [],
  preventDuplicates: true,
  autoReadEnabled: true,
  autoReadSelector: "#js__gameplay-page .table__cards",
  autoReadMap: {},
  deckIndexSamples: {},
  deckIndexConfig: null,
  deckAssetOrigin: "",
  deckAssetBasePath: "",
  deckAssetExt: "png",
  cardImageById: {},
  trumpSuit: "",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS), (items) => {
    const toSet = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!Object.prototype.hasOwnProperty.call(items, key)) {
        toSet[key] = value;
      }
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
  });
});

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab && typeof tab.id === "number" ? tab.id : null;
  if (tabId == null) return;
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== "function") return;

  const open = () => {
    chrome.sidePanel.open({ tabId }, () => {
      // Ignore runtime errors (e.g. unsupported Chrome version).
    });
  };

  if (typeof chrome.sidePanel.setOptions === "function") {
    chrome.sidePanel.setOptions({ tabId, path: "popup.html", enabled: true }, () => open());
  } else {
    open();
  }
});

function isValidCardId(id) {
  return typeof id === "string" && /^(S|H|D|C)(7|8|9|10|J|Q|K|A)$/.test(id);
}

function uniqueCount(ids) {
  return new Set(ids.filter(isValidCardId)).size;
}

let lastAutoReadTabId = null;

function requestContentSessionReset(tabId) {
  if (tabId == null) return;
  if (!chrome.tabs || typeof chrome.tabs.sendMessage !== "function") return;
  chrome.tabs.sendMessage(tabId, { type: "belot_auto_tracker/reset_session", pauseUntilNoCards: true }, () => {
    // Ignore "no receiver" errors if the content script isn't running.
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "belot_auto_tracker/round_end") {
    if (sender && sender.tab && typeof sender.tab.id === "number") {
      lastAutoReadTabId = sender.tab.id;
    }
    chrome.storage.local.set({ seen: [], trumpSuit: "" });
    requestContentSessionReset(lastAutoReadTabId);
    return;
  }

  if (message && message.type === "belot_auto_tracker/session_end") {
    if (sender && sender.tab && typeof sender.tab.id === "number") {
      lastAutoReadTabId = sender.tab.id;
    }
    chrome.storage.local.set({ seen: [], trumpSuit: "" });
    requestContentSessionReset(lastAutoReadTabId);
    return;
  }

  if (!message || message.type !== "belot_auto_tracker/cards") return;
  if (sender && sender.tab && typeof sender.tab.id === "number") {
    lastAutoReadTabId = sender.tab.id;
  }

  const cards = Array.isArray(message.cards) ? message.cards.map(String).filter(isValidCardId) : [];
  if (cards.length === 0) return;

  chrome.storage.local.get({ seen: [], preventDuplicates: true }, (items) => {
    const existing = Array.isArray(items.seen) ? items.seen.map(String).filter(isValidCardId) : [];
    const preventDuplicates = true;

    let updated;
    if (preventDuplicates) {
      const set = new Set(existing);
      updated = [...existing];
      for (const id of cards) {
        if (set.has(id)) continue;
        set.add(id);
        updated.push(id);
      }
    } else {
      updated = [...existing, ...cards];
    }

      if (updated.length !== existing.length) {
        if (uniqueCount(updated) >= 32) {
        chrome.storage.local.set({ seen: [], trumpSuit: "" });
        requestContentSessionReset(lastAutoReadTabId);
      } else {
        chrome.storage.local.set({ seen: updated });
      }
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.seen) return;
  const next = Array.isArray(changes.seen.newValue) ? changes.seen.newValue.map(String).filter(isValidCardId) : [];
  if (next.length === 0) return;
  if (uniqueCount(next) < 32) return;

  chrome.storage.local.set({ seen: [], trumpSuit: "" });
  requestContentSessionReset(lastAutoReadTabId);
});
