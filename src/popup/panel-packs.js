// Hush — popup: starter packs.
//
// The starter-pack toggles: their serialized enabledPacks write chain + echo
// counter and the collapsible pack-button section. Shares the global scope with
// the other panel-*.js files (see panel.js); reads `api`, the DOM refs, and
// `enabledState`/`enabledPacks` from panel-core.js, and PACKS from data/packs.js.

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
