// Hush — popup: advanced mode + per-site words.
//
// The advanced-mode toggle (accent recolor) and the per-site word editor: its
// serialized siteWords write chain + echo counter, the collapsible per-site
// blocks, and per-site add / bulk add / remove. Shares the global scope with the
// other panel-*.js files (see panel.js); reads `api`, the DOM refs, and
// `enabledState`/`advancedState`/`siteWords` from panel-core.js, SITES from
// data/sites.js, and parseWord/composeWord from lib/words.js.

// Per-site words (advanced mode) live in their own key (`siteWords`, an object
// of siteId → raw-word array) with their own serialized chain and echo counter,
// exactly like enabledPacks above — so the three keys never share a
// read-modify-write, and the storage.onChanged listener can ignore the echoes of
// our own optimistic edits (preserving row animations) while still re-syncing
// when another popup edits a site list. `mutate` receives the current siteWords
// object and returns the new one.
let pendingSiteEchoes = 0;
let siteWriteChain = Promise.resolve();
function queueSiteWrite(mutate) {
  const run = siteWriteChain.then(async () => {
    const { siteWords: cur } = await api.storage.local.get("siteWords");
    const next = mutate(cur || {});
    pendingSiteEchoes++;
    try {
      await api.storage.local.set({ siteWords: next });
    } catch (e) {
      pendingSiteEchoes--; // no echo will arrive for a failed write
      throw e;
    }
    return next;
  });
  siteWriteChain = run.catch(() => {});
  return run;
}

/* ---------------- advanced mode + per-site words ---------------- */
// Advanced mode is a persisted UI state (`advanced` key): it recolors the whole
// panel to the violet accent (via the body.advanced class — see panel.css) and
// reveals the per-site word editor. The per-site words themselves always apply
// to matching regardless of this toggle; advanced mode is just their editor.
function applyAdvancedUI(on) {
  advancedState = on;
  document.body.classList.toggle("advanced", on);
  advToggle.setAttribute("aria-pressed", on ? "true" : "false");
  sitesEl.hidden = !on;
}
advToggle.addEventListener("click", () => {
  const on = !advancedState;
  applyAdvancedUI(on);
  api.storage.local.set({ advanced: on });
});

// The curated site list comes from data/sites.js (the single source of truth,
// shared with content.js). Guard with typeof in case it's ever absent.
const SITE_LIST = (typeof SITES !== "undefined" && Array.isArray(SITES)) ? SITES : [];
// siteId → { ul, count, input, addBtn } so a word add/remove repaints just that
// site without rebuilding the whole section (which would collapse open blocks).
const siteRefs = {};

function siteWordsFor(id) {
  return Array.isArray(siteWords[id]) ? siteWords[id] : [];
}

// A per-site word row: mode pill (= whole-word) + label + remove. Mirrors the
// main list's rows but writes through queueSiteWrite scoped to one site. (Inline
// rename is intentionally omitted here — remove and re-add instead.)
function buildSiteRow(siteId, initialRaw) {
  let raw = initialRaw;
  const li = document.createElement("li");
  li.className = "row site-row";

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

  const btn = document.createElement("button");
  btn.className = "remove";
  btn.type = "button";
  btn.title = "Remove";
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/>' +
    '<line x1="18" y1="6" x2="6" y2="18"/></svg>';

  function label() {
    const t = parseWord(raw).text;
    span.textContent = t;
    span.title = t;
    btn.setAttribute("aria-label", `Remove ${t}`);
  }
  label();
  paintMode();
  mode.disabled = !enabledState;
  btn.disabled = !enabledState;

  mode.addEventListener("click", async () => {
    if (!enabledState) return;
    const cur = parseWord(raw);
    const next = composeWord(!cur.whole, cur.text);
    const oldRaw = raw;
    const result = await queueSiteWrite(prev => {
      const list = (prev[siteId] || []).map(w => (w === oldRaw ? next : w));
      return { ...prev, [siteId]: list };
    });
    siteWords = result;
    raw = next;
    label();
    paintMode();
  });

  btn.addEventListener("click", () => removeSiteWord(siteId, raw, li));

  li.appendChild(mode);
  li.appendChild(span);
  li.appendChild(btn);
  return li;
}

// Repaint one site's word list + count badge from the in-memory siteWords.
function paintSite(id) {
  const ref = siteRefs[id];
  if (!ref) return;
  const words = siteWordsFor(id);
  ref.ul.innerHTML = "";
  words.forEach(w => ref.ul.appendChild(buildSiteRow(id, w)));
  ref.count.textContent = words.length ? String(words.length) : "";
  ref.count.classList.toggle("show", words.length > 0);
  // keep newly built rows in step with the on/off state
  const disabled = !enabledState;
  ref.input.disabled = disabled;
  ref.addBtn.disabled = disabled;
  ref.ul.querySelectorAll(".remove, .mode").forEach(b => { b.disabled = disabled; });
}

// Build one collapsible site block (header + add row + word list).
function buildSiteBlock(site) {
  const wrap = document.createElement("section");
  wrap.className = "site-block";
  wrap.dataset.site = site.id;

  const toggle = document.createElement("button");
  toggle.className = "site-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");

  const name = document.createElement("span");
  name.className = "site-name";
  name.textContent = site.label;

  const count = document.createElement("span");
  count.className = "site-count";

  const chev = document.createElement("span");
  chev.className = "site-chev";
  chev.setAttribute("aria-hidden", "true");
  chev.innerHTML =
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  toggle.appendChild(name);
  toggle.appendChild(count);
  toggle.appendChild(chev);

  const body = document.createElement("div");
  body.className = "site-body";
  body.hidden = true;

  const addRow = document.createElement("div");
  addRow.className = "site-add";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "site-input";
  input.placeholder = `Add a word for ${site.label}`;
  input.setAttribute("aria-label", `Add a word for ${site.label}`);
  const addBtn = document.createElement("button");
  addBtn.className = "site-add-btn";
  addBtn.type = "button";
  addBtn.textContent = "Add";
  addRow.appendChild(input);
  addRow.appendChild(addBtn);

  const ul = document.createElement("ul");
  ul.className = "site-words";

  body.appendChild(addRow);
  body.appendChild(ul);
  wrap.appendChild(toggle);
  wrap.appendChild(body);

  toggle.addEventListener("click", () => {
    const open = body.hidden; // about to open
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  const doAdd = () => {
    if (!enabledState) return; // no edits while blocking is paused
    const val = input.value.trim();
    if (!val) return;
    addSiteWord(site.id, val);
    input.value = "";
    input.focus();
  };
  addBtn.addEventListener("click", doAdd);
  input.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
  // Pasting a comma- or line-separated list adds all of them at once.
  input.addEventListener("paste", e => {
    const cb = e.clipboardData || window.clipboardData;
    const text = cb ? cb.getData("text") : "";
    if (!/[\n,]/.test(text)) return;
    e.preventDefault();
    addManySiteWords(site.id, text.split(/[\n,]+/));
    input.value = "";
    input.focus();
  });

  siteRefs[site.id] = { ul, count, input, addBtn };
  paintSite(site.id);
  return wrap;
}

function renderSites() {
  sitesListEl.innerHTML = "";
  for (const k of Object.keys(siteRefs)) delete siteRefs[k];
  SITE_LIST.forEach(site => sitesListEl.appendChild(buildSiteBlock(site)));
}

async function addSiteWord(siteId, val) {
  if (!enabledState) return;
  let added = false;
  const result = await queueSiteWrite(prev => {
    const list = (prev[siteId] || []).slice();
    if (list.some(w => w.toLowerCase() === val.toLowerCase())) return prev;
    added = true;
    return { ...prev, [siteId]: [val, ...list] };
  });
  siteWords = result;
  if (!added) return;
  const ref = siteRefs[siteId];
  if (!ref) return;
  const row = buildSiteRow(siteId, val);
  row.classList.add("enter");
  ref.ul.prepend(row);
  const n = siteWordsFor(siteId).length;
  ref.count.textContent = String(n);
  ref.count.classList.add("show");
}

async function addManySiteWords(siteId, tokens) {
  if (!enabledState) return;
  const cleaned = (tokens || []).map(t => String(t).trim()).filter(Boolean);
  if (!cleaned.length) return;
  const fresh = [];
  const result = await queueSiteWrite(prev => {
    const list = (prev[siteId] || []).slice();
    const seen = new Set(list.map(w => w.toLowerCase()));
    fresh.length = 0;
    for (const t of cleaned) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(t);
    }
    return { ...prev, [siteId]: [...fresh, ...list] };
  });
  siteWords = result;
  const ref = siteRefs[siteId];
  if (!ref) return;
  // Prepend in reverse so the first listed token ends up on top.
  fresh.slice().reverse().forEach(t => {
    const row = buildSiteRow(siteId, t);
    row.classList.add("enter");
    ref.ul.prepend(row);
  });
  const n = siteWordsFor(siteId).length;
  ref.count.textContent = n ? String(n) : "";
  ref.count.classList.toggle("show", n > 0);
}

async function removeSiteWord(siteId, word, li) {
  if (!enabledState) return;
  li.classList.add("leaving");
  const result = await queueSiteWrite(prev => {
    const list = (prev[siteId] || []).filter(w => w !== word);
    return { ...prev, [siteId]: list };
  });
  siteWords = result;
  const ref = siteRefs[siteId];
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    li.remove();
    if (!ref) return;
    const n = siteWordsFor(siteId).length;
    ref.count.textContent = n ? String(n) : "";
    ref.count.classList.toggle("show", n > 0);
  };
  li.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 180); // fallback if motion is reduced
}
