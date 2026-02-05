/* global chrome */

const FIXED_AUTO_READ_SELECTOR = "#js__gameplay-page .table__cards";
const CONTENT_SCRIPT_VERSION = `${chrome?.runtime?.getManifest?.().version ?? "0"}:${Date.now()}`;

const STORAGE_DEFAULTS = {
  seen: [],
  preventDuplicates: true,
  autoReadEnabled: true,
  autoReadSelector: FIXED_AUTO_READ_SELECTOR,
  autoReadMap: {},
  deckIndexSamples: {},
  deckIndexConfig: null,
  deckAssetOrigin: "",
  deckAssetBasePath: "",
  deckAssetExt: "png",
  cardImageById: {},
  trumpSuit: "",
};

const SUITS = [
  { key: "S", symbol: "♠", name: "Pică", aliases: ["pica", "pici", "spade", "spades"], order: 0 },
  { key: "H", symbol: "♥", name: "Inimă", aliases: ["inima", "inimi", "heart", "hearts"], order: 1 },
  { key: "D", symbol: "♦", name: "Caro", aliases: ["caro", "diamond", "diamonds"], order: 2 },
  { key: "C", symbol: "♣", name: "Treflă", aliases: ["trefla", "trefle", "club", "clubs"], order: 3 },
];

const RANKS = [
  { key: "7", label: "7", order: 0 },
  { key: "8", label: "8", order: 1 },
  { key: "9", label: "9", order: 2 },
  { key: "10", label: "10", order: 3 },
  { key: "J", label: "J", order: 4 },
  { key: "Q", label: "Q", order: 5 },
  { key: "K", label: "K", order: 6 },
  { key: "A", label: "A", order: 7 },
];

function buildDeck() {
  /** @type {Array<{id: string, suitKey: string, suitSymbol: string, suitName: string, suitAliases: string[], suitOrder: number, rankKey: string, rankLabel: string, rankOrder: number, label: string}>} */
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${suit.key}${rank.key}`;
      deck.push({
        id,
        suitKey: suit.key,
        suitSymbol: suit.symbol,
        suitName: suit.name,
        suitAliases: suit.aliases,
        suitOrder: suit.order,
        rankKey: rank.key,
        rankLabel: rank.label,
        rankOrder: rank.order,
        label: `${suit.symbol}${rank.label}`,
      });
    }
  }
  return deck;
}

const DECK = buildDeck();
const CARD_BY_ID = new Map(DECK.map((c) => [c.id, c]));
const DECK_ROWS = RANKS.length;
const DECK_COLS = SUITS.length;
const DEFAULT_CARD_RATIO = 5 / 7;
const SEEN_DISAPPEAR_MS = 1000;
const REFLOW_MS = 1100;
const REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const APPEAR_MS = 1350;
const APPEAR_STAGGER_MS = 70;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function compareCardIds(aId, bId) {
  const a = CARD_BY_ID.get(aId);
  const b = CARD_BY_ID.get(bId);
  if (!a && !b) return aId.localeCompare(bId);
  if (!a) return 1;
  if (!b) return -1;
  if (a.suitOrder !== b.suitOrder) return a.suitOrder - b.suitOrder;
  if (a.rankOrder !== b.rankOrder) return a.rankOrder - b.rankOrder;
  return a.id.localeCompare(b.id);
}

function countOccurrences(ids) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const id of ids) {
    if (!CARD_BY_ID.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function dedupePreserveOrder(ids) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const id of ids) {
    if (!CARD_BY_ID.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.remove("ok", "err");
  if (kind === "ok") el.classList.add("ok");
  if (kind === "err") el.classList.add("err");
}

function normalizeImportedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSON invalid: se așteaptă un obiect.");
  }

  const seen = Array.isArray(data.seen) ? data.seen : Array.isArray(data.Seen) ? data.Seen : null;
  const settings = typeof data.settings === "object" && data.settings ? data.settings : null;

  if (!seen) {
    throw new Error('JSON invalid: se așteaptă un array "seen".');
  }

  const normalizedSeen = seen.map(String).filter((id) => CARD_BY_ID.has(id));
  const preventDuplicates =
    typeof data.preventDuplicates === "boolean"
      ? data.preventDuplicates
      : settings && typeof settings.preventDuplicates === "boolean"
        ? settings.preventDuplicates
        : STORAGE_DEFAULTS.preventDuplicates;

  const autoReadEnabled = true;

  // Selector fix pentru site-ul țintă.
  const autoReadSelectorRaw = FIXED_AUTO_READ_SELECTOR;

  const autoReadMapRaw =
    typeof data.autoReadMap === "object" && data.autoReadMap
      ? data.autoReadMap
      : settings && typeof settings.autoReadMap === "object" && settings.autoReadMap
        ? settings.autoReadMap
        : STORAGE_DEFAULTS.autoReadMap;

  const deckAssetOrigin =
    typeof data.deckAssetOrigin === "string"
      ? data.deckAssetOrigin
      : settings && typeof settings.deckAssetOrigin === "string"
        ? settings.deckAssetOrigin
        : STORAGE_DEFAULTS.deckAssetOrigin;

  const deckAssetBasePath =
    typeof data.deckAssetBasePath === "string"
      ? data.deckAssetBasePath
      : settings && typeof settings.deckAssetBasePath === "string"
        ? settings.deckAssetBasePath
        : STORAGE_DEFAULTS.deckAssetBasePath;

  const deckAssetExt =
    typeof data.deckAssetExt === "string"
      ? data.deckAssetExt
      : settings && typeof settings.deckAssetExt === "string"
        ? settings.deckAssetExt
        : STORAGE_DEFAULTS.deckAssetExt;

  const cardImageByIdRaw =
    typeof data.cardImageById === "object" && data.cardImageById
      ? data.cardImageById
      : settings && typeof settings.cardImageById === "object" && settings.cardImageById
        ? settings.cardImageById
        : STORAGE_DEFAULTS.cardImageById;

  const trumpSuit =
    typeof data.trumpSuit === "string"
      ? data.trumpSuit
      : settings && typeof settings.trumpSuit === "string"
        ? settings.trumpSuit
        : STORAGE_DEFAULTS.trumpSuit;

  /** @type {Record<string, string>} */
  const autoReadMap = {};
  if (autoReadMapRaw && typeof autoReadMapRaw === "object") {
    for (const [token, value] of Object.entries(autoReadMapRaw)) {
      if (typeof token !== "string" || token.trim().length === 0) continue;
      const cardId = String(value);
      if (!CARD_BY_ID.has(cardId)) continue;
      autoReadMap[token] = cardId;
    }
  }

  const deckIndexSamplesRaw =
    typeof data.deckIndexSamples === "object" && data.deckIndexSamples
      ? data.deckIndexSamples
      : settings && typeof settings.deckIndexSamples === "object" && settings.deckIndexSamples
        ? settings.deckIndexSamples
        : STORAGE_DEFAULTS.deckIndexSamples;

  /** @type {Record<string, string>} */
  const deckIndexSamples = {};
  if (deckIndexSamplesRaw && typeof deckIndexSamplesRaw === "object") {
    for (const [k, v] of Object.entries(deckIndexSamplesRaw)) {
      const num = Number.parseInt(String(k), 10);
      const cardId = String(v);
      if (!Number.isFinite(num)) continue;
      if (!CARD_BY_ID.has(cardId)) continue;
      deckIndexSamples[String(num)] = cardId;
    }
  }

  const deckIndexConfigRaw =
    typeof data.deckIndexConfig === "object" && data.deckIndexConfig
      ? data.deckIndexConfig
      : settings && typeof settings.deckIndexConfig === "object" && settings.deckIndexConfig
        ? settings.deckIndexConfig
        : STORAGE_DEFAULTS.deckIndexConfig;

  let deckIndexConfig = null;
  if (deckIndexConfigRaw && typeof deckIndexConfigRaw === "object") {
    const mode = deckIndexConfigRaw.mode;
    const base = deckIndexConfigRaw.base;
    const suitOrder = deckIndexConfigRaw.suitOrder;
    const rankOrder = deckIndexConfigRaw.rankOrder;
    if (
      (mode === "rankMajor" || mode === "suitMajor") &&
      (base === 0 || base === 1) &&
      Array.isArray(suitOrder) &&
      suitOrder.length === 4 &&
      Array.isArray(rankOrder) &&
      rankOrder.length === 8
    ) {
      deckIndexConfig = {
        mode,
        base,
        suitOrder: suitOrder.map((s) => (s == null ? null : String(s))),
        rankOrder: rankOrder.map((r) => (r == null ? null : String(r))),
      };
    }
  }

  const cardImageById = {};
  if (cardImageByIdRaw && typeof cardImageByIdRaw === "object") {
    for (const [key, value] of Object.entries(cardImageByIdRaw)) {
      const cardId = String(key);
      const url = String(value || "");
      if (!CARD_BY_ID.has(cardId)) continue;
      if (!url) continue;
      cardImageById[cardId] = url;
    }
  }

  return {
    seen: preventDuplicates ? dedupePreserveOrder(normalizedSeen) : normalizedSeen,
    preventDuplicates,
    autoReadEnabled,
    autoReadSelector: String(autoReadSelectorRaw ?? "").trim(),
    autoReadMap,
    deckIndexSamples,
    deckIndexConfig,
    deckAssetOrigin,
    deckAssetBasePath,
    deckAssetExt,
    cardImageById,
    trumpSuit,
  };
}

  function belotAutoTrackerContentStart(options) {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const opts = options && typeof options === "object" ? options : {};
  const selector = typeof opts.selector === "string" ? opts.selector.trim() : "";
  const incomingVersion = typeof opts.scriptVersion === "string" ? opts.scriptVersion : "";
  const ATTRS = ["aria-label", "title", "alt", "data-card", "data-value", "src", "srcset", "data-src", "data-srcset"];
  const map = opts.map && typeof opts.map === "object" ? opts.map : {};

  function isValidCardId(id) {
    return typeof id === "string" && /^(S|H|D|C)(7|8|9|10|J|Q|K|A)$/.test(id);
  }

  function isElementVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    const opacity = Number(style.opacity);
    if (Number.isFinite(opacity) && opacity <= 0) return false;
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function tokenFromUrl(urlLike) {
    try {
      const u = new URL(String(urlLike), location.href);
      return u.pathname;
    } catch {
      return null;
    }
  }

  function detectDeckAssetFromImages(imgs) {
    if (!imgs || imgs.length === 0) return null;
    for (const img of imgs) {
      const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
      if (!src) continue;
      try {
        const u = new URL(String(src), location.href);
        const m = u.pathname.match(/^(.*\/)(deck_\d+)\/(\d+)\.(png|jpe?g|webp|svg)$/i);
        if (!m) continue;
        const baseDir = m[1];
        const deckName = m[2];
        const ext = m[4];
        return {
          origin: u.origin,
          basePath: `${baseDir}${deckName}/`,
          ext,
        };
      } catch {
        continue;
      }
    }
    return null;
  }

  function parseSrcset(srcset) {
    const out = [];
    if (!srcset) return out;
    const parts = String(srcset)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const urlPart = part.split(/\s+/)[0];
      const token = tokenFromUrl(urlPart);
      if (token) out.push(token);
    }
    return out;
  }

  function getMappedId(token) {
    if (!token || !state.map) return null;
    const raw = String(token).trim();
    if (!raw) return null;

    const DECK1_INDEX_TO_CARD = {
      1: "D9",
      2: "D10",
      3: "DJ",
      4: "DQ",
      5: "DK",
      6: "DA",
      7: "H9",
      8: "H10",
      9: "HJ",
      10: "HQ",
      11: "HK",
      12: "HA",
      13: "C9",
      14: "C10",
      15: "CJ",
      16: "CQ",
      17: "CK",
      18: "CA",
      19: "S9",
      20: "S10",
      21: "SJ",
      22: "SQ",
      23: "SK",
      24: "SA",
      25: "D7",
      26: "D8",
      27: "H7",
      28: "H8",
      29: "C7",
      30: "C8",
      31: "S7",
      32: "S8",
    };

    function mapDeck1TokenLocal(tokenLike) {
      if (!tokenLike) return null;
      const s = String(tokenLike).split(/[?#]/)[0];
      const m = s.match(/(?:^|\/)deck_1\/(\d+)\.(?:png|jpe?g|webp|svg)$/i);
      if (!m || !m[1]) return null;
      const num = Number.parseInt(m[1], 10);
      if (!Number.isFinite(num)) return null;
      const id = DECK1_INDEX_TO_CARD[num];
      return isValidCardId(id) ? id : null;
    }

    /** @type {string[]} */
    const candidates = [];
    candidates.push(raw);

    // If we got a full URL, also try pathname.
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const path = tokenFromUrl(raw);
      if (path) candidates.push(path);
    }

    const noQuery = raw.split(/[?#]/)[0];
    if (noQuery && noQuery !== raw) candidates.push(noQuery);

    // Normalize common variants (shadow vs non-shadow assets, etc).
    if (noQuery.includes("/shadow/")) candidates.push(noQuery.replace("/shadow/", "/"));

    // deck_X/NN.png tail
    const deckTail = noQuery.match(/(deck_[^/]+\/[^/]+)$/);
    if (deckTail && deckTail[1]) candidates.push(deckTail[1]);

    const basename = noQuery.split("/").pop();
    if (basename) candidates.push(basename);

    if (basename) {
      const noExt = basename.replace(/\.(png|jpg|jpeg|webp|svg)$/i, "");
      if (noExt) candidates.push(noExt);
      const digits = noExt.match(/\d+/);
      if (digits && digits[0]) candidates.push(digits[0]);
    }

    for (const c of candidates) {
      const mapped = state.map[c];
      if (isValidCardId(mapped)) return mapped;
    }

    for (const c of candidates) {
      const mapped = mapDeck1TokenLocal(c);
      if (mapped) return mapped;
    }
    return null;
  }

  function addMappedFromToken(outSet, token) {
    const mapped = getMappedId(token);
    if (mapped) outSet.add(mapped);
  }

  function addMappedFromAttr(outSet, attrName, value) {
    if (!value) return;
    const raw = String(value).trim();
    if (!raw) return;

    // 1) Direct match (if user mapped raw strings)
    addMappedFromToken(outSet, raw);

    // 2) URL/pathname match (recommended)
    const attr = String(attrName || "");
    if (attr.endsWith("srcset")) {
      for (const token of parseSrcset(raw)) addMappedFromToken(outSet, token);
      return;
    }

    if (attr.endsWith("src") || raw.includes("/") || raw.includes(".png") || raw.startsWith("http")) {
      const token = tokenFromUrl(raw);
      if (token) addMappedFromToken(outSet, token);
    }
  }

  const state = (globalThis.__belotAutoTracker = globalThis.__belotAutoTracker || {});
  const prevVersion = typeof state.version === "string" ? state.version : "";
  const restartNeeded = Boolean(incomingVersion && incomingVersion !== prevVersion);
  if (incomingVersion) state.version = incomingVersion;
  state.selector = selector;
  state.map = map;

  if (
    state.enabled === true &&
    state.observer &&
    state.msgHandler &&
    typeof state.interval === "number" &&
    state.interval > 0
    && !restartNeeded
  ) {
    return {
      ok: true,
      restarted: false,
      selector: state.selector || null,
      selectorFound: Boolean(state.selector && document.querySelector(state.selector)),
    };
  }

  if (state.scanTimer) {
    clearTimeout(state.scanTimer);
  }
  if (state.interval) {
    clearInterval(state.interval);
  }
  if (state.observer && typeof state.observer.disconnect === "function") {
    state.observer.disconnect();
  }
  if (state.msgHandler && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.removeListener) {
    chrome.runtime.onMessage.removeListener(state.msgHandler);
  }

  state.enabled = true;
  if (!state.reported || !(state.reported instanceof Set)) {
    state.reported = new Set();
  }
  state.lastScanAt = 0;
  state.scanTimer = null;
  if (typeof state.pauseUntilNoCards !== "boolean") {
    state.pauseUntilNoCards = false;
  }
  if (typeof state.roundOverlaySeen !== "boolean") {
    state.roundOverlaySeen = false;
  }
  if (typeof state.lastDebugAt !== "number") {
    state.lastDebugAt = 0;
  }
  if (typeof state.lastRootFoundAt !== "number") {
    state.lastRootFoundAt = 0;
  }
  if (typeof state.hadCardsEver !== "boolean") {
    state.hadCardsEver = false;
  }
  if (typeof state.sessionEndSent !== "boolean") {
    state.sessionEndSent = false;
  }
  if (typeof state.lastCardsSeenAt !== "number") {
    state.lastCardsSeenAt = 0;
  }

  function cardImgsWithin(root) {
    if (!root) return [];
    if (root.tagName === "IMG") return [root];
    if (!root.querySelectorAll) return [];
    try {
      const list = Array.from(root.querySelectorAll('img.table__cards--card, img[class*="table__cards--card"]'));
      if (list.length > 0) return list;
      const all = Array.from(root.querySelectorAll("img"));
      const cardish = [];
      for (const img of all) {
        const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src")) || "";
        if (typeof src === "string" && (src.includes("/cards/") || src.includes("/deck_"))) {
          cardish.push(img);
        }
      }
      return cardish.length > 0 ? cardish : all;
    } catch {
      return [];
    }
  }

  function rootHasCards(root) {
    if (!root) return false;
    const imgs = cardImgsWithin(root);
    if (imgs.length === 0) return false;
    for (const img of imgs) {
      if (isElementVisible(img)) return true;
    }
    return false;
  }

  function getRoot() {
    if (state.selector) {
      const matches = Array.from(document.querySelectorAll(state.selector));
      if (matches.length === 0) return null;
      if (matches.length === 1) return matches[0];

      let best = matches[0];
      let bestScore = -1;
      for (const el of matches) {
        const imgs = cardImgsWithin(el);
        let visible = 0;
        for (const img of imgs) {
          if (isElementVisible(img)) visible++;
        }
        const score = visible > 0 ? 100 + visible : imgs.length;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      return best;
    }
    return document.body;
  }

  const OCR_RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
  const OCR_SUITS = ["S", "H", "D", "C"];
  const OCR_SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const OCR_CARD_IDS = (() => {
    const ids = [];
    for (const s of OCR_SUITS) for (const r of OCR_RANKS) ids.push(`${s}${r}`);
    return ids;
  })();

  function ocrEnsureCanvas(name, width, height) {
    const ocr = state.ocr;
    if (!ocr) return null;
    if (!ocr[name]) {
      if (typeof OffscreenCanvas === "function") {
        ocr[name] = new OffscreenCanvas(width, height);
      } else {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        ocr[name] = c;
      }
      ocr[`${name}Ctx`] = ocr[name].getContext("2d", { willReadFrequently: true });
    }
    const canvas = ocr[name];
    const ctx = ocr[`${name}Ctx`];
    if (!canvas || !ctx) return null;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return { canvas, ctx };
  }

  function ocrOtsuThreshold(values) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < values.length; i++) hist[values[i]]++;
    const total = values.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) {
        varMax = between;
        threshold = t;
      }
    }
    return threshold;
  }

  function ocrJaccard(a, b) {
    let inter = 0;
    let union = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i] === 1;
      const bv = b[i] === 1;
      if (av || bv) union++;
      if (av && bv) inter++;
    }
    return union > 0 ? inter / union : 0;
  }

  function ocrProjections32(bin) {
    const rows = new Uint16Array(32);
    const cols = new Uint16Array(32);
    for (let i = 0; i < 32 * 32; i++) {
      if (bin[i] !== 1) continue;
      const r = Math.floor(i / 32);
      const c = i - r * 32;
      rows[r]++;
      cols[c]++;
    }
    return { rows, cols };
  }

  function ocrBlocks8FromInk(ink) {
    const blocks = new Float32Array(64);
    if (!ink || ink.length !== 32 * 32) return blocks;
    for (let y = 0; y < 32; y++) {
      const by = Math.floor(y / 4);
      for (let x = 0; x < 32; x++) {
        const bx = Math.floor(x / 4);
        blocks[by * 8 + bx] += ink[y * 32 + x] / 255;
      }
    }
    return blocks;
  }

  function ocrCosine(a, b) {
    let dot = 0;
    let a2 = 0;
    let b2 = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      dot += av * bv;
      a2 += av * av;
      b2 += bv * bv;
    }
    const denom = Math.sqrt(a2) * Math.sqrt(b2);
    return denom > 0 ? dot / denom : 0;
  }

  function ocrProjSim(a, b) {
    let minSum = 0;
    let maxSum = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      minSum += av < bv ? av : bv;
      maxSum += av > bv ? av : bv;
    }
    return maxSum > 0 ? minSum / maxSum : 0;
  }

  function ocrProjectionScore(aProj, bProj) {
    if (!aProj || !bProj) return 0;
    const rowSim = ocrProjSim(aProj.rows, bProj.rows);
    const colSim = ocrProjSim(aProj.cols, bProj.cols);
    return (rowSim + colSim) / 2;
  }

  function ocrExtractCorner32(img, crop) {
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const small = ocrEnsureCanvas("ocrSmall", 32, 32);
    if (!small) return null;

    try {
      if (state.ocr) state.ocr.lastError = null;
      small.ctx.clearRect(0, 0, 32, 32);
      // Fixed crop around the top-left "index" (rank + suit) to avoid borders/face art.
      const sx = Math.max(0, Math.floor(w * (crop && typeof crop.sx === "number" ? crop.sx : 0.02)));
      const sy = Math.max(0, Math.floor(h * (crop && typeof crop.sy === "number" ? crop.sy : 0.02)));
      const sw = Math.max(1, Math.floor(w * (crop && typeof crop.sw === "number" ? crop.sw : 0.28)));
      const sh = Math.max(1, Math.floor(h * (crop && typeof crop.sh === "number" ? crop.sh : 0.44)));
      const cw = Math.min(sw, Math.max(1, w - sx));
      const ch = Math.min(sh, Math.max(1, h - sy));

      const analysis = ocrEnsureCanvas("ocrAnalysis", cw, ch);
      if (!analysis) return null;
      analysis.ctx.clearRect(0, 0, cw, ch);
      analysis.ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);

      // Tighten crop to the actual ink bbox inside the corner (helps avoid borders/empty space).
      let minX = cw;
      let minY = ch;
      let maxX = 0;
      let maxY = 0;
      let hits = 0;
      try {
        const data = analysis.ctx.getImageData(0, 0, cw, ch).data;
        for (let y = 0; y < ch; y += 2) {
          for (let x = 0; x < cw; x += 2) {
            const i = (y * cw + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const isRed = r > g + 30 && r > b + 30 && r > 90;
            const isDark = r < 210 || g < 210 || b < 210;
            if (!(isRed || isDark)) continue;
            // Ignore very light grays (card border/shadow).
            if (r > 230 && g > 230 && b > 230) continue;
            hits++;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      } catch {
        // If bbox detection fails, fall back to full crop.
        hits = 0;
      }

      if (hits > 12) {
        const pad = 2;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(cw - 1, maxX + pad);
        maxY = Math.min(ch - 1, maxY + pad);
      } else {
        minX = 0;
        minY = 0;
        maxX = cw - 1;
        maxY = ch - 1;
      }

      const bbW = Math.max(1, maxX - minX + 1);
      const bbH = Math.max(1, maxY - minY + 1);
      small.ctx.drawImage(analysis.canvas, minX, minY, bbW, bbH, 0, 0, 32, 32);
      const d2 = small.ctx.getImageData(0, 0, 32, 32).data;

      // Reject likely card backs / non-face images (not enough white background).
      let white = 0;
      for (let i = 0; i < 32 * 32; i++) {
        const r = d2[i * 4];
        const g = d2[i * 4 + 1];
        const b = d2[i * 4 + 2];
        if (r > 235 && g > 235 && b > 235) white++;
      }
      const whiteRatio = white / (32 * 32);
      if (whiteRatio < 0.12) {
        if (state.ocr) state.ocr.lastError = "low_white_ratio";
        return null;
      }

      const ink = new Uint8Array(32 * 32);
      for (let i = 0; i < 32 * 32; i++) {
        const r = d2[i * 4];
        const g = d2[i * 4 + 1];
        const b = d2[i * 4 + 2];
        const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
        ink[i] = 255 - gray;
      }
      const thr = ocrOtsuThreshold(ink);

      const bin = new Uint8Array(32 * 32);
      let inkCount = 0;
      let redCount = 0;
      for (let i = 0; i < 32 * 32; i++) {
        if (ink[i] > thr) {
          bin[i] = 1;
          inkCount++;
          const r = d2[i * 4];
          const g = d2[i * 4 + 1];
          const b = d2[i * 4 + 2];
          if (r > g + 25 && r > b + 25) redCount++;
        }
      }

      const redRatio = inkCount > 0 ? redCount / inkCount : 0;
      const proj = ocrProjections32(bin);
      const blocks = ocrBlocks8FromInk(ink);
      return { bin, inkCount, redRatio, proj, blocks, whiteRatio };
    } catch (err) {
      if (state.ocr) state.ocr.lastError = String((err && err.message) || err || "canvas_read_error");
      return null;
    }
  }

  function ocrEnsureTemplates() {
    const ocr = state.ocr;
    if (!ocr || ocr.templates) return;
    const templates = [];
    const rankFontFamilies = ['"Arial","Helvetica",sans-serif', '"Georgia","Times New Roman",serif', '"Times New Roman","Georgia",serif'];
    const suitFontFamilies = [
      '"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols","Arial Unicode MS","Arial",sans-serif',
      '"Arial Unicode MS","Segoe UI Symbol","Arial",sans-serif',
      '"Times New Roman","Georgia","Arial",serif',
    ];
    const offsets = [
      { x: 1, y: 0, sy: 14 },
      { x: 2, y: 1, sy: 15 },
    ];
    for (const id of OCR_CARD_IDS) {
      const suit = id[0];
      const rank = id.slice(1);
      const isRed = suit === "H" || suit === "D";
      for (const rf of rankFontFamilies) {
        for (const sf of suitFontFamilies) {
          for (const off of offsets) {
            try {
              const small = ocrEnsureCanvas("ocrTplSmall", 32, 32);
              if (!small) continue;
              small.ctx.clearRect(0, 0, 32, 32);
              small.ctx.fillStyle = "#fff";
              small.ctx.fillRect(0, 0, 32, 32);
              small.ctx.fillStyle = isRed ? "#c00" : "#000";
              small.ctx.textAlign = "left";
              small.ctx.textBaseline = "top";
              // Roughly match a typical card index layout.
              small.ctx.font = rank === "10" ? `bold 16px ${rf}` : `bold 18px ${rf}`;
              small.ctx.fillText(rank, off.x, off.y);
              small.ctx.font = `18px ${sf}`;
              small.ctx.fillText(OCR_SUIT_SYMBOL[suit], off.x + 1, off.sy);

              const d2 = small.ctx.getImageData(0, 0, 32, 32).data;
              const ink = new Uint8Array(32 * 32);
              for (let i = 0; i < 32 * 32; i++) {
                const r = d2[i * 4];
                const g = d2[i * 4 + 1];
                const b = d2[i * 4 + 2];
                const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
                ink[i] = 255 - gray;
              }
              const thr = ocrOtsuThreshold(ink);
              const bin = new Uint8Array(32 * 32);
              for (let i = 0; i < 32 * 32; i++) {
                if (ink[i] > thr) bin[i] = 1;
              }
              const proj = ocrProjections32(bin);
              const blocks = ocrBlocks8FromInk(ink);
              templates.push({ id, isRed, bin, proj, blocks });
            } catch {
              // ignore template failure
            }
          }
        }
      }
    }
    ocr.templates = templates;
  }

  function ocrRecognizeFromImg(img) {
    ocrEnsureTemplates();
    const ocr = state.ocr;
    if (!ocr || !Array.isArray(ocr.templates) || ocr.templates.length === 0) return null;
    const crops = [
      // Tight crops around the index (rank + suit)
      { sx: 0.0, sy: 0.0, sw: 0.24, sh: 0.34 },
      { sx: 0.01, sy: 0.01, sw: 0.26, sh: 0.36 },
      { sx: 0.02, sy: 0.02, sw: 0.28, sh: 0.38 },
      { sx: 0.03, sy: 0.02, sw: 0.24, sh: 0.34 },
      { sx: 0.04, sy: 0.03, sw: 0.26, sh: 0.36 },
      // Slightly larger fallbacks (in case index is lower)
      { sx: 0.02, sy: 0.02, sw: 0.3, sh: 0.44 },
      { sx: 0.03, sy: 0.03, sw: 0.32, sh: 0.5 },
    ];

    /** @type {{id: string, score: number, delta: number, redHint: string, cropIndex: number} | null} */
    let bestOverall = null;

    for (let ci = 0; ci < crops.length; ci++) {
      const feat = ocrExtractCorner32(img, crops[ci]);
      if (!feat) continue;
      if (feat.inkCount < 16) {
        if (ocr) ocr.lastError = "low_ink";
        continue;
      }

      const redHint = feat.redRatio > 0.22 ? "red" : feat.redRatio < 0.07 ? "black" : "unknown";
      /** @type {Map<string, number>} */
      const bestById = new Map();

      for (const tpl of ocr.templates) {
        const cos = ocrCosine(feat.blocks, tpl.blocks);
        const j = ocrJaccard(feat.bin, tpl.bin);
        const p = ocrProjectionScore(feat.proj, tpl.proj);
        let score = cos * 0.62 + j * 0.18 + p * 0.2;
        if (redHint === "red" && !tpl.isRed) score *= 0.96;
        if (redHint === "black" && tpl.isRed) score *= 0.96;
        const prev = bestById.get(tpl.id);
        if (prev == null || score > prev) bestById.set(tpl.id, score);
      }

      let bestId = null;
      let bestScore = -1;
      let second = -1;
      for (const [id, score] of bestById.entries()) {
        if (score > bestScore) {
          second = bestScore;
          bestScore = score;
          bestId = id;
        } else if (score > second) {
          second = score;
        }
      }
      if (!bestId) continue;

      const delta = bestScore - second;
      const cand = { id: bestId, score: bestScore, delta, redHint, cropIndex: ci };
      if (
        !bestOverall ||
        cand.score > bestOverall.score + 0.01 ||
        (cand.score >= bestOverall.score - 0.01 && cand.delta > bestOverall.delta + 0.02)
      ) {
        bestOverall = cand;
      }
    }

    return bestOverall;
  }

  function ocrMaybeLearnFromImgs(imgs, foundSet) {
    const ocr = state.ocr;
    if (!ocr || !imgs || imgs.length === 0) return null;
    if (!ocr.cache || typeof ocr.cache !== "object") ocr.cache = {};

    const updates = {};
    const infos = [];
    const attempts = [];
    let processed = 0;
    for (const img of imgs) {
      if (!img || processed >= 4) break;
      const className = typeof img.className === "string" ? img.className : String(img.className || "");
      const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
      const token = src ? tokenFromUrl(src) : null;
      if (!token) continue;
      const isCardish =
        className.includes("table__cards--card") || token.includes("/cards/") || token.includes("/deck_");
      if (!isCardish) continue;
      const existing = getMappedId(token);
      const tokenShort = token.split("/").slice(-2).join("/");

      // If the user already mapped this token, never override it with OCR.
      if (existing) {
        foundSet.add(existing);
        continue;
      }

      const cached = ocr.cache[token];
      if (cached && cached.id && isValidCardId(cached.id)) {
        const id = cached.id;
        if (state.map) state.map[token] = id;
        updates[token] = id;
        infos.push(`${tokenShort}:${id}@${Number(cached.score ?? 0).toFixed(2)}`);
        foundSet.add(id);
        continue;
      }
      if (cached && cached.failAt && Date.now() - cached.failAt < 15000) {
        continue;
      }

      processed++;
      const rec = ocrRecognizeFromImg(img);
      if (!rec || !isValidCardId(rec.id)) {
        ocr.cache[token] = { id: null, failAt: Date.now() };
        const err = ocr.lastError ? String(ocr.lastError) : "no_match";
        attempts.push(`${tokenShort}:fail(${err})`);
        continue;
      }

      attempts.push(
        `${tokenShort}:${rec.id}@${rec.score.toFixed(2)}Δ${rec.delta.toFixed(2)}${
          typeof rec.cropIndex === "number" ? ` c${rec.cropIndex}` : ""
        }`,
      );

      const now = Date.now();
      let hits = 1;
      if (cached && cached.pendingId === rec.id && typeof cached.hits === "number") {
        hits = cached.hits + 1;
      }
      ocr.cache[token] = { pendingId: rec.id, hits, lastScore: rec.score, at: now };
      const veryConfident = rec.score >= 0.72 && rec.delta >= 0.06;
      const confident = rec.score >= 0.66 && rec.delta >= 0.04;
      const medium = rec.score >= 0.6 && rec.delta >= 0.03;
      const stable = rec.score >= 0.55 && rec.delta >= 0.01 && hits >= 6;
      const weakStable = rec.score >= 0.48 && hits >= 12;
      const confirmed = veryConfident || (confident && hits >= 2) || (medium && hits >= 3) || stable || weakStable;
      const allow = confirmed;
      if (!allow) {
        continue;
      }

      if (state.map) state.map[token] = rec.id;
      ocr.cache[token] = { id: rec.id, score: rec.score, at: now };
      updates[token] = rec.id;
      foundSet.add(rec.id);
      infos.push(`${tokenShort}:${rec.id}@${rec.score.toFixed(2)}`);
    }

    if (Object.keys(updates).length > 0) {
      ocr.lastOcr = infos.slice(0, 3);
      chrome.runtime.sendMessage({ type: "belot_auto_tracker/map_update", updates, source: "ocr" });
    } else {
      ocr.lastOcr = null;
    }
    ocr.lastAttempt = attempts.slice(0, 3);
    return { updatesCount: Object.keys(updates).length, infos };
  }

  function scanNow() {
    if (!state.enabled) return;
    const now = Date.now();
    if (now - state.lastScanAt < 250) return;
    state.lastScanAt = now;

    const roundOverlay = document.querySelector(".table__round-table");
    const roundOverlayVisible = isElementVisible(roundOverlay);
    if (roundOverlayVisible && !state.roundOverlaySeen) {
      state.roundOverlaySeen = true;
      state.pauseUntilNoCards = true;
      state.reported = new Set();
      chrome.runtime.sendMessage({ type: "belot_auto_tracker/round_end" });
    } else if (!roundOverlayVisible && state.roundOverlaySeen) {
      state.roundOverlaySeen = false;
    }

    const root = getRoot();
    const hasCards = rootHasCards(root);
    if (root) {
      state.lastRootFoundAt = now;
    }
    if (hasCards) {
      state.hadCardsEver = true;
      state.lastCardsSeenAt = now;
      state.sessionEndSent = false;
    }

    // If gameplay UI disappears (tab navigated / game ended), reset the session.
    if (!root && state.hadCardsEver && !state.sessionEndSent && now - state.lastRootFoundAt > 6000) {
      state.sessionEndSent = true;
      state.hadCardsEver = false;
      state.pauseUntilNoCards = true;
      state.reported = new Set();
      chrome.runtime.sendMessage({ type: "belot_auto_tracker/session_end" });
    }

    // If the table stays empty for a long time after we previously saw cards, treat it as a session/game end.
    if (
      root &&
      !hasCards &&
      state.hadCardsEver &&
      !state.pauseUntilNoCards &&
      !state.sessionEndSent &&
      !roundOverlayVisible &&
      now - state.lastCardsSeenAt > 120000
    ) {
      state.sessionEndSent = true;
      state.hadCardsEver = false;
      state.pauseUntilNoCards = true;
      state.reported = new Set();
      chrome.runtime.sendMessage({ type: "belot_auto_tracker/session_end" });
    }

    // After an auto-reset, wait until the table clears before starting again.
    if (state.pauseUntilNoCards) {
      if (hasCards) return;
      state.pauseUntilNoCards = false;
      state.reported = new Set();
      state.lastScanAt = 0;
      return;
    }

    if (!root || !hasCards) {
      if (now - state.lastDebugAt >= 950) {
        state.lastDebugAt = now;
        const imgs = root ? cardImgsWithin(root) : [];
        const tokens = [];
        for (const img of imgs) {
          const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
          const token = src ? tokenFromUrl(src) : null;
          if (token) tokens.push(token);
          if (tokens.length >= 6) break;
        }
        const deckAsset = detectDeckAssetFromImages(imgs);
        let mapKeyCount = state.map ? Object.keys(state.map).length : 0;
        const hasDeck1Token = tokens.some((t) => /(?:^|\/)deck_1\/\d+\.(?:png|jpe?g|webp|svg)$/i.test(t));
        if (mapKeyCount === 0 && hasDeck1Token) mapKeyCount = 32;
    chrome.runtime.sendMessage({
      type: "belot_auto_tracker/debug",
      scriptVersion: state.version || null,
      selector: state.selector || null,
      selectorFound: Boolean(root),
      hasCards,
      paused: Boolean(state.pauseUntilNoCards),
      overlayVisible: roundOverlayVisible,
          imgCount: imgs.length,
          tokensSample: tokens,
          unmappedTokensSample: tokens.filter((t) => !getMappedId(t)).slice(0, 8),
          foundIds: [],
          newIds: [],
          mapKeys: mapKeyCount,
          deckAsset,
        });
      }
      return;
    }

    const imgs = cardImgsWithin(root);
    const foundSet = new Set();

    try {
      // Map from attributes / image URLs -> card ids (if page doesn't expose text labels).
      for (const a of ATTRS) {
        const v = root.getAttribute && root.getAttribute(a);
        if (v) addMappedFromAttr(foundSet, a, v);
      }

      if (root.tagName === "IMG") {
        // currentSrc can differ from attribute src
        const img = root;
        addMappedFromAttr(foundSet, "src", img.currentSrc || img.src);
      }

      for (const img of imgs) {
        addMappedFromAttr(foundSet, "src", img.currentSrc || img.src);
        addMappedFromAttr(foundSet, "src", img.getAttribute && img.getAttribute("src"));
        addMappedFromAttr(foundSet, "srcset", img.getAttribute && img.getAttribute("srcset"));
        addMappedFromAttr(foundSet, "data-src", img.getAttribute && img.getAttribute("data-src"));
        addMappedFromAttr(foundSet, "data-srcset", img.getAttribute && img.getAttribute("data-srcset"));
      }

      const selectorList = ATTRS.map((a) => `[${a}]`).join(",");
      const nodes = root.querySelectorAll(selectorList);
      for (const el of nodes) {
        for (const a of ATTRS) {
          const v = el.getAttribute && el.getAttribute(a);
          if (v) addMappedFromAttr(foundSet, a, v);
        }
      }
    } catch {
      // ignore
    }

    const found = Array.from(foundSet);
    const newOnes = [];
    for (const id of found) {
      if (state.reported.has(id)) continue;
      state.reported.add(id);
      newOnes.push(id);
    }
    if (newOnes.length > 0) {
      chrome.runtime.sendMessage({ type: "belot_auto_tracker/cards", cards: newOnes });
    }

    if (now - state.lastDebugAt >= 950) {
      state.lastDebugAt = now;
      const tokens = [];
      for (const img of imgs) {
        const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
        const token = src ? tokenFromUrl(src) : null;
        if (token) tokens.push(token);
        if (tokens.length >= 6) break;
      }

      const deckAsset = detectDeckAssetFromImages(imgs);
      let mapKeyCount = state.map ? Object.keys(state.map).length : 0;
      const hasDeck1Token = tokens.some((t) => /(?:^|\/)deck_1\/\d+\.(?:png|jpe?g|webp|svg)$/i.test(t));
      if (mapKeyCount === 0 && hasDeck1Token) mapKeyCount = 32;
      chrome.runtime.sendMessage({
        type: "belot_auto_tracker/debug",
        scriptVersion: state.version || null,
        selector: state.selector || null,
        selectorFound: true,
        hasCards,
        paused: Boolean(state.pauseUntilNoCards),
        overlayVisible: roundOverlayVisible,
        imgCount: imgs.length,
        tokensSample: tokens,
        unmappedTokensSample: tokens.filter((t) => !getMappedId(t)).slice(0, 8),
        foundIds: found.slice(0, 12),
        newIds: newOnes.slice(0, 12),
        mapKeys: mapKeyCount,
        deckAsset,
      });
    }
  }

  function scheduleScan() {
    if (!state.enabled) return;
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      scanNow();
    }, 250);
  }

  state.observer = new MutationObserver(() => scheduleScan());
  state.observer.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });

  if (state.msgHandler && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.removeListener) {
    chrome.runtime.onMessage.removeListener(state.msgHandler);
  }
  state.msgHandler = (message) => {
    if (!message || message.type !== "belot_auto_tracker/reset_session") return;
    state.reported = new Set();
    state.lastScanAt = 0;
    state.pauseUntilNoCards = Boolean(message.pauseUntilNoCards);
  };
  chrome.runtime.onMessage.addListener(state.msgHandler);

  state.interval = setInterval(() => scanNow(), 1000);
  scanNow();

  return {
    ok: true,
    restarted: restartNeeded,
    selector: state.selector || null,
    selectorFound: Boolean(getRoot()),
  };
}

function belotAutoTrackerContentStop() {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const state = globalThis.__belotAutoTracker;
  if (state && state.observer && typeof state.observer.disconnect === "function") {
    state.observer.disconnect();
  }
  if (state && state.scanTimer) {
    clearTimeout(state.scanTimer);
  }
  if (state && state.interval) {
    clearInterval(state.interval);
  }
  if (state && state.msgHandler && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.removeListener) {
    chrome.runtime.onMessage.removeListener(state.msgHandler);
  }
  if (state && state.captureHandler) {
    document.removeEventListener("click", state.captureHandler, true);
  }
  delete globalThis.__belotAutoTracker;
  return { ok: true };
}

function belotAutoTrackerContentCaptureStart(options) {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const opts = options && typeof options === "object" ? options : {};
  const selector = typeof opts.selector === "string" ? opts.selector.trim() : "";

  function tokenFromUrl(urlLike) {
    try {
      const u = new URL(String(urlLike), location.href);
      return u.pathname;
    } catch {
      return null;
    }
  }

  function parseSrcset(srcset) {
    const out = [];
    if (!srcset) return out;
    const parts = String(srcset)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const urlPart = part.split(/\s+/)[0];
      const token = tokenFromUrl(urlPart);
      if (token) out.push(token);
    }
    return out;
  }

  function getRoot() {
    if (!selector) return document.body;
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length === 0) return document.body;
    if (nodes.length === 1) return nodes[0];

    let best = nodes[0];
    let bestCount = -1;
    for (const node of nodes) {
      let count = 0;
      try {
        count = node.querySelectorAll('img.table__cards--card, img[class*="table__cards--card"]').length;
        if (count === 0) count = node.querySelectorAll("img").length;
      } catch {
        count = 0;
      }
      if (count > bestCount) {
        bestCount = count;
        best = node;
      }
    }
    return best;
  }

  const state = (globalThis.__belotAutoTracker = globalThis.__belotAutoTracker || {});
  state.captureSelector = selector;

  if (state.captureHandler) {
    document.removeEventListener("click", state.captureHandler, true);
  }

  state.captureHandler = (event) => {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const root = getRoot();
    if (root && !root.contains(target)) return;

    const tokens = [];

    const img = target.closest("img");
    if (img) {
      const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
      const token = src ? tokenFromUrl(src) : null;
      if (token) tokens.push(token);

      const srcset = img.getAttribute && img.getAttribute("srcset");
      tokens.push(...parseSrcset(srcset));

      const dataSrc = img.getAttribute && img.getAttribute("data-src");
      const dataToken = dataSrc ? tokenFromUrl(dataSrc) : null;
      if (dataToken) tokens.push(dataToken);

      const dataSrcset = img.getAttribute && img.getAttribute("data-srcset");
      tokens.push(...parseSrcset(dataSrcset));
    }

    const el = target.closest("[data-card],[data-value],[aria-label],[title],[alt]");
    if (el && el.getAttribute) {
      for (const a of ["data-card", "data-value", "aria-label", "title", "alt"]) {
        const v = el.getAttribute(a);
        if (v) tokens.push(String(v));
        if (v && (String(v).includes("/") || String(v).includes(".png") || String(v).startsWith("http"))) {
          const token = tokenFromUrl(v);
          if (token) tokens.push(token);
        }
      }
    }

    const uniq = Array.from(new Set(tokens)).filter(Boolean);
    if (uniq.length === 0) return;

    chrome.runtime.sendMessage({ type: "belot_auto_tracker/capture", token: uniq[0], tokens: uniq });
  };

  document.addEventListener("click", state.captureHandler, true);

  return {
    ok: true,
    selector: selector || null,
    selectorFound: Boolean(getRoot()),
  };
}

function belotAutoTrackerContentCaptureStop() {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const state = globalThis.__belotAutoTracker;
  if (state && state.captureHandler) {
    document.removeEventListener("click", state.captureHandler, true);
  }
  if (state) {
    delete state.captureHandler;
    delete state.captureSelector;
  }
  return { ok: true };
}

function belotAutoTrackerContentGetDeckAssetPattern(options) {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const opts = options && typeof options === "object" ? options : {};
  const selector = typeof opts.selector === "string" ? opts.selector.trim() : "";

  function tokenFromUrl(urlLike) {
    try {
      const u = new URL(String(urlLike), location.href);
      return u.pathname;
    } catch {
      return null;
    }
  }

  /** @type {HTMLImageElement[]} */
  let imgs = [];
  try {
    if (selector) {
      const root = document.querySelector(selector);
      if (root && root.querySelectorAll) imgs = Array.from(root.querySelectorAll("img"));
    }
  } catch {
    // ignore
  }
  if (imgs.length === 0) {
    try {
      imgs = Array.from(document.querySelectorAll("img"));
    } catch {
      imgs = [];
    }
  }

  for (const img of imgs) {
    const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute("src"));
    const token = tokenFromUrl(src);
    if (!token) continue;
    const m = token.match(/^(.*\/)(deck_\d+)\/(\d+)\.(png|jpe?g|webp|svg)$/i);
    if (!m) continue;
    const baseDir = m[1];
    const deckName = m[2];
    const ext = m[4];
    return {
      ok: true,
      origin: location.origin,
      basePath: `${baseDir}${deckName}/`,
      deckName,
      ext,
      sampleToken: token,
    };
  }

  return { ok: false, origin: location.origin, error: "Nu s-au găsit imagini de cărți în pagină." };
}

async function belotAutoTrackerContentFetchImageDataUrl(options) {
  // Runs inside the active tab (isolated world) via chrome.scripting.executeScript.
  const opts = options && typeof options === "object" ? options : {};
  const url = typeof opts.url === "string" ? opts.url : "";
  if (!url) return { ok: false, error: "Lipsește URL-ul." };

  try {
    const img = new Image();
    img.decoding = "async";

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timp expirat")), 6000);
      img.onload = () => {
        clearTimeout(t);
        resolve(null);
      };
      img.onerror = () => {
        clearTimeout(t);
        reject(new Error("eroare încărcare"));
      };
      img.src = url;
    });

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return { ok: false, error: "Imaginea nu are dimensiuni." };

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, error: "Context canvas indisponibil." };
    ctx.drawImage(img, 0, 0);

    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      return { ok: false, error: "canvas blocat (cross‑origin)" };
    }
    return { ok: true, dataUrl, width: w, height: h };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || "eroare") };
  }
}

async function belotAutoTrackerContentOcrDeck(options) {
  const opts = options && typeof options === "object" ? options : {};
  const basePath = typeof opts.basePath === "string" ? opts.basePath : "";
  const ext = typeof opts.ext === "string" ? opts.ext : "png";
  const start = Number.isFinite(opts.start) ? Number(opts.start) : 1;
  const end = Number.isFinite(opts.end) ? Number(opts.end) : 32;
  if (!basePath) return { ok: false, error: "Lipsește basePath." };

  const OCR_RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
  const OCR_SUITS = ["S", "H", "D", "C"];
  const OCR_SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const OCR_CARD_IDS = (() => {
    const ids = [];
    for (const s of OCR_SUITS) for (const r of OCR_RANKS) ids.push(`${s}${r}`);
    return ids;
  })();

  function ocrEnsureCanvas(name, width, height, store) {
    const ocr = store;
    if (!ocr[name]) {
      if (typeof OffscreenCanvas === "function") {
        ocr[name] = new OffscreenCanvas(width, height);
      } else {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        ocr[name] = c;
      }
      ocr[`${name}Ctx`] = ocr[name].getContext("2d", { willReadFrequently: true });
    }
    const canvas = ocr[name];
    const ctx = ocr[`${name}Ctx`];
    if (!canvas || !ctx) return null;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return { canvas, ctx };
  }

  function ocrOtsuThreshold(values) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < values.length; i++) hist[i]++;
    const total = values.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) {
        varMax = between;
        threshold = t;
      }
    }
    return threshold;
  }

  function ocrJaccard(a, b) {
    let inter = 0;
    let union = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i] === 1;
      const bv = b[i] === 1;
      if (av || bv) union++;
      if (av && bv) inter++;
    }
    return union > 0 ? inter / union : 0;
  }

  function ocrProjections32(bin) {
    const rows = new Uint16Array(32);
    const cols = new Uint16Array(32);
    for (let i = 0; i < 32 * 32; i++) {
      if (bin[i] !== 1) continue;
      const r = Math.floor(i / 32);
      const c = i - r * 32;
      rows[r]++;
      cols[c]++;
    }
    return { rows, cols };
  }

  function ocrBlocks8FromInk(ink) {
    const blocks = new Float32Array(64);
    if (!ink || ink.length !== 32 * 32) return blocks;
    for (let y = 0; y < 32; y++) {
      const by = Math.floor(y / 4);
      for (let x = 0; x < 32; x++) {
        const bx = Math.floor(x / 4);
        blocks[by * 8 + bx] += ink[y * 32 + x] / 255;
      }
    }
    return blocks;
  }

  function ocrCosine(a, b) {
    let dot = 0;
    let a2 = 0;
    let b2 = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      dot += av * bv;
      a2 += av * av;
      b2 += bv * bv;
    }
    const denom = Math.sqrt(a2) * Math.sqrt(b2);
    return denom > 0 ? dot / denom : 0;
  }

  function ocrProjSim(a, b) {
    let minSum = 0;
    let maxSum = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      minSum += av < bv ? av : bv;
      maxSum += av > bv ? av : bv;
    }
    return maxSum > 0 ? minSum / maxSum : 0;
  }

  function ocrProjectionScore(aProj, bProj) {
    if (!aProj || !bProj) return 0;
    const rowSim = ocrProjSim(aProj.rows, bProj.rows);
    const colSim = ocrProjSim(aProj.cols, bProj.cols);
    return (rowSim + colSim) / 2;
  }

  function ocrExtractCorner32(img, store, crop) {
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const small = ocrEnsureCanvas("ocrSmall", 32, 32, store);
    if (!small) return null;

    try {
      small.ctx.clearRect(0, 0, 32, 32);
      const sx = Math.max(0, Math.floor(w * (crop && typeof crop.sx === "number" ? crop.sx : 0.02)));
      const sy = Math.max(0, Math.floor(h * (crop && typeof crop.sy === "number" ? crop.sy : 0.02)));
      const sw = Math.max(1, Math.floor(w * (crop && typeof crop.sw === "number" ? crop.sw : 0.28)));
      const sh = Math.max(1, Math.floor(h * (crop && typeof crop.sh === "number" ? crop.sh : 0.44)));
      const cw = Math.min(sw, Math.max(1, w - sx));
      const ch = Math.min(sh, Math.max(1, h - sy));

      const analysis = ocrEnsureCanvas("ocrAnalysis", cw, ch, store);
      if (!analysis) return null;
      analysis.ctx.clearRect(0, 0, cw, ch);
      analysis.ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);

      let minX = cw;
      let minY = ch;
      let maxX = 0;
      let maxY = 0;
      let hits = 0;
      const data = analysis.ctx.getImageData(0, 0, cw, ch).data;
      for (let y = 0; y < ch; y += 2) {
        for (let x = 0; x < cw; x += 2) {
          const i = (y * cw + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const isRed = r > g + 30 && r > b + 30 && r > 90;
          const isDark = r < 210 || g < 210 || b < 210;
          if (!(isRed || isDark)) continue;
          if (r > 230 && g > 230 && b > 230) continue;
          hits++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }

      if (hits > 12) {
        const pad = 2;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(cw - 1, maxX + pad);
        maxY = Math.min(ch - 1, maxY + pad);
      } else {
        minX = 0;
        minY = 0;
        maxX = cw - 1;
        maxY = ch - 1;
      }

      const bbW = Math.max(1, maxX - minX + 1);
      const bbH = Math.max(1, maxY - minY + 1);
      small.ctx.drawImage(analysis.canvas, minX, minY, bbW, bbH, 0, 0, 32, 32);
      const d2 = small.ctx.getImageData(0, 0, 32, 32).data;

      let white = 0;
      for (let i = 0; i < 32 * 32; i++) {
        const r = d2[i * 4];
        const g = d2[i * 4 + 1];
        const b = d2[i * 4 + 2];
        if (r > 235 && g > 235 && b > 235) white++;
      }
      const whiteRatio = white / (32 * 32);
      if (whiteRatio < 0.12) return null;

      const ink = new Uint8Array(32 * 32);
      for (let i = 0; i < 32 * 32; i++) {
        const r = d2[i * 4];
        const g = d2[i * 4 + 1];
        const b = d2[i * 4 + 2];
        const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
        ink[i] = 255 - gray;
      }
      const thr = ocrOtsuThreshold(ink);

      const bin = new Uint8Array(32 * 32);
      let inkCount = 0;
      let redCount = 0;
      for (let i = 0; i < 32 * 32; i++) {
        if (ink[i] > thr) {
          bin[i] = 1;
          inkCount++;
          const r = d2[i * 4];
          const g = d2[i * 4 + 1];
          const b = d2[i * 4 + 2];
          if (r > g + 25 && r > b + 25) redCount++;
        }
      }

      const redRatio = inkCount > 0 ? redCount / inkCount : 0;
      const proj = ocrProjections32(bin);
      const blocks = ocrBlocks8FromInk(ink);
      return { bin, inkCount, redRatio, proj, blocks, whiteRatio };
    } catch {
      return null;
    }
  }

  function ocrEnsureTemplates(store) {
    if (store.templates) return;
    const templates = [];
    const rankFontFamilies = ['"Arial","Helvetica",sans-serif', '"Georgia","Times New Roman",serif', '"Times New Roman","Georgia",serif'];
    const suitFontFamilies = [
      '"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols","Arial Unicode MS","Arial",sans-serif',
      '"Arial Unicode MS","Segoe UI Symbol","Arial",sans-serif',
      '"Times New Roman","Georgia","Arial",serif',
    ];
    const offsets = [
      { x: 1, y: 0, sy: 14 },
      { x: 2, y: 1, sy: 15 },
    ];
    for (const id of OCR_CARD_IDS) {
      const suit = id[0];
      const rank = id.slice(1);
      const isRed = suit === "H" || suit === "D";
      for (const rf of rankFontFamilies) {
        for (const sf of suitFontFamilies) {
          for (const off of offsets) {
            try {
              const small = ocrEnsureCanvas("ocrTplSmall", 32, 32, store);
              if (!small) continue;
              small.ctx.clearRect(0, 0, 32, 32);
              small.ctx.fillStyle = "#fff";
              small.ctx.fillRect(0, 0, 32, 32);
              small.ctx.fillStyle = isRed ? "#c00" : "#000";
              small.ctx.textAlign = "left";
              small.ctx.textBaseline = "top";
              small.ctx.font = rank === "10" ? `bold 16px ${rf}` : `bold 18px ${rf}`;
              small.ctx.fillText(rank, off.x, off.y);
              small.ctx.font = `18px ${sf}`;
              small.ctx.fillText(OCR_SUIT_SYMBOL[suit], off.x + 1, off.sy);

              const d2 = small.ctx.getImageData(0, 0, 32, 32).data;
              const ink = new Uint8Array(32 * 32);
              for (let i = 0; i < 32 * 32; i++) {
                const r = d2[i * 4];
                const g = d2[i * 4 + 1];
                const b = d2[i * 4 + 2];
                const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
                ink[i] = 255 - gray;
              }
              const thr = ocrOtsuThreshold(ink);
              const bin = new Uint8Array(32 * 32);
              for (let i = 0; i < 32 * 32; i++) {
                if (ink[i] > thr) bin[i] = 1;
              }
              const proj = ocrProjections32(bin);
              const blocks = ocrBlocks8FromInk(ink);
              templates.push({ id, isRed, bin, proj, blocks });
            } catch {
              // ignore template failure
            }
          }
        }
      }
    }
    store.templates = templates;
  }

  function ocrRecognizeFromImg(img, store) {
    ocrEnsureTemplates(store);
    if (!Array.isArray(store.templates) || store.templates.length === 0) return null;
    const crops = [
      { sx: 0.0, sy: 0.0, sw: 0.24, sh: 0.34 },
      { sx: 0.01, sy: 0.01, sw: 0.26, sh: 0.36 },
      { sx: 0.02, sy: 0.02, sw: 0.28, sh: 0.38 },
      { sx: 0.02, sy: 0.02, sw: 0.3, sh: 0.44 },
    ];

    let bestOverall = null;
    for (let ci = 0; ci < crops.length; ci++) {
      const feat = ocrExtractCorner32(img, store, crops[ci]);
      if (!feat || feat.inkCount < 16) continue;
      const redHint = feat.redRatio > 0.22 ? "red" : feat.redRatio < 0.07 ? "black" : "unknown";
      const bestById = new Map();
      for (const tpl of store.templates) {
        const cos = ocrCosine(feat.blocks, tpl.blocks);
        const j = ocrJaccard(feat.bin, tpl.bin);
        const p = ocrProjectionScore(feat.proj, tpl.proj);
        let score = cos * 0.62 + j * 0.18 + p * 0.2;
        if (redHint === "red" && !tpl.isRed) score *= 0.96;
        if (redHint === "black" && tpl.isRed) score *= 0.96;
        const prev = bestById.get(tpl.id);
        if (prev == null || score > prev) bestById.set(tpl.id, score);
      }
      let bestId = null;
      let bestScore = -1;
      let second = -1;
      for (const [id, score] of bestById.entries()) {
        if (score > bestScore) {
          second = bestScore;
          bestScore = score;
          bestId = id;
        } else if (score > second) {
          second = score;
        }
      }
      if (!bestId) continue;
      const delta = bestScore - second;
      const cand = { id: bestId, score: bestScore, delta, cropIndex: ci };
      if (!bestOverall || cand.score > bestOverall.score) bestOverall = cand;
    }
    return bestOverall;
  }

  const results = {};
  const byId = {};
  const failed = [];
  const store = {};

  for (let i = start; i <= end; i++) {
    const url = `${location.origin}${basePath}${i}.${ext}`;
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 6000);
        img.onload = () => {
          clearTimeout(t);
          resolve(null);
        };
        img.onerror = () => {
          clearTimeout(t);
          reject(new Error("load_error"));
        };
        img.src = url;
      });
      const rec = ocrRecognizeFromImg(img, store);
      if (!rec || !rec.id || rec.score < 0.56 || rec.delta < 0.02) {
        failed.push(i);
        continue;
      }
      results[String(i)] = rec.id;
      byId[rec.id] = url;
    } catch {
      failed.push(i);
    }
  }

  return {
    ok: true,
    basePath,
    ext,
    mapping: results,
    cardImageById: byId,
    failed,
  };
}


document.addEventListener("DOMContentLoaded", () => {
  const els = {
    remainingTotal: document.getElementById("remainingTotal"),
    suitBreakdown: document.getElementById("suitBreakdown"),
    deckGrid: document.getElementById("deckGrid"),
    calibrateBtn: document.getElementById("calibrateBtn"),
    calibrationPanel: document.getElementById("calibrationPanel"),
    calibrationCloseBtn: document.getElementById("calibrationCloseBtn"),
    calibrationSubtitle: document.getElementById("calibrationSubtitle"),
    calibrationIndex: document.getElementById("calibrationIndex"),
    calibrationToken: document.getElementById("calibrationToken"),
    calibrationImg: document.getElementById("calibrationImg"),
    calibrationPrevBtn: document.getElementById("calibrationPrevBtn"),
    calibrationEditBtn: document.getElementById("calibrationEditBtn"),
    calibrationNextBtn: document.getElementById("calibrationNextBtn"),
    calibrationSkipBtn: document.getElementById("calibrationSkipBtn"),
    calibrationStatus: document.getElementById("calibrationStatus"),
    trumpOptions: document.getElementById("trumpOptions"),
    autoPanel: document.getElementById("autoPanel"),
    debugToggleAdvancedBtn: document.getElementById("debugToggleAdvancedBtn"),
		    debugCopyBtn: document.getElementById("debugCopyBtn"),
        debugClearMapBtn: document.getElementById("debugClearMapBtn"),
		    debugClearBtn: document.getElementById("debugClearBtn"),
		    debugStatus: document.getElementById("debugStatus"),
		    debugLog: document.getElementById("debugLog"),
	    unmappedTokens: document.getElementById("unmappedTokens"),
	    autoReadEnabledToggle: document.getElementById("autoReadEnabledToggle"),
	    autoReadSelector: document.getElementById("autoReadSelector"),
	    autoStartBtn: document.getElementById("autoStartBtn"),
    autoStopBtn: document.getElementById("autoStopBtn"),
    autoStatus: document.getElementById("autoStatus"),
    captureStartBtn: document.getElementById("captureStartBtn"),
    captureStopBtn: document.getElementById("captureStopBtn"),
    cancelMappingBtn: document.getElementById("cancelMappingBtn"),
    clearMappingBtn: document.getElementById("clearMappingBtn"),
    mappingCountPill: document.getElementById("mappingCountPill"),
    capturedToken: document.getElementById("capturedToken"),
    mappingStatus: document.getElementById("mappingStatus"),
    seenCount: document.getElementById("seenCount"),
    seenFilter: document.getElementById("seenFilter"),
	    seenList: document.getElementById("seenList"),
	    resetBtn: document.getElementById("resetBtn"),
	    resetBtnMain: document.getElementById("resetBtnMain"),
	    preventDuplicatesToggle: document.getElementById("preventDuplicatesToggle"),
	    exportBtn: document.getElementById("exportBtn"),
	    importBtn: document.getElementById("importBtn"),
    jsonArea: document.getElementById("jsonArea"),
    ioStatus: document.getElementById("ioStatus"),
  };

  /** @type {{seen: string[], preventDuplicates: boolean, autoReadEnabled: boolean, autoReadSelector: string, autoReadMap: Record<string, string>, deckIndexSamples: Record<string, string>, deckIndexConfig: any, deckAssetOrigin: string, deckAssetBasePath: string, deckAssetExt: string, cardImageById: Record<string, string>, trumpSuit: string, pendingMappingToken: string|null, filter: string, cardRatio: number|null}} */
  const state = {
    seen: [],
    preventDuplicates: true,
    autoReadEnabled: false,
    autoReadSelector: "",
    autoReadMap: {},
    deckIndexSamples: {},
    deckIndexConfig: null,
    deckAssetOrigin: "",
    deckAssetBasePath: "",
    deckAssetExt: "png",
    cardImageById: {},
    trumpSuit: "",
    pendingMappingToken: null,
    filter: "",
    cardRatio: null,
  };

  document.documentElement.style.setProperty("--seen-disappear-ms", `${SEEN_DISAPPEAR_MS}ms`);
  document.documentElement.style.setProperty("--appear-ms", `${APPEAR_MS}ms`);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {Map<string, {btn: HTMLButtonElement, badge: HTMLSpanElement, img: HTMLImageElement, text: HTMLSpanElement}>} */
  const deckUiById = new Map();
  /** @type {Map<string, HTMLDivElement>} */
  const suitColsByKey = new Map();
  let deckResizeObserver = null;
  let lastDeckSize = { width: 0, height: 0 };
  const reflowAnimations = new Map();
  const pendingRemovals = new Set();
  const appearTimers = new Map();

		  const debug = {
		    lines: [],
		    maxLines: 200,
		    lastStatus: "",
		    lastInjectErrorAt: 0,
		    lastInjectError: "",
	    lastOverlayVisible: false,
	    lastTokensSignature: "",
	    lastScriptVersion: "",
	    lastNoMapHintAt: 0,
	  };

	  const calibration = {
	    active: false,
	    origin: "",
	    basePath: "",
	    ext: "png",
	    deckName: "",
	    index: 1,
	    max: 32,
	    loading: false,
	  };

	  function formatTime(ts) {
	    try {
	      return new Date(ts).toLocaleTimeString([], { hour12: false });
    } catch {
      return "";
    }
  }

  function setDebugStatus(text) {
    debug.lastStatus = text;
    els.debugStatus.textContent = text;
  }

  function logDebug(message) {
    const line = `${formatTime(Date.now())} ${message}`;
    debug.lines.push(line);
    if (debug.lines.length > debug.maxLines) debug.lines.splice(0, debug.lines.length - debug.maxLines);
    els.debugLog.textContent = debug.lines.join("\n");
  }

	  function setCalibrationStatus(message, kind) {
	    if (!els.calibrationStatus) return;
	    setStatus(els.calibrationStatus, message || "", kind);
	  }

	  function deriveTokenKeys(token) {
	    const raw = String(token || "").trim();
	    if (!raw) return [];
	    const noQuery = raw.split(/[?#]/)[0];
	    const keys = [raw];
	    if (noQuery && noQuery !== raw) keys.push(noQuery);
	    if (noQuery && noQuery.includes("/shadow/")) keys.push(noQuery.replace("/shadow/", "/"));
	    const deckTail = (noQuery || raw).match(/(deck_[^/]+\/[^/]+)$/);
	    if (deckTail && deckTail[1]) keys.push(deckTail[1]);
	    return Array.from(new Set(keys));
	  }

	  function isTokenMapped(token) {
	    const keys = deriveTokenKeys(token);
	    for (const k of keys) {
	      const v = state.autoReadMap && state.autoReadMap[k];
	      if (v && CARD_BY_ID.has(v)) return true;
	    }
	    return false;
	  }

  function buildDeckTokenPath(index) {
	    if (!calibration.basePath) return null;
	    const i = Number(index);
	    if (!Number.isFinite(i) || i < 1 || i > calibration.max) return null;
	    return `${calibration.basePath}${i}.${calibration.ext || "png"}`;
	  }

	  function findNextUnmappedIndex(from, direction) {
	    const dir = direction === -1 ? -1 : 1;
	    let i = Number(from);
	    if (!Number.isFinite(i)) i = 1;
	    for (let step = 0; step < calibration.max; step++) {
	      if (i < 1) i = calibration.max;
	      if (i > calibration.max) i = 1;
	      const token = buildDeckTokenPath(i);
	      if (token && !isTokenMapped(token)) return i;
	      i += dir;
	    }
	    return null;
	  }

	  function updateCalibrationUi() {
	    if (!els.calibrationPanel) return;
	    els.calibrationPanel.hidden = !calibration.active;
    if (els.calibrateBtn) els.calibrateBtn.textContent = calibration.active ? "Calibrare…" : "Calibrare";
	  }

	  function setCalibrationPendingToken(token) {
	    state.pendingMappingToken = token || null;
	    updateMappingUi();
	    if (els.calibrationToken) {
	      els.calibrationToken.textContent = token ? token.split("/").slice(-3).join("/") : "";
	    }
	  }

	  function loadCalibrationImage(index) {
	    const token = buildDeckTokenPath(index);
	    if (!token) {
      setCalibrationStatus("Nu există token pentru pachet.", "err");
	      return;
	    }
	    setCalibrationPendingToken(token);
	    if (els.calibrationIndex) els.calibrationIndex.textContent = `${index}/${calibration.max}`;
    setCalibrationStatus("Încarc imaginea…", undefined);

	    if (!calibration.origin) {
      setCalibrationStatus("Nu există origine (deschide tab‑ul cu jocul).", "err");
	      return;
	    }
	    const url = `${calibration.origin}${token}`;
	    calibration.loading = true;
	    executeInActiveTab(belotAutoTrackerContentFetchImageDataUrl, [{ url }], (err, res) => {
	      calibration.loading = false;
	      if (err) {
        setCalibrationStatus(`Previzualizare eșuată: ${err.message}`, "err");
	        if (els.calibrationImg) els.calibrationImg.removeAttribute("src");
	        return;
	      }
	      if (!res || typeof res !== "object" || !res.ok) {
          const msg = res && typeof res.error === "string" ? res.error : "necunoscut";
        setCalibrationStatus(`Previzualizare eșuată: ${msg}`, "err");
	        if (els.calibrationImg) els.calibrationImg.removeAttribute("src");
	        return;
	      }
	      if (els.calibrationImg) els.calibrationImg.src = res.dataUrl;
      if (res && typeof res.width === "number" && typeof res.height === "number") {
        maybeUpdateCardRatioFromSize(res.width, res.height);
      }
      setCalibrationStatus("Apasă cartea corectă din grilă.", "ok");
	    });
	  }

  function openCalibration() {
    calibration.active = true;
    updateCalibrationUi();
    setCalibrationStatus("Detectez pachetul…", undefined);

	    executeInActiveTab(
	      belotAutoTrackerContentGetDeckAssetPattern,
	      [{ selector: FIXED_AUTO_READ_SELECTOR }],
	      (err, info) => {
	        if (err) {
          setCalibrationStatus(`Detectare eșuată: ${err.message}`, "err");
	          return;
	        }
	        if (!info || typeof info !== "object" || !info.ok) {
          const msg = info && typeof info.error === "string" ? info.error : "necunoscut";
	          setCalibrationStatus(msg, "err");
	          return;
	        }

        calibration.origin = String(info.origin || "");
        calibration.basePath = String(info.basePath || "");
        calibration.deckName = String(info.deckName || "");
        calibration.ext = String(info.ext || "png");
        if (calibration.origin && calibration.origin !== state.deckAssetOrigin) {
          state.deckAssetOrigin = calibration.origin;
          persist({ deckAssetOrigin: state.deckAssetOrigin });
          updateDeckImages();
        }
        if (calibration.basePath && calibration.basePath !== state.deckAssetBasePath) {
          state.deckAssetBasePath = calibration.basePath;
          persist({ deckAssetBasePath: state.deckAssetBasePath });
          updateDeckImages();
        }
        if (calibration.ext && calibration.ext !== state.deckAssetExt) {
          state.deckAssetExt = calibration.ext;
          persist({ deckAssetExt: state.deckAssetExt });
          updateDeckImages();
        }
        if (els.calibrationSubtitle) {
          els.calibrationSubtitle.textContent = `Pachet: ${calibration.deckName || "?"} • mapează 1..${calibration.max}`;
        }

	        const next = findNextUnmappedIndex(1, 1) ?? 1;
	        calibration.index = next;
	        loadCalibrationImage(calibration.index);
	      },
	    );
	  }

	  function closeCalibration() {
	    calibration.active = false;
	    updateCalibrationUi();
	    if (els.calibrationImg) els.calibrationImg.removeAttribute("src");
	    if (els.calibrationToken) els.calibrationToken.textContent = "";
	    if (els.calibrationIndex) els.calibrationIndex.textContent = "—";
	    setCalibrationPendingToken(null);
	    setCalibrationStatus("", undefined);
	  }

	  function advanceCalibration(direction) {
	    const next = findNextUnmappedIndex(calibration.index + (direction === -1 ? -1 : 1), direction);
	    if (next == null) {
      logDebug("Calibrare completă (toate cele 32 mapate).");
      setCalibrationStatus("Gata! Toate cele 32 mapate. Bifarea automată e corectă.", "ok");
	      setCalibrationPendingToken(null);
	      return;
	    }
	    calibration.index = next;
	    loadCalibrationImage(calibration.index);
	  }

  function initDeckGrid() {
    els.deckGrid.textContent = "";
    deckUiById.clear();
    suitColsByKey.clear();

    for (const suit of SUITS) {
      const col = document.createElement("div");
      col.className = "deck-col";
      col.dataset.suit = suit.key;

      const suitLabel = document.createElement("div");
      suitLabel.className = "suit-label";
      suitLabel.textContent = suit.symbol;
      suitLabel.title = suit.name;
      col.appendChild(suitLabel);
      suitColsByKey.set(suit.key, col);

      for (const rank of RANKS) {
        const id = `${suit.key}${rank.key}`;
        const card = CARD_BY_ID.get(id);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "card-btn";
        btn.dataset.cardId = id;
        btn.setAttribute("aria-label", card ? `Adaugă ${card.label}` : `Adaugă ${id}`);

        const img = document.createElement("img");
        img.className = "card-img";
        img.alt = card ? card.label : id;
        img.loading = "lazy";
        img.decoding = "async";
        btn.appendChild(img);

        const text = document.createElement("span");
        text.className = "card-text";
        text.textContent = rank.label;
        btn.appendChild(text);

        const badge = document.createElement("span");
        badge.className = "badge";
        badge.hidden = true;
        btn.appendChild(badge);

        col.appendChild(btn);
        deckUiById.set(id, { btn, badge, img, text });
      }

      els.deckGrid.appendChild(col);
    }
  }

  function updateRemaining(uniqueSeenIds) {
    const totalRemaining = Math.max(0, 32 - uniqueSeenIds.length);
    els.remainingTotal.textContent = String(totalRemaining);

    els.suitBreakdown.textContent = "";
    for (const suit of SUITS) {
      const seenInSuit = uniqueSeenIds.reduce((acc, id) => {
        const card = CARD_BY_ID.get(id);
        return acc + (card && card.suitKey === suit.key ? 1 : 0);
      }, 0);
      const left = Math.max(0, 8 - seenInSuit);

      const pill = document.createElement("div");
      pill.className = "suit-pill";

      const leftSuit = document.createElement("div");
      leftSuit.className = "suit";
      leftSuit.textContent = suit.symbol;

      const rightCount = document.createElement("div");
      rightCount.className = "count";
      rightCount.textContent = `${left} rămase`;

      pill.appendChild(leftSuit);
      pill.appendChild(rightCount);
      els.suitBreakdown.appendChild(pill);
    }
  }

  function animateReflow(items, firstRects) {
    if (prefersReducedMotion) return;
    for (const btn of items) {
      const first = firstRects.get(btn);
      if (!first) continue;
      const last = btn.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const prev = reflowAnimations.get(btn);
      if (prev) prev.cancel();
      const anim = btn.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: REFLOW_MS, easing: REFLOW_EASING, fill: "both" }
      );
      anim.onfinish = () => reflowAnimations.delete(btn);
      anim.oncancel = () => reflowAnimations.delete(btn);
      reflowAnimations.set(btn, anim);
    }
  }

  function collapseCardWithReflow(btn) {
    if (!btn) return;
    const col = btn.closest(".deck-col");
    if (!col) {
      btn.classList.add("seen-gone");
      return;
    }
    const stay = Array.from(col.querySelectorAll(".card-btn")).filter(
      (b) => !b.classList.contains("seen-gone") && b !== btn
    );
    const firstRects = new Map();
    for (const b of stay) {
      firstRects.set(b, b.getBoundingClientRect());
    }
    btn.classList.add("seen-gone");
    requestAnimationFrame(() => {
      animateReflow(stay, firstRects);
    });
  }

  function triggerAppear(btn, delayMs) {
    if (!btn || prefersReducedMotion) return;
    const prev = reflowAnimations.get(btn);
    if (prev) prev.cancel();
    const timer = appearTimers.get(btn);
    if (timer) clearTimeout(timer);
    btn.classList.remove("appear");
    btn.style.setProperty("--appear-delay", `${delayMs}ms`);
    // Force reflow so animation restarts.
    void btn.offsetWidth;
    btn.classList.add("appear");
    appearTimers.set(
      btn,
      setTimeout(() => {
        btn.classList.remove("appear");
        appearTimers.delete(btn);
      }, APPEAR_MS + delayMs + 50),
    );
  }

  function getAppearDelayForId(id) {
    const card = CARD_BY_ID.get(id);
    if (!card) return 0;
    return card.rankOrder * APPEAR_STAGGER_MS;
  }

  function updateDeckBadges(seenCounts) {
    for (const [id, ui] of deckUiById.entries()) {
      const count = seenCounts.get(id) ?? 0;
      const prev = lastSeenCounts.get(id) ?? 0;
      const timers = flashTimers.get(id);
      const wasHidden = ui.btn.classList.contains("seen-gone") || ui.btn.classList.contains("seen-hidden");

      ui.badge.hidden = true;
      ui.badge.textContent = "";

      if (count <= 0) {
        if (timers) {
          clearTimeout(timers.remove);
          flashTimers.delete(id);
        }
        pendingRemovals.delete(id);
        ui.btn.classList.remove("seen-flash");
        ui.btn.classList.remove("seen-hidden");
        ui.btn.classList.remove("seen-gone");
        if (prev > 0 || wasHidden) {
          triggerAppear(ui.btn, getAppearDelayForId(id));
        }
        lastSeenCounts.set(id, 0);
        continue;
      }

      if (count > prev) {
        if (timers) {
          clearTimeout(timers.remove);
          flashTimers.delete(id);
        }
        pendingRemovals.add(id);
        ui.btn.classList.add("seen-flash");
        ui.btn.classList.add("seen-hidden");
        ui.btn.classList.remove("seen-gone");
        ui.btn.classList.remove("appear");
        const remove = setTimeout(() => {
          ui.btn.classList.remove("seen-flash");
          pendingRemovals.delete(id);
          collapseCardWithReflow(ui.btn);
        }, SEEN_DISAPPEAR_MS);
        flashTimers.set(id, { remove });
      } else {
        ui.btn.classList.remove("seen-flash");
        ui.btn.classList.add("seen-hidden");
        if (!pendingRemovals.has(id)) {
          ui.btn.classList.add("seen-gone");
        }
      }
      lastSeenCounts.set(id, count);
    }
  }

  function scoreTokenForImage(token) {
    const t = String(token || "");
    let score = 0;
    if (t.startsWith("http://") || t.startsWith("https://")) score += 3;
    if (t.startsWith("/")) score += 2;
    if (t.includes("/static/")) score += 2;
    if (t.split("/").length > 3) score += 1;
    if (/\/deck_\d+\/\d+\.(png|jpe?g|webp|svg)$/i.test(t)) score += 4;
    if (/^deck_\d+\//i.test(t)) score -= 2;
    if (!t.includes("/shadow/")) score += 2;
    if (t.includes("/shadow/")) score -= 1;
    return score;
  }

  function isDeckConfigComplete(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    if (!Array.isArray(cfg.suitOrder) || !Array.isArray(cfg.rankOrder)) return false;
    if (cfg.suitOrder.length !== 4 || cfg.rankOrder.length !== 8) return false;
    if (!cfg.suitOrder.every((s) => isValidSuitKey(s))) return false;
    if (!cfg.rankOrder.every((r) => isValidRankKey(r))) return false;
    return true;
  }

const DEFAULT_DECK_CONFIG = {
  mode: "suitMajor",
  base: 1,
  suitOrder: ["S", "H", "D", "C"],
  rankOrder: ["7", "8", "9", "10", "J", "Q", "K", "A"],
};

// Ordine personalizată (din tabelul deck_1). Coloane: doba=♦, rosu=♥, cruce=♣, verde=♠.
const CUSTOM_DECK_INDEX_MAP = {
  D7: 25,
  D8: 26,
  D9: 1,
  D10: 2,
  DJ: 3,
  DQ: 4,
  DK: 5,
  DA: 6,
  H7: 27,
  H8: 28,
  H9: 7,
  H10: 8,
  HJ: 9,
  HQ: 10,
  HK: 11,
  HA: 12,
  C7: 29,
  C8: 30,
  C9: 13,
  C10: 14,
  CJ: 15,
  CQ: 16,
  CK: 17,
  CA: 18,
  S7: 31,
  S8: 32,
  S9: 19,
  S10: 20,
  SJ: 21,
  SQ: 22,
  SK: 23,
  SA: 24,
};

const DECK1_INDEX_TO_CARD = {
  1: "D9",
  2: "D10",
  3: "DJ",
  4: "DQ",
  5: "DK",
  6: "DA",
  7: "H9",
  8: "H10",
  9: "HJ",
  10: "HQ",
  11: "HK",
  12: "HA",
  13: "C9",
  14: "C10",
  15: "CJ",
  16: "CQ",
  17: "CK",
  18: "CA",
  19: "S9",
  20: "S10",
  21: "SJ",
  22: "SQ",
  23: "SK",
  24: "SA",
  25: "D7",
  26: "D8",
  27: "H7",
  28: "H8",
  29: "C7",
  30: "C8",
  31: "S7",
  32: "S8",
};

function mapDeck1Token(token) {
  if (!token) return null;
  const s = String(token).split(/[?#]/)[0];
  const m = s.match(/(?:^|\/)deck_1\/(\d+)\.(?:png|jpe?g|webp|svg)$/i);
  if (!m || !m[1]) return null;
  const num = Number.parseInt(m[1], 10);
  if (!Number.isFinite(num)) return null;
  return DECK1_INDEX_TO_CARD[num] || null;
}

function buildAutoMapForDeck(basePath, ext) {
  const out = {};
  const safeBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const deckName = safeBase.split("/").filter(Boolean).pop() || "";
  const altBase = safeBase.includes("/shadow/") ? safeBase.replace("/shadow/", "/") : "";

  for (const [idxStr, cardId] of Object.entries(DECK1_INDEX_TO_CARD)) {
    if (!cardId) continue;
    const idx = Number.parseInt(idxStr, 10);
    if (!Number.isFinite(idx)) continue;
    const file = `${idx}.${ext || "png"}`;
    const full = `${safeBase}${file}`;
    out[full] = cardId;
    if (deckName) out[`${deckName}/${file}`] = cardId;
    if (altBase) out[`${altBase}${file}`] = cardId;
    out[String(idx)] = cardId;
  }
  return out;
}

function autoCalibrateFromDeckAsset(state, persistFn, quiet = false) {
  if (!state || !state.deckAssetBasePath) return false;
  const existingCount = Object.keys(state.autoReadMap || {}).length;
  if (existingCount >= 32) return false;
  const ext = state.deckAssetExt || "png";
  const nextMap = buildAutoMapForDeck(state.deckAssetBasePath, ext);
  // Preserve any existing mappings, but fill missing.
  state.autoReadMap = { ...nextMap, ...state.autoReadMap };
  state.deckIndexSamples = { ...DECK1_INDEX_TO_CARD };
  if (typeof persistFn === "function") {
    persistFn({
      autoReadMap: state.autoReadMap,
      deckIndexSamples: state.deckIndexSamples,
    });
  }
  if (!quiet && typeof logDebug === "function") {
    logDebug("Auto-calibrare completă (mapare deck_1 aplicată).");
  }
  return true;
}

function getCustomDeckIndex(cardId) {
  if (!cardId) return null;
  const idx = CUSTOM_DECK_INDEX_MAP[String(cardId)];
  return Number.isFinite(idx) ? idx : null;
}

function resolveDeckIndex(cardId) {
  const custom = getCustomDeckIndex(cardId);
  if (custom != null) return custom;
  return cardIdToIndex(cardId, DEFAULT_DECK_CONFIG);
}

  function cardIdToIndex(cardId, cfg) {
    if (!cardId || !cfg) return null;
    const suit = cardId[0];
    const rank = cardId.slice(1);
    const suitPos = cfg.suitOrder.indexOf(suit);
    const rankPos = cfg.rankOrder.indexOf(rank);
    if (suitPos < 0 || rankPos < 0) return null;
    const base = cfg.base === 0 ? 0 : 1;
    if (cfg.mode === "rankMajor") {
      return base + rankPos * 4 + suitPos;
    }
    return base + suitPos * 8 + rankPos;
  }

  function deriveFromDeckTokenWithConfigLocal(token, cfg) {
    if (!token || !cfg) return null;
    const num = parseDeckIndexFromToken(token);
    if (num == null) return null;
    const base = cfg.base === 0 ? 0 : 1;
    const i = num - base;
    if (i < 0 || i >= 32) return null;
    let suitPos = 0;
    let rankPos = 0;
    if (cfg.mode === "rankMajor") {
      suitPos = i % 4;
      rankPos = Math.floor(i / 4);
    } else {
      suitPos = Math.floor(i / 8);
      rankPos = i % 8;
    }
    const suit = Array.isArray(cfg.suitOrder) ? cfg.suitOrder[suitPos] : null;
    const rank = Array.isArray(cfg.rankOrder) ? cfg.rankOrder[rankPos] : null;
    if (!suit || !rank) return null;
    const id = `${suit}${rank}`;
    return CARD_BY_ID.has(id) ? id : null;
  }

  function lookupTokenToCardId(token) {
    if (!token) return null;
    const keys = deriveTokenKeys(token);
    for (const k of keys) {
      const v = state.autoReadMap && state.autoReadMap[k];
      if (v && CARD_BY_ID.has(v)) return v;
    }
    for (const k of keys) {
      const derived = state.deckIndexConfig ? deriveFromDeckTokenWithConfigLocal(k, state.deckIndexConfig) : null;
      if (derived && CARD_BY_ID.has(derived)) return derived;
    }
    return null;
  }

  function resolveCardImageUrl(token) {
    if (!token) return null;
    const t = String(token);
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    if (!state.deckAssetOrigin) return null;
    if (/^deck_\d+\//i.test(t)) {
      const file = t.split("/").pop();
      if (file && state.deckAssetBasePath) {
        return `${state.deckAssetOrigin}${state.deckAssetBasePath}${file}`;
      }
    }
    try {
      return new URL(t, state.deckAssetOrigin).toString();
    } catch {
      return null;
    }
  }

  function inferDeckAssetFromMap() {
    if (state.deckAssetBasePath && state.deckAssetOrigin) return;
    const entries = Object.keys(state.autoReadMap || {});
    for (const raw of entries) {
      const token = String(raw);
      const noQuery = token.split(/[?#]/)[0];
      const fullMatch = noQuery.match(/^(https?:\/\/[^/]+)(\/.*\/)(deck_\d+)\/(\d+)\.(png|jpe?g|webp|svg)$/i);
      if (fullMatch) {
        const origin = fullMatch[1];
        const baseDir = fullMatch[2];
        const deckName = fullMatch[3];
        const ext = fullMatch[5];
        if (!state.deckAssetOrigin) state.deckAssetOrigin = origin;
        if (!state.deckAssetBasePath) state.deckAssetBasePath = `${baseDir}${deckName}/`;
        if (ext && (!state.deckAssetExt || state.deckAssetExt === "png")) state.deckAssetExt = ext;
        persist({
          deckAssetOrigin: state.deckAssetOrigin,
          deckAssetBasePath: state.deckAssetBasePath,
          deckAssetExt: state.deckAssetExt,
        });
        return;
      }

      const pathMatch = noQuery.match(/^(.*\/)(deck_\d+)\/(\d+)\.(png|jpe?g|webp|svg)$/i);
      if (pathMatch) {
        const baseDir = pathMatch[1];
        const deckName = pathMatch[2];
        const ext = pathMatch[4];
        if (!state.deckAssetBasePath) state.deckAssetBasePath = `${baseDir}${deckName}/`;
        if (ext && (!state.deckAssetExt || state.deckAssetExt === "png")) state.deckAssetExt = ext;
        persist({ deckAssetBasePath: state.deckAssetBasePath, deckAssetExt: state.deckAssetExt });
        return;
      }
    }
  }

  function mergeCardImageCacheFromMap(force) {
    const next = force ? {} : { ...(state.cardImageById || {}) };
    let changed = false;
    for (const [token, cardId] of Object.entries(state.autoReadMap || {})) {
      if (!CARD_BY_ID.has(cardId)) continue;
      if (!force && next[cardId]) continue;
      const url = resolveCardImageUrl(token);
      if (!url) continue;
      next[cardId] = url;
      changed = true;
    }
    if (!changed) return;
    state.cardImageById = next;
    persist({ cardImageById: state.cardImageById });
  }

  function ensureCardImageCacheFromConfig() {
    if (hasAnyDeckSamples(state.deckIndexSamples)) return;
    if (!state.deckAssetOrigin || !state.deckAssetBasePath) return;
    const next = { ...(state.cardImageById || {}) };
    let changed = false;
    const ext = state.deckAssetExt || "png";
    for (const card of DECK) {
      if (next[card.id]) continue;
      const idx = resolveDeckIndex(card.id);
      if (idx == null) continue;
      const token = `${state.deckAssetBasePath}${idx}.${ext}`;
      const url = resolveCardImageUrl(token);
      if (!url) continue;
      next[card.id] = url;
      changed = true;
    }
    if (!changed) return;
    state.cardImageById = next;
    persist({ cardImageById: state.cardImageById });
  }

  function mergeCardImageCacheFromSamples(force) {
    if (!state.deckAssetOrigin || !state.deckAssetBasePath) return;
    const samples = sanitizeDeckIndexSamples(state.deckIndexSamples);
    const next = force ? {} : { ...(state.cardImageById || {}) };
    let changed = false;
    for (const [idx, cardId] of Object.entries(samples)) {
      if (!CARD_BY_ID.has(cardId)) continue;
      if (!force && next[cardId]) continue;
      const ext = state.deckAssetExt || "png";
      const token = `${state.deckAssetBasePath}${idx}.${ext}`;
      const url = resolveCardImageUrl(token);
      if (!url) continue;
      next[cardId] = url;
      changed = true;
    }
    if (!changed) return;
    state.cardImageById = next;
    persist({ cardImageById: state.cardImageById });
  }

  function buildCardImageMap() {
    /** @type {Record<string, {token: string, score: number}>} */
    const bestById = {};
    for (const [cardId, url] of Object.entries(state.cardImageById || {})) {
      if (!CARD_BY_ID.has(cardId)) continue;
      if (typeof url !== "string" || !url) continue;
      bestById[cardId] = { token: url, score: 100 };
    }
    for (const [token, cardId] of Object.entries(state.autoReadMap || {})) {
      if (!CARD_BY_ID.has(cardId)) continue;
      if (!/deck_\d+\/\d+\.(png|jpe?g|webp|svg)$/i.test(token)) continue;
      const score = scoreTokenForImage(token);
      const prev = bestById[cardId];
      if (!prev || score > prev.score) bestById[cardId] = { token, score };
    }

    const cfg = DEFAULT_DECK_CONFIG;

    if (cfg && state.deckAssetBasePath) {
      for (const card of DECK) {
        if (bestById[card.id]) continue;
        const idx = resolveDeckIndex(card.id);
        if (idx == null) continue;
        const ext = state.deckAssetExt || "png";
        const token = `${state.deckAssetBasePath}${idx}.${ext}`;
        bestById[card.id] = { token, score: 2 };
      }
    }
    return bestById;
  }

  function maybeUpdateCardRatioFromSize(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const ratio = w / h;
    if (!Number.isFinite(ratio) || ratio < 0.5 || ratio > 0.85) return;
    if (!state.cardRatio || Math.abs(state.cardRatio - ratio) > 0.02) {
      state.cardRatio = ratio;
      updateDeckSizing();
    }
  }

  function updateDeckImages() {
    inferDeckAssetFromMap();
    const mapCount = Object.keys(state.autoReadMap || {}).length;
    mergeCardImageCacheFromMap(mapCount >= 32);
    const completeSamples = isDeckSamplesComplete(state.deckIndexSamples);
    mergeCardImageCacheFromSamples(completeSamples);
    ensureCardImageCacheFromConfig();
    const best = buildCardImageMap();
    for (const [id, ui] of deckUiById.entries()) {
      const hadImg = Boolean(ui.img.getAttribute("src"));
      const entry = best[id];
      const url = entry ? resolveCardImageUrl(entry.token) : null;
      if (url) {
        ui.img.src = url;
        ui.img.hidden = false;
        ui.btn.classList.add("has-img");
        if (!hadImg) {
          triggerAppear(ui.btn, getAppearDelayForId(id));
        }
        if (!ui.img.dataset.ratioBound) {
          ui.img.dataset.ratioBound = "1";
          ui.img.addEventListener("load", () => {
            maybeUpdateCardRatioFromSize(ui.img.naturalWidth, ui.img.naturalHeight);
          });
        }
      } else {
        ui.img.removeAttribute("src");
        ui.img.hidden = true;
        ui.btn.classList.remove("has-img");
      }
    }
    updateDeckSizing();
  }

  function applyDeckSizing(width, height, force = false) {
    if (!els.deckGrid) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    if (
      !force &&
      Math.abs(width - lastDeckSize.width) < 0.5 &&
      Math.abs(height - lastDeckSize.height) < 0.5
    ) {
      return;
    }
    lastDeckSize = { width, height };

    const compact = height < 620;
    const gapX = clampNumber(width * 0.02, compact ? 4 : 6, compact ? 8 : 12);
    const gapY = clampNumber(height * 0.008, compact ? 2 : 3, compact ? 4 : 6);
    const colPad = clampNumber(height * 0.01, compact ? 2 : 3, compact ? 5 : 7);
    const suitSize = clampNumber(height * 0.028, compact ? 14 : 16, compact ? 20 : 24);
    const panelPad = clampNumber(height * 0.02, compact ? 4 : 6, compact ? 8 : 10);
    const appPad = clampNumber(height * 0.02, compact ? 4 : 6, compact ? 8 : 10);
    const trumpSize = clampNumber(height * 0.03, compact ? 20 : 22, compact ? 26 : 30);

    document.documentElement.style.setProperty("--panel-pad", `${panelPad}px`);
    document.documentElement.style.setProperty("--app-pad", `${appPad}px`);
    document.documentElement.style.setProperty("--trump-size", `${trumpSize}px`);

    const ratio = state.cardRatio || DEFAULT_CARD_RATIO;
    const colWidth = (width - gapX * (DECK_COLS - 1)) / DECK_COLS - colPad * 2;
    const cardHFromWidth = colWidth / ratio;
    const labelH = suitSize + 4;
    const available = height - colPad * 2 - labelH - gapY * (DECK_ROWS - 1);
    const cardHFromHeight = available / DECK_ROWS;

    let cardH = Math.floor(Math.min(cardHFromWidth, cardHFromHeight));
    cardH = clampNumber(cardH, compact ? 36 : 44, compact ? 86 : 110);
    const cardW = Math.floor(cardH * ratio);

    els.deckGrid.style.setProperty("--card-h", `${cardH}px`);
    els.deckGrid.style.setProperty("--card-w", `${cardW}px`);
    els.deckGrid.style.setProperty("--gap-x", `${gapX}px`);
    els.deckGrid.style.setProperty("--gap-y", `${gapY}px`);
    els.deckGrid.style.setProperty("--col-pad", `${colPad}px`);
    els.deckGrid.style.setProperty("--suit-size", `${suitSize}px`);
  }

  function updateDeckSizing(force = false) {
    if (!els.deckGrid) return;
    const rect = els.deckGrid.getBoundingClientRect();
    applyDeckSizing(rect.width, rect.height, force);
  }

  function initDeckResizeObserver() {
    if (!els.deckGrid) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", () => updateDeckSizing());
      updateDeckSizing(true);
      return;
    }
    if (deckResizeObserver) deckResizeObserver.disconnect();
    deckResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        applyDeckSizing(width, height);
      }
    });
    deckResizeObserver.observe(els.deckGrid);
    updateDeckSizing(true);
  }

  function buildSeenSearchIndex(card) {
    return [
      card.id,
      card.label,
      card.suitSymbol,
      card.suitName,
      ...card.suitAliases,
      card.rankLabel,
    ]
      .join(" ")
      .toLowerCase();
  }

  function updateSeenList(seenCounts, filterText) {
    const uniqueSeenIds = Array.from(seenCounts.keys()).sort(compareCardIds);

    const entriesCount = state.seen.length;
    const uniqueCount = uniqueSeenIds.length;
    els.seenCount.textContent =
      entriesCount === uniqueCount ? `${uniqueCount} cărți` : `${uniqueCount} unice • ${entriesCount} intrări`;

    const filter = filterText.trim().toLowerCase();
    const idsToShow =
      filter.length === 0
        ? uniqueSeenIds
        : uniqueSeenIds.filter((id) => {
            const card = CARD_BY_ID.get(id);
            if (!card) return false;
            return buildSeenSearchIndex(card).includes(filter);
          });

    els.seenList.textContent = "";
    if (idsToShow.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = filter ? "Nicio potrivire." : "Nicio carte văzută. Apasă cărțile de mai sus.";
      els.seenList.appendChild(empty);
      return;
    }

    for (const id of idsToShow) {
      const card = CARD_BY_ID.get(id);
      const count = seenCounts.get(id) ?? 0;
      if (!card || count <= 0) continue;

      const item = document.createElement("div");
      item.className = "seen-item";

      const left = document.createElement("div");
      left.className = "seen-left";

      const cardChip = document.createElement("div");
      cardChip.className = "seen-card";
      cardChip.textContent = card.label;

      const meta = document.createElement("div");
      meta.className = "seen-meta";
      meta.textContent = `${card.suitName} • ${card.rankLabel}`;

      left.appendChild(cardChip);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "seen-actions";

      if (count > 1) {
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.textContent = `x${count}`;
        actions.appendChild(pill);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "icon-btn";
      removeBtn.dataset.removeId = id;
      removeBtn.title = "Șterge una";
      removeBtn.textContent = "−";

      actions.appendChild(removeBtn);

      item.appendChild(left);
      item.appendChild(actions);
      els.seenList.appendChild(item);
    }
  }

  function render() {
    const seenCounts = countOccurrences(state.seen);
    const uniqueSeenIds = Array.from(seenCounts.keys()).sort(compareCardIds);
    updateRemaining(uniqueSeenIds);
    updateDeckBadges(seenCounts);
    updateSeenList(seenCounts, state.filter);
    updateDeckSizing();
  }

  function updateTrumpUi() {
    if (els.trumpOptions) {
      const btns = Array.from(els.trumpOptions.querySelectorAll("button[data-suit]"));
      for (const btn of btns) {
        const suit = btn.getAttribute("data-suit") || "";
        btn.classList.toggle("active", Boolean(state.trumpSuit && suit === state.trumpSuit));
      }
    }
    for (const [suitKey, col] of suitColsByKey.entries()) {
      col.classList.toggle("trump", Boolean(state.trumpSuit && suitKey === state.trumpSuit));
    }
  }

  const flashTimers = new Map();
  const lastSeenCounts = new Map();

  function persist(partial) {
    chrome.storage.local.set(partial, () => {
      // Ignore write errors in UI; extension still works in-memory.
    });
  }

  function updateMappingUi() {
    const count = Object.keys(state.autoReadMap || {}).length;
    els.mappingCountPill.textContent = `${count} mapate`;

    if (!state.pendingMappingToken) {
      els.capturedToken.hidden = true;
      els.capturedToken.textContent = "";
      return;
    }

    els.capturedToken.hidden = false;
    els.capturedToken.textContent = state.pendingMappingToken;
  }

  function setPendingMappingToken(token, statusMessage, statusKind) {
    state.pendingMappingToken = token || null;
    updateMappingUi();
    if (statusMessage != null) setStatus(els.mappingStatus, statusMessage, statusKind);
  }

  function parseDeckIndexFromToken(token) {
    if (!token) return null;
    const s = String(token).split(/[?#]/)[0];
    const m = s.match(/(?:^|\/)deck_\d+\/(\d+)\.(?:png|jpe?g|webp|svg)$/i);
    if (!m || !m[1]) return null;
    const num = Number.parseInt(m[1], 10);
    return Number.isFinite(num) ? num : null;
  }

  function isValidSuitKey(suitKey) {
    return typeof suitKey === "string" && ["S", "H", "D", "C"].includes(suitKey);
  }

  function isValidRankKey(rankKey) {
    return typeof rankKey === "string" && ["7", "8", "9", "10", "J", "Q", "K", "A"].includes(rankKey);
  }

  function sanitizeDeckIndexSamples(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [key, value] of Object.entries(raw)) {
      const num = Number.parseInt(String(key), 10);
      const cardId = String(value);
      if (!Number.isFinite(num)) continue;
      if (!CARD_BY_ID.has(cardId)) continue;
      out[String(num)] = cardId;
    }
    return out;
  }

  function hasAnyDeckSamples(samples) {
    return samples && typeof samples === "object" && Object.keys(samples).length > 0;
  }

  function isDeckSamplesComplete(samples) {
    if (!samples || typeof samples !== "object") return false;
    const ids = Object.values(samples).map(String).filter((id) => CARD_BY_ID.has(id));
    if (ids.length < 32) return false;
    return new Set(ids).size === 32;
  }

  function sanitizeCardImageById(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [key, value] of Object.entries(raw)) {
      const cardId = String(key);
      const url = String(value || "");
      if (!CARD_BY_ID.has(cardId)) continue;
      if (!url) continue;
      out[cardId] = url;
    }
    return out;
  }

  function mergeDeckIndexSamplesFromMap() {
    const next = { ...state.deckIndexSamples };
    let changed = false;
    for (const [token, cardId] of Object.entries(state.autoReadMap || {})) {
      if (!CARD_BY_ID.has(cardId)) continue;
      const idx = parseDeckIndexFromToken(token);
      if (idx == null) continue;
      const key = String(idx);
      if (next[key] && next[key] !== cardId) continue;
      if (!next[key]) {
        next[key] = cardId;
        changed = true;
      }
    }
    if (!changed) return;
    state.deckIndexSamples = next;
    persist({ deckIndexSamples: state.deckIndexSamples });
    refreshDeckIndexConfig();
  }

  function sanitizeDeckIndexConfig(raw) {
    if (!raw || typeof raw !== "object") return null;
    const mode = raw.mode;
    const base = raw.base;
    const suitOrder = raw.suitOrder;
    const rankOrder = raw.rankOrder;
    if (mode !== "rankMajor" && mode !== "suitMajor") return null;
    if (base !== 0 && base !== 1) return null;
    if (!Array.isArray(suitOrder) || suitOrder.length !== 4) return null;
    if (!Array.isArray(rankOrder) || rankOrder.length !== 8) return null;
    if (!suitOrder.every((s) => s == null || isValidSuitKey(s))) return null;
    if (!rankOrder.every((r) => r == null || isValidRankKey(r))) return null;
    return {
      mode,
      base,
      suitOrder: suitOrder.map((s) => (s == null ? null : String(s))),
      rankOrder: rankOrder.map((r) => (r == null ? null : String(r))),
    };
  }

  function inferDeckIndexConfigFromSamples(samplesByNum) {
    const samples = Object.entries(samplesByNum || {})
      .map(([n, cardId]) => ({ num: Number.parseInt(n, 10), cardId: String(cardId) }))
      .filter((s) => Number.isFinite(s.num) && CARD_BY_ID.has(s.cardId));

    if (samples.length === 0) return null;

    const candidates = [
      { mode: "rankMajor", base: 1 },
      { mode: "rankMajor", base: 0 },
      { mode: "suitMajor", base: 1 },
      { mode: "suitMajor", base: 0 },
    ].map((c) => ({ ...c, suitOrder: Array(4).fill(null), rankOrder: Array(8).fill(null), ok: true }));

    for (const cand of candidates) {
      for (const s of samples) {
        const i = s.num - (cand.base === 0 ? 0 : 1);
        if (i < 0 || i >= 32) {
          cand.ok = false;
          break;
        }

        let suitPos = 0;
        let rankPos = 0;
        if (cand.mode === "rankMajor") {
          suitPos = i % 4;
          rankPos = Math.floor(i / 4);
        } else {
          suitPos = Math.floor(i / 8);
          rankPos = i % 8;
        }

        const suit = s.cardId[0];
        const rank = s.cardId.slice(1);
        if (!isValidSuitKey(suit) || !isValidRankKey(rank)) continue;

        if (cand.suitOrder[suitPos] && cand.suitOrder[suitPos] !== suit) {
          cand.ok = false;
          break;
        }
        cand.suitOrder[suitPos] = suit;

        if (cand.rankOrder[rankPos] && cand.rankOrder[rankPos] !== rank) {
          cand.ok = false;
          break;
        }
        cand.rankOrder[rankPos] = rank;
      }
    }

    const valid = candidates.filter((c) => c.ok);
    if (valid.length !== 1) return null;
    const best = valid[0];
    return {
      mode: best.mode,
      base: best.base,
      suitOrder: best.suitOrder,
      rankOrder: best.rankOrder,
    };
  }

  function refreshDeckIndexConfig() {
    const inferred = inferDeckIndexConfigFromSamples(state.deckIndexSamples);
    if (!inferred) return false;
    const current = state.deckIndexConfig;
    const same =
      current &&
      current.mode === inferred.mode &&
      current.base === inferred.base &&
      JSON.stringify(current.suitOrder) === JSON.stringify(inferred.suitOrder) &&
      JSON.stringify(current.rankOrder) === JSON.stringify(inferred.rankOrder);
    if (same) return false;
    state.deckIndexConfig = inferred;
    persist({ deckIndexConfig: inferred });
    logDebug(`Config ordine pachet: mod=${inferred.mode} baza=${inferred.base}`);
    return true;
  }

  function addSeenId(id) {
    if (!id || !CARD_BY_ID.has(id)) return;
    if (state.preventDuplicates) {
      if (state.seen.includes(id)) return;
    }
    state.seen = [...state.seen, id];
    persist({ seen: state.seen });
    render();
  }

  function addSeenIds(ids) {
    const incoming = Array.isArray(ids) ? ids.map(String).filter((id) => CARD_BY_ID.has(id)) : [];
    if (incoming.length === 0) return;

    let next = state.seen;
    if (state.preventDuplicates) {
      const set = new Set(state.seen);
      const merged = [...state.seen];
      for (const id of incoming) {
        if (set.has(id)) continue;
        set.add(id);
        merged.push(id);
      }
      next = merged;
    } else {
      next = [...state.seen, ...incoming];
    }

    if (next.length === state.seen.length) return;
    state.seen = next;
    persist({ seen: state.seen });
    render();
  }

  function executeInActiveTab(func, args, done) {
    if (!chrome.tabs || !chrome.scripting) {
      done(new Error("Lipsesc API‑urile Chrome (tabs/scripting)."));
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || tab.id == null) {
        done(new Error("Nu există tab activ."));
        return;
      }

      chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }, (results) => {
        if (chrome.runtime.lastError) {
          done(new Error(chrome.runtime.lastError.message));
          return;
        }
        done(null, results && results[0] ? results[0].result : undefined);
      });
    });
  }

  function refreshActiveOrigin() {
    executeInActiveTab(
      () => location.origin,
      [],
      (err, origin) => {
        if (err) return;
        if (typeof origin !== "string" || !origin) return;
        if (!state.deckAssetOrigin) {
          state.deckAssetOrigin = origin;
          persist({ deckAssetOrigin: state.deckAssetOrigin });
          updateDeckImages();
        }
      },
    );
  }

  function refreshActiveBasePath() {
    executeInActiveTab(
      belotAutoTrackerContentGetDeckAssetPattern,
      [{ selector: FIXED_AUTO_READ_SELECTOR }],
      (err, info) => {
        if (err || !info || !info.ok) return;
        const basePath = String(info.basePath || "");
        const ext = String(info.ext || "png");
        const origin = String(info.origin || "");
        if (!basePath) return;
        const allowOverride = calibration.active;
        if (!state.deckAssetOrigin && origin) {
          state.deckAssetOrigin = origin;
          persist({ deckAssetOrigin: state.deckAssetOrigin });
        }
        if (!state.deckAssetBasePath || allowOverride) {
          if (basePath !== state.deckAssetBasePath) {
            state.deckAssetBasePath = basePath;
            persist({ deckAssetBasePath: state.deckAssetBasePath });
            updateDeckImages();
          }
        }
        if ((!state.deckAssetExt || state.deckAssetExt === "png") || allowOverride) {
          if (ext && ext !== state.deckAssetExt) {
            state.deckAssetExt = ext;
            persist({ deckAssetExt: state.deckAssetExt });
            updateDeckImages();
          }
        }
      },
    );
  }

  function startAutoRead(options) {
    const opts = options && typeof options === "object" ? options : {};
    const selector = FIXED_AUTO_READ_SELECTOR;
    const hint = selector ? `Pornesc… Selector: ${selector}` : "Pornesc… Fără selector (scanez toată pagina).";
    setStatus(els.autoStatus, hint, undefined);

	    executeInActiveTab(
      belotAutoTrackerContentStart,
      [{ selector, map: state.autoReadMap, scriptVersion: CONTENT_SCRIPT_VERSION }],
	      (err, res) => {
      if (err) {
        const msg = `Injectare auto‑citire eșuată: ${err.message}`;
        setDebugStatus(`eroareInjectare • ${msg}`);
        if (!opts.quiet || debug.lastInjectError !== err.message || Date.now() - debug.lastInjectErrorAt > 5000) {
          debug.lastInjectErrorAt = Date.now();
          debug.lastInjectError = err.message;
          logDebug(msg);
        }
        setStatus(
          els.autoStatus,
          `Nu pot porni pe acest tab. Deschide pagina jocului (nu chrome://). (${err.message})`,
          "err",
        );
        return;
      }

	        const selectorFound = res && typeof res === "object" ? Boolean(res.selectorFound) : false;
	        const restarted = res && typeof res === "object" ? Boolean(res.restarted) : false;
    const selectorInfo = selector
      ? `Selector: ${selector}${selectorFound ? "" : " (încă nu a fost găsit)"}`
      : "Fără selector";
        setStatus(els.autoStatus, `Auto‑citire rulează. ${selectorInfo}`, "ok");
        if (restarted) logDebug("Scanner repornit în tab (versiune nouă).");
      },
    );
  }

  function startCapture() {
    const selector = FIXED_AUTO_READ_SELECTOR;
    const hint = selector ? `Captură activă. Selector: ${selector}` : "Captură activă. Fără selector (toată pagina).";
    setStatus(els.mappingStatus, "Pornesc captura… Apasă o carte pe pagină.", undefined);

    executeInActiveTab(belotAutoTrackerContentCaptureStart, [{ selector }], (err, res) => {
      if (err) {
        setStatus(
          els.mappingStatus,
          `Nu pot captura pe acest tab. Deschide pagina jocului (nu chrome://). (${err.message})`,
          "err",
        );
        return;
      }

      const selectorFound = res && typeof res === "object" ? Boolean(res.selectorFound) : false;
      const extra = selector && !selectorFound ? " (selectorul încă nu e găsit)" : "";
      setStatus(
        els.mappingStatus,
        `${hint}${extra}. Acum apasă o carte; apoi apasă cartea corectă în grilă pentru mapare.`,
        "ok",
      );
    });
  }

  function stopCapture() {
    setStatus(els.mappingStatus, "Oprire captură…", undefined);
    executeInActiveTab(belotAutoTrackerContentCaptureStop, [], (err) => {
      if (err) {
      setStatus(els.mappingStatus, `Oprire captură eșuată: ${err.message}`, "err");
        return;
      }
      setStatus(els.mappingStatus, "Captură oprită.", undefined);
    });
  }

  function stopAutoRead() {
    setStatus(els.autoStatus, "Oprire…", undefined);
    executeInActiveTab(belotAutoTrackerContentStop, [], (err) => {
      if (err) {
      setStatus(els.autoStatus, `Oprire eșuată: ${err.message}`, "err");
        return;
      }
      setStatus(els.autoStatus, "Auto‑citire oprită.", undefined);
    });
  }

  function loadState() {
    chrome.storage.local.get(STORAGE_DEFAULTS, (items) => {
      if (chrome.runtime.lastError) {
        setStatus(els.ioStatus, `Eroare storage: ${chrome.runtime.lastError.message}`, "err");
        return;
      }

      state.preventDuplicates = true;
      state.seen = Array.isArray(items.seen) ? items.seen.map(String) : [];
      if (state.preventDuplicates) state.seen = dedupePreserveOrder(state.seen);
      state.seen = state.seen.filter((id) => CARD_BY_ID.has(id));

      state.autoReadEnabled = true;
      state.autoReadSelector = FIXED_AUTO_READ_SELECTOR;
      state.autoReadMap = {};
      if (items.autoReadMap && typeof items.autoReadMap === "object") {
        for (const [token, value] of Object.entries(items.autoReadMap)) {
          if (typeof token !== "string" || token.trim().length === 0) continue;
          const cardId = String(value);
          if (!CARD_BY_ID.has(cardId)) continue;
          state.autoReadMap[token] = cardId;
        }
      }
      inferDeckAssetFromMap();
      state.cardImageById = sanitizeCardImageById(items.cardImageById);
      mergeDeckIndexSamplesFromMap();
      mergeCardImageCacheFromMap(Object.keys(state.autoReadMap || {}).length >= 32);
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));

      state.deckIndexSamples = sanitizeDeckIndexSamples(items.deckIndexSamples);
      state.deckIndexConfig = sanitizeDeckIndexConfig(items.deckIndexConfig);
      state.deckAssetOrigin = typeof items.deckAssetOrigin === "string" ? items.deckAssetOrigin : "";
      state.deckAssetBasePath = typeof items.deckAssetBasePath === "string" ? items.deckAssetBasePath : "";
      state.deckAssetExt = typeof items.deckAssetExt === "string" ? items.deckAssetExt : "png";
      const didAutoCalibrate = autoCalibrateFromDeckAsset(state, persist, true);
      state.trumpSuit = typeof items.trumpSuit === "string" ? items.trumpSuit : "";
      if (!state.deckIndexConfig) {
        state.deckIndexConfig = inferDeckIndexConfigFromSamples(state.deckIndexSamples);
      }
      if (state.deckIndexConfig) {
        persist({ deckIndexConfig: state.deckIndexConfig });
      }

      state.pendingMappingToken = null;

      els.preventDuplicatesToggle.checked = state.preventDuplicates;
      els.autoReadEnabledToggle.checked = state.autoReadEnabled;
      els.autoReadSelector.value = state.autoReadSelector;
      updateMappingUi();
      updateDeckImages();
      if (didAutoCalibrate) {
        updateMappingUi();
      }
      updateTrumpUi();
      lastSeenCounts.clear();
      const initialCounts = countOccurrences(state.seen);
      for (const [id, count] of initialCounts.entries()) {
        lastSeenCounts.set(id, count);
      }
      render();

      persist({
        preventDuplicates: true,
        seen: state.seen,
        autoReadEnabled: true,
        autoReadSelector: FIXED_AUTO_READ_SELECTOR,
      });

      logDebug(`Încărcat. văzute=${state.seen.length} mapări=${Object.keys(state.autoReadMap).length}`);
      startAutoRead({ quiet: false });
      refreshActiveOrigin();
      refreshActiveBasePath();
      setInterval(() => {
        startAutoRead({ quiet: true });
        if (!state.deckAssetBasePath) refreshActiveBasePath();
        if (!state.deckAssetOrigin) refreshActiveOrigin();
      }, 1000);
    });
  }

  initDeckGrid();
  loadState();
  initDeckResizeObserver();

  if (els.calibrateBtn) {
    els.calibrateBtn.addEventListener("click", () => {
      if (calibration.active) {
        closeCalibration();
      } else {
        openCalibration();
      }
    });
  }

  if (els.calibrationCloseBtn) {
    els.calibrationCloseBtn.addEventListener("click", () => closeCalibration());
  }
  if (els.calibrationPrevBtn) {
    els.calibrationPrevBtn.addEventListener("click", () => advanceCalibration(-1));
  }
  if (els.calibrationEditBtn) {
    els.calibrationEditBtn.addEventListener("click", () => {
      const token = buildDeckTokenPath(calibration.index);
      if (!token) return;
      setCalibrationPendingToken(token);
      setCalibrationStatus("Selectează cartea corectă pentru această poziție.", "ok");
    });
  }
  if (els.calibrationNextBtn) {
    els.calibrationNextBtn.addEventListener("click", () => advanceCalibration(1));
  }
  if (els.calibrationSkipBtn) {
    els.calibrationSkipBtn.addEventListener("click", () => {
      logDebug("Calibrare: tokenul curent a fost sărit.");
      advanceCalibration(1);
    });
  }

  if (els.trumpOptions) {
    els.trumpOptions.addEventListener("click", (event) => {
      const target = /** @type {HTMLElement | null} */ (event.target);
      if (!target) return;
      const btn = target.closest("button[data-suit]");
      if (!btn) return;
      const suit = btn.getAttribute("data-suit") || "";
      if (!suit) return;
      state.trumpSuit = state.trumpSuit === suit ? "" : suit;
      persist({ trumpSuit: state.trumpSuit });
      updateTrumpUi();
    });
  }

  els.debugCopyBtn.addEventListener("click", async () => {
    const text = [debug.lastStatus, "", ...debug.lines].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      logDebug("Depanare copiată în clipboard.");
    } catch {
      logDebug("Copiere eșuată (clipboard blocat).");
    }
  });

  if (els.debugClearMapBtn) {
    els.debugClearMapBtn.addEventListener("click", () => {
      const ok = confirm("Ștergi maparea token → carte? (Va trebui să calibrezi din nou)");
      if (!ok) return;
      state.autoReadMap = {};
      state.deckIndexSamples = {};
      state.deckIndexConfig = null;
      state.cardImageById = {};
      persist({
        autoReadMap: state.autoReadMap,
        deckIndexSamples: state.deckIndexSamples,
        deckIndexConfig: null,
        cardImageById: state.cardImageById,
      });
      updateMappingUi();
      updateDeckImages();
      logDebug("Maparea a fost ștearsă.");
      if (state.autoReadEnabled) startAutoRead();
    });
  }

  els.debugClearBtn.addEventListener("click", () => {
    debug.lines = [];
    els.debugLog.textContent = "";
    setDebugStatus("");
  });

  els.debugToggleAdvancedBtn.addEventListener("click", () => {
    if (!els.autoPanel) return;
    const nextHidden = !els.autoPanel.hidden ? true : false;
    els.autoPanel.hidden = nextHidden;
    logDebug(nextHidden ? "Panou avansat ascuns." : "Panou avansat afișat.");
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "belot_auto_tracker/capture") return;
    const token = typeof message.token === "string" ? message.token : null;
    if (!token) return;

    const already = state.autoReadMap[token];
    if (already && CARD_BY_ID.has(already)) {
      const label = CARD_BY_ID.get(already).label;
      setPendingMappingToken(token, `Token capturat (deja mapat la ${label}). Apasă o carte pentru remapare.`, "ok");
    } else {
      setPendingMappingToken(token, "Token capturat. Acum apasă cartea corectă în grilă pentru mapare.", "ok");
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "belot_auto_tracker/cards") return;
    const cards = Array.isArray(message.cards) ? message.cards : [];
    if (cards.length === 0) return;
    addSeenIds(cards);
    logDebug(`Cărți aplicate: ${cards.map(String).join(", ")}`);
  });

	  chrome.runtime.onMessage.addListener((message) => {
	    if (!message || message.type !== "belot_auto_tracker/debug") return;
	    const selectorFound = Boolean(message.selectorFound);
	    const hasCards = Boolean(message.hasCards);
	    const paused = Boolean(message.paused);
	    const overlayVisible = Boolean(message.overlayVisible);
	    const imgCount = typeof message.imgCount === "number" ? message.imgCount : 0;
	    const mapKeys = typeof message.mapKeys === "number" ? message.mapKeys : 0;
	    const foundIds = Array.isArray(message.foundIds) ? message.foundIds : [];
	    const newIds = Array.isArray(message.newIds) ? message.newIds : [];
	    const tokensSample = Array.isArray(message.tokensSample) ? message.tokensSample.map(String).filter(Boolean) : [];
	    const unmappedTokensSample = Array.isArray(message.unmappedTokensSample)
	      ? message.unmappedTokensSample.map(String).filter(Boolean)
	      : [];
    const deckAsset =
      message.deckAsset && typeof message.deckAsset === "object" ? message.deckAsset : null;
    if (deckAsset) {
      const origin = typeof deckAsset.origin === "string" ? deckAsset.origin : "";
      const basePath = typeof deckAsset.basePath === "string" ? deckAsset.basePath : "";
      const ext = typeof deckAsset.ext === "string" ? deckAsset.ext : "";
      let changed = false;
      if (!state.deckAssetOrigin && origin) {
        state.deckAssetOrigin = origin;
        changed = true;
      }
      if (!state.deckAssetBasePath && basePath) {
        state.deckAssetBasePath = basePath;
        changed = true;
      }
      if (ext && (!state.deckAssetExt || state.deckAssetExt === "png")) {
        state.deckAssetExt = ext;
        changed = true;
      }
      if (changed) {
        persist({
          deckAssetOrigin: state.deckAssetOrigin,
          deckAssetBasePath: state.deckAssetBasePath,
          deckAssetExt: state.deckAssetExt,
        });
        updateDeckImages();
        const didAuto = autoCalibrateFromDeckAsset(state, persist, true);
        if (didAuto) {
          updateMappingUi();
          updateDeckImages();
          startAutoRead({ quiet: true });
        }
      }
    }
	    const scriptVersion = typeof message.scriptVersion === "string" ? message.scriptVersion : "";

    function lookupTokenMapping(token) {
      if (!token) return null;
      const direct = state.autoReadMap[token];
      if (direct && CARD_BY_ID.has(direct)) return direct;

      const noQuery = token.split(/[?#]/)[0];
      if (noQuery !== token) {
        const m2 = state.autoReadMap[noQuery];
        if (m2 && CARD_BY_ID.has(m2)) return m2;
      }

      if (noQuery.includes("/shadow/")) {
        const alt = noQuery.replace("/shadow/", "/");
        const m3 = state.autoReadMap[alt];
        if (m3 && CARD_BY_ID.has(m3)) return m3;
      }

      const deckTail = noQuery.match(/(deck_[^/]+\/[^/]+)$/);
      if (deckTail && deckTail[1]) {
        const m4 = state.autoReadMap[deckTail[1]];
        if (m4 && CARD_BY_ID.has(m4)) return m4;
      }

      const basename = noQuery.split("/").pop();
      if (basename) {
        const m5 = state.autoReadMap[basename];
        if (m5 && CARD_BY_ID.has(m5)) return m5;
        const noExt = basename.replace(/\.(png|jpg|jpeg|webp|svg)$/i, "");
        if (noExt) {
          const m6 = state.autoReadMap[noExt];
          if (m6 && CARD_BY_ID.has(m6)) return m6;
        }
      }

      const deck1 = mapDeck1Token(noQuery);
      if (deck1 && CARD_BY_ID.has(deck1)) return deck1;

      return null;
    }

    const token0 = tokensSample[0] || "";
    const tokenShort = token0 ? token0.split("/").slice(-2).join("/") : "-";
    const mapped0 = lookupTokenMapping(token0);
    const mappedShort = mapped0 && CARD_BY_ID.has(mapped0) ? CARD_BY_ID.get(mapped0).label : "-";

	    setDebugStatus(
	      [
	        scriptVersion ? `ver=${scriptVersion.split(":").slice(-1)[0]}` : "ver=-",
	        `selector=${selectorFound}`,
	        `carti=${hasCards}`,
	        `pauza=${paused}`,
	        `rezultat=${overlayVisible}`,
	        `img=${imgCount}`,
	        `map=${mapKeys}`,
	        `nemap=${unmappedTokensSample.length}`,
	        `token=${tokenShort || "-"}`,
	        `mapat=${mappedShort || "-"}`,
	        `gasite=${foundIds.join(",") || "-"}`,
	        `noi=${newIds.join(",") || "-"}`,
	      ].join(" • "),
	    );

    if (els.unmappedTokens) {
      els.unmappedTokens.textContent = "";
      const tokensToShow = Array.from(new Set(unmappedTokensSample)).slice(0, 12);
      if (tokensToShow.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint-inline";
        empty.textContent = "—";
        els.unmappedTokens.appendChild(empty);
      } else {
        for (const token of tokensToShow) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "token-chip";
          btn.textContent = token.split("/").slice(-2).join("/");
          btn.title = token;
          btn.addEventListener("click", () => {
            setPendingMappingToken(token, "Token selectat. Apasă cartea corectă în grilă pentru mapare.", "ok");
            logDebug(`Token selectat pentru mapare: ${token}`);
          });
          els.unmappedTokens.appendChild(btn);
        }
      }
    }

    if (overlayVisible && !debug.lastOverlayVisible) logDebug("Rezultat rundă detectat → cer resetare.");
    if (!overlayVisible && debug.lastOverlayVisible) logDebug("Rezultat rundă dispărut.");
    debug.lastOverlayVisible = overlayVisible;

	    const tokensSignature = tokensSample.slice(0, 3).join("|");
	    if (tokensSignature && tokensSignature !== debug.lastTokensSignature) {
	      debug.lastTokensSignature = tokensSignature;
	      logDebug(`Token-uri: ${tokensSample.slice(0, 3).join(" • ")}`);
	    }

	    if (scriptVersion && scriptVersion !== debug.lastScriptVersion) {
	      debug.lastScriptVersion = scriptVersion;
	      logDebug(`Versiune script: ${scriptVersion}`);
	    }

    if (hasCards && mapKeys === 0 && tokensSample.length > 0 && Date.now() - debug.lastNoMapHintAt > 5000) {
      debug.lastNoMapHintAt = Date.now();
      logDebug(
        "Nu există mapare (mapKeys=0). Folosește Calibrare (recomandat) sau Depanare → Token-uri nemapate.",
      );
    }

    if (newIds.length > 0) logDebug(`Cărți noi: ${newIds.join(", ")}`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    let needsRender = false;

    if (changes.preventDuplicates) {
      state.preventDuplicates = true;
      els.preventDuplicatesToggle.checked = true;
      if (changes.preventDuplicates.newValue !== true) {
        persist({ preventDuplicates: true });
      }
      needsRender = true;
    }

    if (changes.seen) {
      state.seen = Array.isArray(changes.seen.newValue) ? changes.seen.newValue.map(String) : [];
      if (state.preventDuplicates) state.seen = dedupePreserveOrder(state.seen);
      state.seen = state.seen.filter((id) => CARD_BY_ID.has(id));
      needsRender = true;
    }

    if (changes.autoReadEnabled) {
      state.autoReadEnabled = true;
      els.autoReadEnabledToggle.checked = true;
      if (changes.autoReadEnabled.newValue !== true) {
        persist({ autoReadEnabled: true });
      }
    }

    if (changes.autoReadSelector) {
      state.autoReadSelector = FIXED_AUTO_READ_SELECTOR;
      els.autoReadSelector.value = FIXED_AUTO_READ_SELECTOR;
      if (changes.autoReadSelector.newValue !== FIXED_AUTO_READ_SELECTOR) {
        persist({ autoReadSelector: FIXED_AUTO_READ_SELECTOR });
      }
    }

    if (changes.autoReadMap) {
      state.autoReadMap = {};
      const next = changes.autoReadMap.newValue;
      if (next && typeof next === "object") {
        for (const [token, value] of Object.entries(next)) {
          if (typeof token !== "string" || token.trim().length === 0) continue;
          const cardId = String(value);
          if (!CARD_BY_ID.has(cardId)) continue;
          state.autoReadMap[token] = cardId;
        }
      }
      inferDeckAssetFromMap();
      mergeDeckIndexSamplesFromMap();
      mergeCardImageCacheFromMap(Object.keys(state.autoReadMap || {}).length >= 32);
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));
      updateMappingUi();
      updateDeckImages();
      if (state.autoReadEnabled) startAutoRead();
    }

    if (changes.deckIndexSamples) {
      state.deckIndexSamples = sanitizeDeckIndexSamples(changes.deckIndexSamples.newValue);
      refreshDeckIndexConfig();
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));
      if (state.autoReadEnabled) startAutoRead();
    }

    if (changes.deckIndexConfig) {
      state.deckIndexConfig = sanitizeDeckIndexConfig(changes.deckIndexConfig.newValue);
      updateDeckImages();
      if (state.autoReadEnabled) startAutoRead();
    }

    if (changes.cardImageById) {
      state.cardImageById = sanitizeCardImageById(changes.cardImageById.newValue);
      updateDeckImages();
    }

    if (changes.deckAssetOrigin) {
      state.deckAssetOrigin =
        typeof changes.deckAssetOrigin.newValue === "string" ? changes.deckAssetOrigin.newValue : "";
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));
      updateDeckImages();
      if (autoCalibrateFromDeckAsset(state, persist, true)) {
        updateMappingUi();
        updateDeckImages();
        startAutoRead({ quiet: true });
      }
    }

    if (changes.deckAssetBasePath) {
      state.deckAssetBasePath =
        typeof changes.deckAssetBasePath.newValue === "string" ? changes.deckAssetBasePath.newValue : "";
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));
      updateDeckImages();
      if (autoCalibrateFromDeckAsset(state, persist, true)) {
        updateMappingUi();
        updateDeckImages();
        startAutoRead({ quiet: true });
      }
    }

    if (changes.deckAssetExt) {
      state.deckAssetExt = typeof changes.deckAssetExt.newValue === "string" ? changes.deckAssetExt.newValue : "png";
      mergeCardImageCacheFromSamples(isDeckSamplesComplete(state.deckIndexSamples));
      updateDeckImages();
      if (autoCalibrateFromDeckAsset(state, persist, true)) {
        updateMappingUi();
        updateDeckImages();
        startAutoRead({ quiet: true });
      }
    }

    if (changes.trumpSuit) {
      state.trumpSuit = typeof changes.trumpSuit.newValue === "string" ? changes.trumpSuit.newValue : "";
      updateTrumpUi();
    }

    if (needsRender) render();
  });

  els.captureStartBtn.addEventListener("click", () => startCapture());
  els.captureStopBtn.addEventListener("click", () => stopCapture());

  els.cancelMappingBtn.addEventListener("click", () => {
    if (!state.pendingMappingToken) return;
      setPendingMappingToken(null, "Tokenul în așteptare a fost șters.", undefined);
  });

  els.clearMappingBtn.addEventListener("click", () => {
    const ok = confirm("Ștergi toate mapările?");
    if (!ok) return;
    state.autoReadMap = {};
    state.deckIndexSamples = {};
    state.deckIndexConfig = null;
    state.cardImageById = {};
    persist({
      autoReadMap: state.autoReadMap,
      deckIndexSamples: state.deckIndexSamples,
      deckIndexConfig: null,
      cardImageById: state.cardImageById,
    });
    updateMappingUi();
    updateDeckImages();
    setStatus(els.mappingStatus, "Maparea a fost ștearsă.", undefined);
    if (state.autoReadEnabled) startAutoRead();
  });

	  els.deckGrid.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target) return;
    const btn = target.closest("button[data-card-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-card-id");
    if (!id || !CARD_BY_ID.has(id)) return;

    const cardLabel = (CARD_BY_ID.get(id) && CARD_BY_ID.get(id).label) || id;

	    if (state.pendingMappingToken) {
	      const token = state.pendingMappingToken;
      const keys = deriveTokenKeys(token);
      const nextMap = { ...state.autoReadMap };
      for (const k of keys) nextMap[k] = id;
      state.autoReadMap = nextMap;
      persist({ autoReadMap: state.autoReadMap });
      mergeCardImageCacheFromMap(true);
      updateDeckImages();
	      const deckIndex = parseDeckIndexFromToken(token);
	      if (deckIndex != null) {
	        state.deckIndexSamples = { ...state.deckIndexSamples, [String(deckIndex)]: id };
	        persist({ deckIndexSamples: state.deckIndexSamples });
	        refreshDeckIndexConfig();
	      }
      const shouldAdvanceCalibration =
        calibration.active && token === buildDeckTokenPath(calibration.index);
      setPendingMappingToken(null, `Token mapat → ${cardLabel}.`, "ok");
      if (shouldAdvanceCalibration) setCalibrationStatus(`Mapat → ${cardLabel}.`, "ok");
      logDebug(`Mapate ${keys.length} chei token → ${cardLabel}`);
      if (state.autoReadEnabled) startAutoRead();
      if (shouldAdvanceCalibration) advanceCalibration(1);
	      return;
	    }

    addSeenId(id);
  });

  els.seenList.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target) return;
    const btn = target.closest("button[data-remove-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove-id");
    if (!id) return;

    const idx = state.seen.indexOf(id);
    if (idx < 0) return;
    state.seen = [...state.seen.slice(0, idx), ...state.seen.slice(idx + 1)];

    persist({ seen: state.seen });
    render();
  });

  function requestContentSessionReset(pauseUntilNoCards) {
    if (!chrome.tabs || typeof chrome.tabs.query !== "function" || typeof chrome.tabs.sendMessage !== "function") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || tab.id == null) return;
      chrome.tabs.sendMessage(tab.id, { type: "belot_auto_tracker/reset_session", pauseUntilNoCards }, () => {
        // Ignore "no receiver" errors.
      });
    });
  }

  function resetAllSeen() {
    const ok = confirm("Resetezi toate cărțile văzute?");
    if (!ok) return;
    state.seen = [];
    state.trumpSuit = "";
    persist({ seen: state.seen, trumpSuit: state.trumpSuit });
    updateTrumpUi();
    render();
    requestContentSessionReset(true);
    logDebug("Resetare manuală.");
  }

  if (els.resetBtn) els.resetBtn.addEventListener("click", () => resetAllSeen());
  if (els.resetBtnMain) els.resetBtnMain.addEventListener("click", () => resetAllSeen());

  // preventDuplicates, selector, auto-read are now forced on (fixed config).

  els.seenFilter.addEventListener("input", () => {
    state.filter = String(els.seenFilter.value ?? "");
    render();
  });

  els.exportBtn.addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      seen: state.seen,
      settings: {
        preventDuplicates: state.preventDuplicates,
        autoReadEnabled: state.autoReadEnabled,
        autoReadSelector: state.autoReadSelector,
        autoReadMap: state.autoReadMap,
        deckIndexSamples: state.deckIndexSamples,
        deckIndexConfig: state.deckIndexConfig,
        deckAssetOrigin: state.deckAssetOrigin,
        deckAssetBasePath: state.deckAssetBasePath,
        deckAssetExt: state.deckAssetExt,
        cardImageById: state.cardImageById,
        trumpSuit: state.trumpSuit,
      },
    };
    els.jsonArea.value = JSON.stringify(payload, null, 2);
    els.jsonArea.focus();
    els.jsonArea.select();
    setStatus(els.ioStatus, "Exportat în textarea.", "ok");
  });

  els.importBtn.addEventListener("click", () => {
    const raw = String(els.jsonArea.value ?? "").trim();
    if (!raw) {
      setStatus(els.ioStatus, "Lipește JSON mai întâi.", "err");
      return;
    }

    let normalized;
    try {
      normalized = normalizeImportedData(JSON.parse(raw));
    } catch (err) {
      setStatus(els.ioStatus, err instanceof Error ? err.message : "JSON invalid.", "err");
      return;
    }

    const ok = confirm("Importul va suprascrie cărțile văzute și setările. Continui?");
    if (!ok) return;

    state.seen = normalized.seen;
    state.preventDuplicates = normalized.preventDuplicates;
    state.autoReadEnabled = true;
    state.autoReadSelector = normalized.autoReadSelector;
    state.autoReadMap = normalized.autoReadMap || {};
    state.deckIndexSamples = normalized.deckIndexSamples || {};
    state.deckIndexConfig = normalized.deckIndexConfig;
    state.deckAssetOrigin = typeof normalized.deckAssetOrigin === "string" ? normalized.deckAssetOrigin : "";
    state.deckAssetBasePath = typeof normalized.deckAssetBasePath === "string" ? normalized.deckAssetBasePath : "";
    state.deckAssetExt = typeof normalized.deckAssetExt === "string" ? normalized.deckAssetExt : "png";
    state.cardImageById = sanitizeCardImageById(normalized.cardImageById);
      state.trumpSuit = typeof normalized.trumpSuit === "string" ? normalized.trumpSuit : "";
    state.pendingMappingToken = null;
    els.preventDuplicatesToggle.checked = state.preventDuplicates;
    els.autoReadEnabledToggle.checked = state.autoReadEnabled;
    els.autoReadSelector.value = state.autoReadSelector;
    updateMappingUi();
    updateDeckImages();
    updateTrumpUi();

    persist({
      seen: state.seen,
      preventDuplicates: state.preventDuplicates,
      autoReadEnabled: state.autoReadEnabled,
      autoReadSelector: state.autoReadSelector,
      autoReadMap: state.autoReadMap,
      deckIndexSamples: state.deckIndexSamples,
      deckIndexConfig: state.deckIndexConfig,
      deckAssetOrigin: state.deckAssetOrigin,
      deckAssetBasePath: state.deckAssetBasePath,
      deckAssetExt: state.deckAssetExt,
      cardImageById: state.cardImageById,
      trumpSuit: state.trumpSuit,
    });
    render();
    setStatus(els.ioStatus, "Importat.", "ok");

    if (state.autoReadEnabled) startAutoRead();
  });
});
