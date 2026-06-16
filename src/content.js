// Hush — content script.
//
// Injected into Reddit, X, YouTube, and Google search. Hides any "post unit"
// whose text contains an active block word, then keeps hiding as the feed
// lazy-loads. The matching engine and the "=" whole-word convention live in
// lib/words.js (loaded first by the manifest, shared isolated-world scope); this
// file owns the DOM, the per-tab badge bookkeeping, and the background messaging.

// Works in both Firefox (browser.*) and Chrome (chrome.*).
const api = typeof browser !== "undefined" ? browser : chrome;

let blockWords = [];   // compiled rules ({needle, re}); see buildRules in lib/words.js
let enabled = true;
let hiddenCount = 0;   // posts currently hidden on this tab (drives the badge)

const HOST = location.hostname;

function currentSite() {
  if (HOST.includes("reddit.com")) return "Reddit";
  if (HOST.includes("x.com") || HOST.includes("twitter.com")) return "X";
  if (HOST.includes("youtube.com")) return "YouTube";
  if (HOST.includes("google.")) return "Google";
  return null;
}

// One-way notification to the badge + lifetime total. delta = posts newly
// hidden this pass (each counted once toward the all-time total).
//
// The badge (tabCount) is idempotent and self-heals on the next report, so a
// dropped send is harmless. The lifetime delta must arrive exactly once, so we
// hold un-acked deltas in pendingDelta and keep a single delta-bearing message
// in flight at a time: on success we flush any more that accumulated; on
// failure (e.g. the event page was mid-suspend) we requeue for the next report.
let pendingDelta = 0;
let deltaInFlight = false;

function report(delta) {
  pendingDelta += delta || 0;
  sendReport();
}

function sendReport() {
  const sending = deltaInFlight ? 0 : pendingDelta;
  if (sending > 0) { deltaInFlight = true; pendingDelta = 0; }
  api.runtime
    .sendMessage({ type: "hidden", tabCount: hiddenCount, delta: sending })
    .then(() => {
      if (sending > 0) {
        deltaInFlight = false;
        if (pendingDelta > 0) sendReport(); // flush what accumulated meanwhile
      }
    })
    .catch(() => {
      if (sending > 0) { pendingDelta += sending; deltaInFlight = false; }
      // badge self-heals on the next report; delta is retried then too
    });
}

// Each site exposes its "post units" through different DOM elements.
// We hide the whole unit if its text contains a blocked word.
// NOTE: These sites change their markup over time. If something stops
// being hidden, you may need to update the selectors below (see the
// README for how to find the right one with the browser inspector).
function getSelectors() {
  if (HOST.includes("reddit.com")) {
    return [
      "shreddit-post",                  // new reddit (web component)
      "[data-testid='post-container']", // new reddit
      "article",                        // some new-reddit feeds
      ".thing"                          // old.reddit.com
    ];
  }
  if (HOST.includes("x.com") || HOST.includes("twitter.com")) {
    return [
      "[data-testid='tweet']",
      "article"
    ];
  }
  if (HOST.includes("youtube.com")) {
    return [
      "ytd-rich-item-renderer",          // home grid
      "ytd-video-renderer",              // search results
      "ytd-compact-video-renderer",      // sidebar / up-next
      "ytd-grid-video-renderer",         // channel grids
      "ytd-reel-item-renderer",          // shorts (old markup)
      "ytm-shorts-lockup-view-model",    // shorts in search/feed (new markup)
      "ytm-shorts-lockup-view-model-v2", // shorts lockup (newer variant)
      "yt-lockup-view-model"             // new search/related lockup
    ];
  }
  if (HOST.includes("google.")) {
    // Google web SERP. Highest-maintenance entry in this file — result classes
    // are auto-generated and Google rotates them roughly monthly. When results
    // stop being hidden, re-sync from github.com/ublacklist/builtin (google.yml).
    // These selectors nest (a .MjjYud contains a div.g contains [data-hveid]);
    // scan()'s ancestor-hidden guard keeps each result counted exactly once.
    //
    // Only the web-results vertical: Images/News/Videos/Shopping share the
    // /search path but use unrelated markup. udm/tbm in the query name the
    // vertical (udm=14 or absent = web/All; tbm=isch|vid|nws|shop = other).
    const p = new URLSearchParams(location.search);
    const udm = p.get("udm");
    if (p.get("tbm") || (udm && udm !== "14")) return [];
    return [
      "#rso .MjjYud",            // modern per-position result slot (organic,
                                 // snippet, Top Stories, video/image pack);
                                 // scoped to #rso so nav/footer/ads are safe
      ".vt6azd:not(.g-blk)",     // current organic root (rotates often)
      ".Ww4FFb",                 // organic root, alternate/mobile layout
      "#rso div.g",              // legacy organic block (still on some layouts)
      "#rso > div[data-hveid]"   // rotation-proof fallback: data-hveid is a
                                 // functional id that outlives class renames;
                                 // direct-child + #rso keep it to outer units
    ];
  }
  return [];
}

let selectors = getSelectors();

function hide(el) {
  if (el.dataset.kbHidden) return false;
  el.dataset.kbHidden = "1";
  el.style.display = "none";
  hiddenCount++;
  // kbCounted persists even after un-hiding, so toggling blocking off/on or
  // editing the word list never re-counts the same post toward the total.
  if (!el.dataset.kbCounted) {
    el.dataset.kbCounted = "1";
    return true; // newly counted toward lifetime total
  }
  return false;
}

function unhideAll() {
  document.querySelectorAll("[data-kb-hidden]").forEach(el => {
    el.style.display = "";
    delete el.dataset.kbHidden;
  });
  hiddenCount = 0;
}

function scan() {
  if (!enabled || !blockWords.length || !selectors.length) return;
  const before = hiddenCount;
  let newlyCounted = 0;
  for (const sel of selectors) {
    for (const node of document.querySelectorAll(sel)) {
      if (node.dataset.kbHidden) continue;
      // Skip nodes already inside a hidden unit. Some sites (notably Google's
      // SERP) expose overlapping, self-nesting result wrappers, so one post can
      // match several selectors at different nesting levels — hide only the
      // outermost so hiddenCount and lifetimeHidden count it exactly once.
      if (node.parentElement && node.parentElement.closest("[data-kb-hidden]")) continue;
      if (matchesAny(node.textContent || "", blockWords)) {
        if (hide(node)) newlyCounted++;
      }
    }
  }
  if (hiddenCount !== before || newlyCounted) report(newlyCounted);
}

// Reddit/X/YouTube navigate client-side (no document reload), so the badge
// would otherwise carry the previous feed's count. Detect a URL change inside
// the observer's scan tick (SPA navigations always mutate the DOM) and treat it
// like a fresh page: drop per-page hidden bookkeeping and recompute. We clear
// kbHidden but leave kbCounted intact so the lifetime total is never re-counted.
// (Wrapping history.pushState from a content script is unreliable on Firefox due
// to Xray isolation, so we key off the URL instead.)
let lastUrl = location.href;
function handleRouteChange() {
  lastUrl = location.href;
  selectors = getSelectors(); // re-evaluate per URL (e.g. Google's web vs Images/News vertical)
  document.querySelectorAll("[data-kb-hidden]").forEach(el => {
    el.style.display = "";
    delete el.dataset.kbHidden;
  });
  hiddenCount = 0;
  report(0); // force a badge refresh even if the new view hides nothing
}

// Sites load content as you scroll, so re-scan when the DOM changes.
let queued = false;
function scheduleScan() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (location.href !== lastUrl) handleRouteChange();
    scan();
  });
}

const observer = new MutationObserver(scheduleScan);

// Two raw word sources feed matching: the user's custom list (`blockWords` in
// storage, the only thing the popup's list shows) plus the words contributed by
// whichever starter packs the user has toggled on (`enabledPacks` = pack names).
// They're kept separate so packs never leak into the visible custom-word list.
let customWords = [];
let enabledPacks = [];

// Recompile the active rule set from custom words ∪ enabled-pack words. The
// union, dedupe, and compile all happen in buildRules (lib/words.js); PACKS comes
// from data/packs.js, loaded just before this file in the same content script
// (shared isolated-world scope). Guard with typeof in case it's ever absent so
// matching still works on at least the custom words.
function rebuildRules() {
  const packs = (typeof PACKS !== "undefined" && Array.isArray(PACKS)) ? PACKS : [];
  blockWords = buildRules(customWords, packs, enabledPacks);
}

// Let the popup ask how many posts are hidden on this tab, and which site.
api.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "getCount") {
    return Promise.resolve({ count: hiddenCount, site: currentSite() });
  }
  // Return undefined for anything else so we don't claim other listeners'
  // responses (the documented cause of "message port closed" on Firefox).
});

// Load saved state, then start watching.
api.storage.local.get(["blockWords", "enabled", "enabledPacks"]).then(res => {
  customWords = res.blockWords || [];
  enabledPacks = res.enabledPacks || [];
  rebuildRules();
  enabled = res.enabled !== false; // default ON
  report(0); // clear any stale badge from a previous page
  scan();
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Back/forward navigations fire popstate; forward (pushState) navigations are
  // caught by the URL check in scheduleScan when the DOM mutates.
  window.addEventListener("popstate", scheduleScan);
});

// React live when you edit settings in the popup.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.enabled) {
    enabled = changes.enabled.newValue !== false;
    if (!enabled) {
      unhideAll(); // bring everything back when paused
      report(0);
    } else {
      scan();
    }
  }

  if (changes.blockWords) {
    customWords = changes.blockWords.newValue || [];
    rebuildRules();
    unhideAll(); // so removing a word brings content back
    scan();
    report(0); // refresh the badge after a possible reset (delta handled by scan)
  }

  if (changes.enabledPacks) {
    enabledPacks = changes.enabledPacks.newValue || [];
    rebuildRules();
    unhideAll(); // re-hide from scratch with the new pack selection
    scan();
    report(0);
  }
});
