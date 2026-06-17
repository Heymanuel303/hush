// Hush — popup: blocked-words list.
//
// The main keyword list editor (the "Blocked words" section): its serialized
// blockWords write chain + echo counter, row building, inline rename, add / bulk
// add / remove / clear-all, and the undo toast. Shares the global scope with the
// other panel-*.js files (see panel.js); reads `api`, the DOM refs, and
// `enabledState` from panel-core.js, and parseWord/composeWord from lib/words.js.

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

/* ---- list input wiring ---- */
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
