// Word Block — popup UI.
//
// Owns the toolbar popup: the on/off toggle, the per-tab and all-time counts,
// the keyword list editor, and the starter-pack toggles. Pure helpers live in
// the shared libraries loaded before this file:
//   • lib/words.js  — parseWord / composeWord (the "=" whole-word convention)
//   • lib/format.js — formatNumber / formatDuration
//   • data/packs.js — the PACKS array

// Works in both Firefox (browser.*) and Chrome (chrome.*).
const api = typeof browser !== "undefined" ? browser : chrome;

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const wordEl = document.getElementById("word");
const addBtn = document.getElementById("add");
const countEl = document.getElementById("count");
const clearBtn = document.getElementById("clearAll");
const toggleEl = document.getElementById("toggle");
const toggleLabel = document.getElementById("toggleLabel");
const tabCountEl = document.getElementById("tabCount");
const totalEl = document.getElementById("total");
const siteEl = document.getElementById("site");
const resetBtn = document.getElementById("resetTotal");
const reclaimedEl = document.getElementById("reclaimed");
const toastEl = document.getElementById("toast");
const toastMsgEl = document.getElementById("toastMsg");
const undoBtn = document.getElementById("undo");
const onboardEl = document.getElementById("onboard");
const onboardClose = document.getElementById("onboardClose");
const packsEl = document.getElementById("packs");
const packsToggle = document.getElementById("packsToggle");
const packsListEl = document.getElementById("packsList");

let enabledState = true; // mirrors the on/off toggle for newly built rows
let enabledPacks = []; // names of starter packs currently toggled on

/* ---------------- storage helpers ---------------- */
async function getWords() {
  const { blockWords } = await api.storage.local.get("blockWords");
  return blockWords || [];
}
function setWords(words) {
  return api.storage.local.set({ blockWords: words });
}

// Serialize blockWords read-modify-write so rapid successive clicks (e.g. two
// remove buttons) can't both read the same pre-state and clobber each other's
// write. Mirrors the lifetimeHidden chain in background.js. `mutate` receives
// the current words array and returns the new one.
// Count of our own pending blockWords writes, so the storage.onChanged listener
// can ignore the echoes of our optimistic updates (preserving in-progress row
// animations) and only re-render when another popup/window edits the list.
let pendingEchoes = 0;
let writeChain = Promise.resolve();
function queueWrite(mutate) {
  const run = writeChain.then(async () => {
    const next = mutate(await getWords());
    pendingEchoes++;
    try {
      await setWords(next);
    } catch (e) {
      pendingEchoes--; // no echo will arrive for a failed write
      throw e;
    }
    return next;
  });
  // Keep the chain alive even if one task rejects.
  writeChain = run.catch(() => {});
  return run;
}

// Starter-pack on/off state lives in its own key (`enabledPacks`, an array of
// pack names) and its own serialized chain so rapid toggles can't clobber each
// other. Like blockWords, it suppresses storage.onChanged echoes of its own
// optimistic writes via pendingPackEchoes: the in-memory `enabledPacks` is what
// togglePack reads to decide the next click's action, so a stale self-echo must
// not overwrite it — only another popup's edit should re-sync and repaint.
let pendingPackEchoes = 0;
let packWriteChain = Promise.resolve();
function queuePackWrite(mutate) {
  const run = packWriteChain.then(async () => {
    const { enabledPacks: cur } = await api.storage.local.get("enabledPacks");
    const next = mutate(cur || []);
    pendingPackEchoes++;
    try {
      await api.storage.local.set({ enabledPacks: next });
    } catch (e) {
      pendingPackEchoes--; // no echo will arrive for a failed write
      throw e;
    }
    return next;
  });
  packWriteChain = run.catch(() => {});
  return run;
}

/* ---------------- keyword list ---------------- */
// A stored word may carry a leading "=" meaning whole-word match. parseWord and
// composeWord (lib/words.js, the single source of truth for the convention,
// shared with content.js) split/join that "=". The UI shows the bare text plus a
// mode pill; the raw string (with any "=") is what actually lives in blockWords.

function buildRow(initialRaw) {
  let raw = initialRaw; // mutable: the mode toggle and inline edit rewrite it in place
  const li = document.createElement("li");
  li.className = "row";

  // Mode pill: contains (≈) vs whole-word (=). Clicking flips the stored "=".
  const mode = document.createElement("button");
  mode.className = "mode";
  mode.type = "button";
  function paintMode() {
    const whole = parseWord(raw).whole;
    mode.classList.toggle("whole", whole);
    mode.textContent = whole ? "=" : "≈";
    mode.title = whole
      ? "Whole word — click to match anywhere"
      : "Matches anywhere — click for whole word only";
    mode.setAttribute("aria-label", mode.title);
  }

  const span = document.createElement("span");
  span.className = "word";
  span.title = "Double-click to edit";

  const btn = document.createElement("button");
  btn.className = "remove";
  btn.type = "button";
  btn.title = "Remove";
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/>' +
    '<line x1="18" y1="6" x2="6" y2="18"/></svg>';

  // Keep the mutable raw, the visible label, and the remove button's accessible
  // name in lockstep whenever a mode toggle or rename changes the word.
  function syncRaw(v) {
    raw = v;
    const t = parseWord(raw).text;
    span.textContent = t;
    btn.setAttribute("aria-label", `Remove ${t}`);
  }
  // Lock this row's buttons while an inline edit is open, so a mode-toggle write
  // can't race the rename's write. enabledState still has the final say.
  function setRowBusy(busy) {
    mode.disabled = busy || !enabledState;
    btn.disabled = busy || !enabledState;
  }

  syncRaw(raw); // initial label + aria-label
  paintMode();
  mode.disabled = !enabledState; // operable only while blocking is on
  btn.disabled = !enabledState;

  mode.addEventListener("click", async () => {
    const cur = parseWord(raw);
    const next = composeWord(!cur.whole, cur.text);
    const oldRaw = raw;
    await queueWrite(prev => prev.map(w => (w === oldRaw ? next : w)));
    syncRaw(next);
    paintMode();
  });

  span.addEventListener("dblclick", () =>
    startEdit(span, () => raw, syncRaw, setRowBusy)
  );

  btn.addEventListener("click", () => removeWord(raw, li));

  li.appendChild(mode);
  li.appendChild(span);
  li.appendChild(btn);
  return li;
}

// Double-click a word: swap the label for an input. Commit on Enter/blur,
// cancel on Escape. The word's whole-word mode is preserved across the edit.
// setRaw (syncRaw) keeps the label/aria in sync; setRowBusy locks the row's
// other buttons so no second write can race this one.
function startEdit(span, getRaw, setRaw, setRowBusy) {
  if (!enabledState) return; // editing is off while blocking is paused
  const cur = parseWord(getRaw());
  const input = document.createElement("input");
  input.className = "edit";
  input.type = "text";
  input.value = cur.text;
  input.setAttribute("aria-label", "Edit word");
  setRowBusy(true);
  span.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    // Skip the write if blocking was paused mid-edit (no mutations while off).
    if (save && enabledState && text && text !== cur.text) {
      const oldRaw = getRaw();
      const next = composeWord(cur.whole, text);
      let applied = false;
      await queueWrite(prev => {
        // Don't create a duplicate of an existing rule; revert if it'd collide.
        if (prev.some(w => w !== oldRaw && w.toLowerCase() === next.toLowerCase())) return prev;
        applied = true;
        return prev.map(w => (w === oldRaw ? next : w));
      });
      if (applied) setRaw(next); // syncRaw updates the (detached) span + aria
    }
    setRowBusy(false); // re-enable only after the write settles
    input.replaceWith(span);
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

function updateMeta(words) {
  const has = words.length > 0;
  emptyEl.classList.toggle("show", !has);
  countEl.classList.toggle("show", has);
  clearBtn.classList.toggle("show", has);
  countEl.textContent = words.length;
}

function renderAll(words) {
  listEl.innerHTML = "";
  words.forEach(w => listEl.appendChild(buildRow(w)));
  updateMeta(words);
}

async function add() {
  const val = wordEl.value.trim();
  if (!val) return;
  let added = false;
  const words = await queueWrite(prev => {
    if (prev.some(w => w.toLowerCase() === val.toLowerCase())) return prev;
    added = true;
    return [val, ...prev]; // newest on top
  });
  if (added) {
    const row = buildRow(val);
    row.classList.add("enter");
    listEl.prepend(row);
    updateMeta(words);
  }
  wordEl.value = "";
  wordEl.focus();
}

// Add several words at once (bulk paste, starter packs). De-dupes against the
// existing list and each other; returns how many were actually added.
async function addMany(tokens) {
  const cleaned = (tokens || []).map(t => String(t).trim()).filter(Boolean);
  if (!cleaned.length) return 0;
  const fresh = [];
  const words = await queueWrite(prev => {
    const seen = new Set(prev.map(w => w.toLowerCase()));
    fresh.length = 0;
    for (const t of cleaned) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(t);
    }
    return [...fresh, ...prev];
  });
  // Prepend in reverse so the first listed token ends up on top.
  fresh.slice().reverse().forEach(t => {
    const row = buildRow(t);
    row.classList.add("enter");
    listEl.prepend(row);
  });
  updateMeta(words);
  return fresh.length;
}

async function removeWord(word, li) {
  li.classList.add("leaving");
  let snapshot = null;
  await queueWrite(prev => { snapshot = prev.slice(); return prev.filter(w => w !== word); });
  if (snapshot) stashUndo(snapshot, `Removed “${parseWord(word).text}”`);
  // remove after the leave animation (or immediately if motion is reduced)
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    li.remove();
    updateMeta([...listEl.children]); // recompute from live DOM, not a stale snapshot
  };
  li.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 180); // fallback
}

/* ---- clear all (inline confirm) ---- */
let clearArmed = false;
let clearTimer;
clearBtn.addEventListener("click", async () => {
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.classList.add("confirm");
    clearBtn.textContent = "Tap again to confirm";
    clearTimer = setTimeout(() => {
      clearArmed = false;
      clearBtn.classList.remove("confirm");
      clearBtn.textContent = "Clear all";
    }, 2500);
    return;
  }
  clearTimeout(clearTimer);
  clearArmed = false;
  clearBtn.classList.remove("confirm");
  clearBtn.textContent = "Clear all";
  let snapshot = null;
  await queueWrite(prev => { snapshot = prev.slice(); return []; });
  renderAll([]);
  if (snapshot && snapshot.length) {
    stashUndo(snapshot, `Cleared ${snapshot.length} ${snapshot.length === 1 ? "word" : "words"}`);
  }
});

/* ---------------- undo toast ---------------- */
// Both remove and clear-all stash the pre-change list here so a single tap can
// restore it. queueWrite bumps pendingEchoes, so the restore's storage echo is
// ignored and the explicit renderAll below is the single source of truth.
let undoSnapshot = null;
let toastTimer;
function stashUndo(snapshot, message) {
  undoSnapshot = snapshot;
  toastMsgEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  undoSnapshot = null;
}
undoBtn.addEventListener("click", async () => {
  const snap = undoSnapshot;
  hideToast();
  if (!snap) return;
  await queueWrite(() => snap);
  renderAll(snap);
});

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

/* ---------------- live updates ---------------- */
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lifetimeHidden && !resetArmed) showTotal();
  if (changes.enabled) applyEnabledUI(changes.enabled.newValue !== false);
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

// Keep the per-tab number ticking while the popup is open.
const poll = setInterval(showHiddenCount, 1000);
window.addEventListener("pagehide", () => clearInterval(poll));

addBtn.addEventListener("click", add);
wordEl.addEventListener("keydown", e => { if (e.key === "Enter") add(); });

// Pasting a comma- or line-separated list adds all of them at once; a paste
// with no separators falls through to normal single-field paste.
wordEl.addEventListener("paste", e => {
  const text = (e.clipboardData || window.clipboardData) ?
    (e.clipboardData || window.clipboardData).getData("text") : "";
  if (!/[\n,]/.test(text)) return;
  e.preventDefault();
  addMany(text.split(/[\n,]+/));
  wordEl.value = "";
  wordEl.focus();
});

/* ---------------- starter packs ---------------- */
let packsOpen = false;
function togglePacks(open) {
  packsOpen = open;
  packsListEl.hidden = !open;
  packsToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
packsToggle.addEventListener("click", () => togglePacks(!packsOpen));

// A pack is a persistent toggle: enabling it activates its words for matching
// (via the `enabledPacks` key, read by content.js) WITHOUT listing them among
// the custom blocked words. So the list below stays "custom words only".
function paintPack(btn) {
  const on = enabledPacks.includes(btn.dataset.packName);
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const n = btn.dataset.packWords;
  const words = btn.dataset.packPreview;
  btn.title = on
    ? `On — blocking ${n} words. Click to turn off.`
    : `Off — click to block ${n} words: ${words}`;
}
function paintAllPacks() {
  packsListEl.querySelectorAll(".pack").forEach(paintPack);
}
async function togglePack(name) {
  if (!enabledState) return;
  const turningOn = !enabledPacks.includes(name);
  // Optimistic: flip local state + repaint now, reconcile on the storage echo.
  enabledPacks = turningOn
    ? [...enabledPacks, name]
    : enabledPacks.filter(n => n !== name);
  paintAllPacks();
  await queuePackWrite(prev => {
    const has = prev.includes(name);
    if (turningOn) return has ? prev : [...prev, name];
    return prev.filter(n => n !== name);
  });
}
function renderPacks() {
  const packs = (typeof PACKS !== "undefined" && Array.isArray(PACKS)) ? PACKS : [];
  if (!packs.length) { packsEl.hidden = true; return; }
  packsListEl.innerHTML = "";
  packs.forEach(pack => {
    const b = document.createElement("button");
    b.className = "pack";
    b.type = "button";
    b.textContent = pack.name;
    b.dataset.packName = pack.name;
    b.dataset.packWords = String(pack.words.length);
    b.dataset.packPreview = pack.words.map(w => w.replace(/^=/, "")).join(", ");
    b.disabled = !enabledState;
    b.addEventListener("click", () => togglePack(pack.name));
    packsListEl.appendChild(b);
  });
  paintAllPacks();
}

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
  const { enabled, enabledPacks: ep } = await api.storage.local.get(["enabled", "enabledPacks"]);
  enabledPacks = ep || [];
  renderPacks(); // build pack buttons first so applyEnabledUI → setControlsDisabled can sync their disabled state
  if (enabledPacks.length) togglePacks(true); // reveal active toggles on open
  applyEnabledUI(enabled !== false);
  renderAll(await getWords());
  showTotal();
  showHiddenCount();
  maybeShowOnboarding();
})();
