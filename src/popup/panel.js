// Hush — popup entry / shell.
//
// Loaded LAST among the popup scripts. Owns the on/off toggle + stats, the
// onboarding banner, the single storage.onChanged listener that fans changes out
// to every feature, and the init() that runs once all feature files are loaded.
//
// The popup is split across classic <script>s that share ONE global lexical
// scope (no bundler/modules), loaded in this order by panel.html:
//   ../lib/words.js · ../lib/format.js · ../data/packs.js · ../data/sites.js
//   panel-core.js      — api shim, DOM refs, cross-feature state
//   panel-keywords.js  — blocked-words list  (+ blockWords write chain)
//   panel-packs.js     — starter packs       (+ enabledPacks write chain)
//   panel-sites.js     — advanced/per-site   (+ siteWords write chain)
//   panel.js           — this file: toggle/stats, onboarding, onChanged, init
// Feature functions reference each other across files; that's safe because every
// call happens after all scripts have loaded (top-level code only ever refers
// back to earlier-loaded files). init() must therefore stay in this last file.

/* ---------------- on/off toggle ---------------- */
function applyEnabledUI(enabled) {
  enabledState = enabled;
  toggleEl.checked = enabled;
  toggleLabel.textContent = enabled ? "On" : "Off";
  document.body.classList.toggle("paused", !enabled);
  setControlsDisabled(!enabled);
  tabLabelForState(enabled);
}
// Truly disable operable controls while paused so the dimmed look qualifies for
// the WCAG inactive-component exemption (the hero stats are non-interactive).
function setControlsDisabled(disabled) {
  wordEl.disabled = disabled;
  addBtn.disabled = disabled;
  clearBtn.disabled = disabled;
  packsToggle.disabled = disabled;
  listEl.querySelectorAll(".remove, .mode").forEach(b => { b.disabled = disabled; });
  packsListEl.querySelectorAll(".pack").forEach(b => { b.disabled = disabled; });
  // Per-site editor: gate adding/editing while paused, just like the main list.
  // The collapse toggles stay operable so the lists can still be viewed.
  sitesListEl.querySelectorAll(".site-input, .site-add-btn, .remove, .mode")
    .forEach(b => { b.disabled = disabled; });
}
function tabLabelForState(enabled) {
  document.getElementById("tabLabel").textContent =
    enabled ? "hidden on this tab" : "blocking paused";
}
toggleEl.addEventListener("change", () => {
  const enabled = toggleEl.checked;
  applyEnabledUI(enabled);
  api.storage.local.set({ enabled });
});

/* ---------------- stats ---------------- */
let lastTabCount = null;
async function showHiddenCount() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const res = await api.tabs.sendMessage(tab.id, { type: "getCount" });
    const n = res && typeof res.count === "number" ? res.count : 0;
    setTabCount(n);
    if (res && res.site) {
      siteEl.textContent = res.site;
      siteEl.hidden = false;
    } else {
      siteEl.hidden = true;
    }
  } catch {
    // No content script here (unsupported page, or needs a refresh).
    setTabCount(0);
    siteEl.textContent = "Reddit · X · YouTube · Google";
    siteEl.hidden = false;
  }
}
function setTabCount(n) {
  if (n === lastTabCount) return;
  const isBump = lastTabCount !== null && n > lastTabCount;
  lastTabCount = n;
  tabCountEl.textContent = formatNumber(n);
  if (isBump) {
    tabCountEl.classList.remove("bump");
    void tabCountEl.offsetWidth; // restart the animation
    tabCountEl.classList.add("bump");
  }
}

const SECONDS_PER_POST = 6; // rough "scrolling not done" estimate per hidden post
async function showTotal() {
  const { lifetimeHidden = 0 } = await api.storage.local.get("lifetimeHidden");
  totalEl.textContent = formatNumber(lifetimeHidden);
  if (!reclaimedEl) return;
  if (!lifetimeHidden) {
    reclaimedEl.hidden = true;
  } else {
    reclaimedEl.hidden = false;
    reclaimedEl.textContent = "~" + formatDuration(lifetimeHidden * SECONDS_PER_POST) + " saved";
  }
}

/* ---- reset all-time total (inline confirm) ---- */
let resetArmed = false;
let resetTimer;
resetBtn.addEventListener("click", () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.classList.add("confirm");
    totalEl.textContent = "Reset?";
    resetTimer = setTimeout(disarmReset, 2500);
    return;
  }
  disarmReset();
  api.runtime.sendMessage({ type: "resetTotal" }).then(showTotal).catch(showTotal);
});
function disarmReset() {
  clearTimeout(resetTimer);
  resetArmed = false;
  resetBtn.classList.remove("confirm");
  showTotal();
}

// Keep the per-tab number ticking while the popup is open.
const poll = setInterval(showHiddenCount, 1000);
window.addEventListener("pagehide", () => clearInterval(poll));

/* ---------------- live updates ---------------- */
// One listener fans each changed key out to the owning feature's state/repaint.
// Each feature's pending-echo counter (in its panel-*.js file) lets us ignore the
// echoes of our own optimistic writes and only re-sync on another popup's edit.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lifetimeHidden && !resetArmed) showTotal();
  if (changes.enabled) applyEnabledUI(changes.enabled.newValue !== false);
  if (changes.advanced) applyAdvancedUI(changes.advanced.newValue === true);
  if (changes.siteWords) {
    if (pendingSiteEchoes > 0) {
      pendingSiteEchoes--; // echo of our own write; local state is authoritative
    } else {
      // Edited by another popup/window: re-sync and repaint every site list.
      siteWords = changes.siteWords.newValue || {};
      Object.keys(siteRefs).forEach(paintSite);
    }
  }
  if (changes.blockWords) {
    if (pendingEchoes > 0) {
      pendingEchoes--; // echo of our own write; UI is already up to date
    } else {
      renderAll(changes.blockWords.newValue || []); // edited elsewhere; re-sync
    }
  }
  if (changes.enabledPacks) {
    if (pendingPackEchoes > 0) {
      pendingPackEchoes--; // echo of our own write; local state is authoritative
    } else {
      // Edited by another popup/window: re-sync, repaint, and mirror init's
      // auto-open so a newly-active toggle isn't stranded in a collapsed section.
      enabledPacks = changes.enabledPacks.newValue || [];
      paintAllPacks();
      if (enabledPacks.length && !packsOpen) togglePacks(true);
    }
  }
});

/* ---------------- first-run onboarding ---------------- */
onboardClose.addEventListener("click", () => {
  onboardEl.hidden = true;
  api.storage.local.set({ seenOnboarding: true });
});
async function maybeShowOnboarding() {
  const { seenOnboarding } = await api.storage.local.get("seenOnboarding");
  if (!seenOnboarding) onboardEl.hidden = false;
}

/* ---------------- init ---------------- */
(async function init() {
  const { enabled, enabledPacks: ep, advanced, siteWords: sw } =
    await api.storage.local.get(["enabled", "enabledPacks", "advanced", "siteWords"]);
  enabledPacks = ep || [];
  siteWords = sw || {};
  renderPacks(); // build pack buttons first so applyEnabledUI → setControlsDisabled can sync their disabled state
  renderSites(); // build the per-site editor too (hidden until advanced) for the same reason
  if (enabledPacks.length) togglePacks(true); // reveal active toggles on open
  applyEnabledUI(enabled !== false);
  applyAdvancedUI(advanced === true);
  renderAll(await getWords());
  showTotal();
  showHiddenCount();
  maybeShowOnboarding();
})();
