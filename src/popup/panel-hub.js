// Hush — popup: Household hub section + locked (read-only) rendering.
//
// The "Connect to a hub" form, connected status, sync/disconnect, the "Managed by
// <hub>" banner and the revoked toast. Shares the global scope with the other
// panel-*.js files (see panel.js). The hub keys (`hub`, `hubConfig`, `hubStatus`)
// are written ONLY by background.js; this file just reads them and sends the
// hubPair / hubSync / hubDisconnect messages, so there is no write chain or echo
// counter. The one key the popup writes is `hubRevokedSeen` (a revokedAt
// timestamp) so the revoked toast shows once per revocation, not on every open.

let hubOpen = false;
let lastHubName = ""; // survives a revoke (background drops `hub`) so the toast can still name the hub
let hubBusy = false;

function hubDisplayName() {
  return (hubState && hubState.hubName) || lastHubName || "the hub";
}

function setHubOpen(open) {
  hubOpen = open;
  hubBody.hidden = !open;
  hubToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
hubToggle.addEventListener("click", () => setHubOpen(!hubOpen));

/* ---------------- paint ---------------- */
function paintHub() {
  const connected = !!hubState;
  if (connected && hubState.hubName) lastHubName = hubState.hubName;
  hubOffForm.hidden = connected;
  hubOnView.hidden = !connected;

  // Status dot: accent when synced, muted when offline/invalid, none when not connected.
  hubDot.hidden = !connected;
  const err = hubStatusState && hubStatusState.error;
  const degraded = err === "offline" || err === "invalid";
  hubDot.classList.toggle("off", degraded);
  hubDot.title = !connected ? "" : degraded ? "Not in sync" : "Synced";

  if (!connected) return;
  hubSummaryEl.textContent =
    `Connected to ${hubState.hubName} · profile ${hubState.profileName}`;
  hubSyncInfoEl.textContent = syncInfoText();
  hubSyncInfoEl.classList.toggle("warn", degraded);
}
// "14:05" today, "12 Oct, 14:05" otherwise.
function clockTime(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}
function syncInfoText() {
  const st = hubStatusState || {};
  if (st.error === "offline") {
    return `Offline since ${st.offlineSince ? clockTime(st.offlineSince) : "the last sync"}, using the last rules`;
  }
  if (st.error === "invalid") {
    return "The hub sent an invalid configuration; keeping the previous one";
  }
  return st.lastSync ? `Last sync ${formatAgo(st.lastSync)}` : "Not synced yet";
}

/* ---------------- connect ---------------- */
function showHubError(msg) {
  hubErrorEl.textContent = msg;
  hubErrorEl.hidden = !msg;
}
const HUB_ERRORS = {
  permission: "Hush needs permission to reach this hub.",
  network:
    "Could not reach the hub. A self-signed certificate is not accepted; http:// inside the tailnet works.",
  unknown: "That code is not valid. Check it and try again.",
  expired: "That code has expired or was already used. Ask for a new one.",
};
function pairErrorText(error) {
  if (error === "network") return HUB_ERRORS.network;
  if (/expired|used|gone/i.test(error)) return HUB_ERRORS.expired;
  return HUB_ERRORS.unknown;
}

function connectHub() {
  if (hubBusy) return;
  const raw = hubUrlEl.value.trim();
  const code = hubCodeEl.value.trim().toUpperCase();
  const label = hubLabelEl.value.trim() || defaultDeviceLabel();
  let origin;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
    origin = u.origin;
  } catch {
    showHubError("Enter the hub address, starting with http:// or https://");
    return;
  }
  if (code.length !== 6) {
    showHubError("The code is six characters.");
    return;
  }
  showHubError("");
  hubBusy = true;
  hubConnectBtn.disabled = true;
  // Chrome only grants this when it is called synchronously inside the click
  // handler, before any await — so it is the first async call here.
  const asking = api.permissions.request({ origins: [origin + "/*"] });
  finishConnect(asking, origin, code, label);
}
async function finishConnect(asking, origin, code, label) {
  try {
    let granted = false;
    try { granted = await asking; } catch { granted = false; }
    if (!granted) {
      showHubError(HUB_ERRORS.permission);
      return;
    }
    let reply;
    try {
      reply = await api.runtime.sendMessage({ type: "hubPair", url: origin, code, label });
    } catch {
      reply = { ok: false, error: "network" };
    }
    if (!reply || !reply.ok) {
      showHubError(pairErrorText(reply && reply.error ? String(reply.error) : "network"));
      return;
    }
    hubCodeEl.value = "";
    // The background wrote `hub` before replying; repaint now rather than wait for onChanged.
    const s = await api.storage.local.get(["hub", "hubConfig", "hubStatus"]);
    applyHubKeys(s);
  } finally {
    hubBusy = false;
    hubConnectBtn.disabled = false;
  }
}
hubConnectBtn.addEventListener("click", connectHub);
for (const el of [hubUrlEl, hubCodeEl, hubLabelEl]) {
  el.addEventListener("keydown", e => { if (e.key === "Enter") connectHub(); });
}
hubOffForm.addEventListener("submit", e => e.preventDefault());
hubCodeEl.addEventListener("input", () => {
  hubCodeEl.value = hubCodeEl.value.toUpperCase();
});

function defaultDeviceLabel() {
  const ua = navigator.userAgent;
  const browserName = /Firefox\//.test(ua) ? "Firefox" : "Chrome";
  if (/Android/i.test(ua)) return `${browserName} on Android`;
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return `${browserName} on Linux`;
  return browserName;
}
hubLabelEl.value = defaultDeviceLabel();

/* ---------------- sync / disconnect ---------------- */
hubSyncBtn.addEventListener("click", async () => {
  hubSyncBtn.disabled = true;
  hubSyncInfoEl.textContent = "Syncing…";
  try {
    await api.runtime.sendMessage({ type: "hubSync" });
  } catch { /* the status below shows the outcome */ }
  const s = await api.storage.local.get(["hub", "hubConfig", "hubStatus"]);
  applyHubKeys(s);
  hubSyncBtn.disabled = false;
});

let disconnectArmed = false;
let disconnectTimer;
hubDisconnectBtn.addEventListener("click", async () => {
  if (lockedState) return; // a locked device is released by revoking it on the hub
  if (!disconnectArmed) {
    disconnectArmed = true;
    hubDisconnectBtn.classList.add("confirm");
    hubDisconnectBtn.textContent = "Disconnect?";
    disconnectTimer = setTimeout(disarmDisconnect, 2500);
    return;
  }
  disarmDisconnect();
  try {
    await api.runtime.sendMessage({ type: "hubDisconnect" });
  } catch { /* storage.onChanged repaints regardless */ }
  const s = await api.storage.local.get(["hub", "hubConfig", "hubStatus"]);
  applyHubKeys(s);
});
function disarmDisconnect() {
  clearTimeout(disconnectTimer);
  disconnectArmed = false;
  hubDisconnectBtn.classList.remove("confirm");
  hubDisconnectBtn.textContent = "Disconnect";
}

/* ---------------- locked profile ---------------- */
// Read-only rendering: reuses the paused-state mechanism (setControlsDisabled in
// panel.js reads controlsOff()), plus a banner. Lists stay visible.
function setLockedUI(locked) {
  lockedState = locked;
  document.body.classList.toggle("locked", locked);
  lockBannerEl.hidden = !locked;
  hubDisconnectBtn.disabled = locked;
  if (locked) disarmDisconnect();
  if (locked) lockTextEl.textContent = `Managed by ${hubDisplayName()}`;
  applyEnabledUI(enabledState); // re-runs setControlsDisabled
  paintSiteOptions();
  for (const id of Object.keys(siteRefs)) paintSite(id);
}

/* ---------------- revoked notice ---------------- */
function maybeShowRevoked() {
  const st = hubStatusState;
  if (!st || st.error !== "revoked" || hubState) return;
  const at = st.revokedAt || 1;
  api.storage.local.get("hubRevokedSeen").then(({ hubRevokedSeen }) => {
    if (hubRevokedSeen === at) return;
    showNotice(`This device was removed from ${hubDisplayName()}. Using your local words.`, () => {
      api.storage.local.set({ hubRevokedSeen: at });
    });
  });
}
// A toast with no Undo button; `onDismiss` runs when it times out.
function showNotice(message, onDismiss) {
  undoSnapshot = null;
  toastMsgEl.textContent = message;
  undoBtn.hidden = true;
  toastEl.classList.add("notice");
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { hideToast(); if (onDismiss) onDismiss(); }, 6000);
}

/* ---------------- state fan-in ---------------- */
// Called by init and by panel.js's onChanged listener with whichever of the hub
// keys; an absent key means that key was removed.
function applyHubKeys(s) {
  hubState = s.hub || null;
  hubConfigState = s.hubConfig || null;
  hubStatusState = s.hubStatus || null;
  paintHub();
  setLockedUI(!!(hubConfigState && hubConfigState.locked && hubState));
  maybeShowRevoked();
}
