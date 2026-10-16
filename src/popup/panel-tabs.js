// Hush — popup: the Words · Sites · Household tab bar.
//
// Loaded right after panel-core.js. Owns which panel is showing, the roving-tabindex
// keyboard model, the sticky bar's "stuck" edge and the Household tab's status dot.
// `popupTab` is a UI-only storage key written with a plain set on click (no write
// chain, no echo counter: an echo just re-selects the same tab, and panel.js's
// onChanged listener ignores it so a second popup never switches this one).

const TABS = ["words", "sites", "household"];
let popupTabState = "words";

const tabButtons = TABS.map(id => document.getElementById("tab-" + id));
const tabPanels = TABS.map(id => document.getElementById("panel-" + id));
const tabDotEl = document.getElementById("tabDot");
const tabDotTextEl = document.getElementById("tabDotText");

function selectTab(id, { persist } = {}) {
  if (!TABS.includes(id)) id = "words";
  popupTabState = id;
  TABS.forEach((t, i) => {
    const on = t === id;
    tabButtons[i].setAttribute("aria-selected", on ? "true" : "false");
    tabButtons[i].tabIndex = on ? 0 : -1;
    tabPanels[i].hidden = !on;
  });
  document.body.dataset.tab = id;
  if (persist) api.storage.local.set({ popupTab: id });
}

tabButtons.forEach((btn, i) => {
  btn.addEventListener("click", () => selectTab(TABS[i], { persist: true }));
  btn.addEventListener("keydown", e => {
    let next;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(TABS[next], { persist: true });
    tabButtons[next].focus();
  });
});

// Which tab to open on. A locked device and an unseen revoke always open
// Household; otherwise the remembered tab; `advanced: true` with no remembered
// tab (the retired Advanced pill) migrates once to Sites. Anything else is Words,
// so a stale stored value can never leave a blank popup.
function initialTab(stored) {
  const hub = stored.hub, cfg = stored.hubConfig, st = stored.hubStatus;
  if (hub && cfg && cfg.locked) return "household";
  if (st && st.error === "revoked" && st.revokedAt !== stored.hubRevokedSeen) return "household";
  if (TABS.includes(stored.popupTab)) return stored.popupTab;
  if (stored.advanced === true && stored.popupTab === undefined) {
    api.storage.local.set({ popupTab: "sites" });
    return "sites";
  }
  return "words";
}

// The Household tab's dot and its spoken state, from the mirrored hub keys.
function paintTabDot() {
  const err = hubStatusState && hubStatusState.error;
  let state = null;
  if (hubState) state = err === "offline" || err === "invalid" ? err : "synced";
  else if (err === "revoked") state = "revoked";
  const spoken = {
    synced: "synced", offline: "offline", invalid: "needs attention", revoked: "removed",
  };
  if (state) tabDotEl.dataset.state = state; else delete tabDotEl.dataset.state;
  tabDotTextEl.textContent = state ? ", " + spoken[state] : "";
}

// A 1px edge under the sticky bar, only once content has scrolled beneath it.
const tabsBar = document.querySelector(".tabs");
if (typeof IntersectionObserver !== "undefined") {
  new IntersectionObserver(([entry]) => {
    tabsBar.classList.toggle("stuck", !entry.isIntersecting);
  }).observe(document.getElementById("tabsSentinel"));
}
