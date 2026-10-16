// Hush — popup: Household hub section + locked (read-only) rendering.
//
// The "Connect to a hub" form, connected status, sync/disconnect, the "Managed by
// <hub>" banner and the revoked toast. Shares the global scope with the other
// panel-*.js files (see panel.js). The hub keys (`hub`, `hubConfig`, `hubStatus`)
// are written ONLY by background.js; this file just reads them and sends the
// hubPair / hubSync / hubDisconnect messages, so there is no write chain or echo
// counter. The one key the popup writes is `hubRevokedSeen` (a revokedAt
// timestamp) so the revoked toast shows once per revocation, not on every open.

let lastHubName = ""; // survives a revoke (background drops `hub`) so the toast can still name the hub
let hubBusy = false;

function hubDisplayName() {
  return (hubState && hubState.hubName) || lastHubName || "the hub";
}

/* ---------------- paint ---------------- */
// One paint for every state; CSS keys off `data-hub-state` on the panel.
function hubStateName() {
  const err = hubStatusState && hubStatusState.error;
  if (!hubState) {
    if (hubBusy) return "connecting";
    return err === "revoked" ? "revoked" : "off";
  }
  if (lockedState) return "locked";
  if (err === "offline" || err === "invalid") return err;
  return "on";
}
function paintHub() {
  const connected = !!hubState;
  if (connected && hubState.hubName) lastHubName = hubState.hubName;
  const state = hubStateName();
  hubPanelEl.dataset.hubState = state;
  hubOffForm.hidden = connected;
  hubOnView.hidden = !connected;
  paintTabDot();

  hubConnectBtn.disabled = hubBusy;
  hubConnectBtn.textContent = hubBusy ? "Connecting…" : "Connect";
  const revoked = state === "revoked";
  hubRevokedLineEl.hidden = !revoked;
  hubRevokedLineEl.textContent = revoked
    ? `This browser was removed from ${hubDisplayName()}. Your own words still work.` : "";
  hubHelpEl.textContent = revoked
    ? "To rejoin, get a new code on the hub."
    : "Get a code on the hub: Devices → Pair a device. It expires in 10 minutes.";

  if (!connected) { clearTimeout(quietTimer); return; }
  const st = hubStatusState || {};
  hubSummaryEl.textContent = hubState.profileName;
  hubFromEl.textContent = st.lastSync
    ? `from ${hubState.hubName} · synced ${formatAgo(st.lastSync)}`
    : `from ${hubState.hubName} · not synced yet`;
  paintQuiet();
  hubPausedEl.hidden = enabledState || lockedState;
  const line = syncInfoText();
  hubSyncInfoEl.textContent = line;
  hubSyncInfoEl.hidden = !line;
  hubSyncInfoEl.classList.toggle("warn", state === "offline" || state === "invalid");
  hubDisconnectBtn.hidden = lockedState;
  hubLockedNoteEl.hidden = !lockedState;
}
let quietTimer;
function timeOnly(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function quietText(now = new Date()) {
  const q = hubConfigState && hubConfigState.quietHours;
  if (!q || !q.windows || !q.windows.length) return { text: "Hub rules apply all day", next: null };
  const next = nextBoundary(q, now);
  if (!next) return { text: "Hub rules apply all day", next: null };
  const tz = q.timezone && q.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone
    ? ` (${q.timezone})` : "";
  const t = timeOnly(next) + tz;
  return {
    text: isQuiet(q, now) ? `Hub rules apply now, until ${t}` : `Hub rules start at ${t}`,
    next,
  };
}
function paintQuiet() {
  clearTimeout(quietTimer);
  const { text, next } = quietText();
  hubQuietEl.textContent = text;
  if (next) {
    // Re-run when a window edge passes while the popup stays open.
    quietTimer = setTimeout(paintQuiet, Math.max(1000, next.getTime() - Date.now() + 500));
  }
}
window.addEventListener("pagehide", () => clearTimeout(quietTimer));
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
    return `Can't reach ${hubState.hubName}. Using the rules from ${st.offlineSince ? clockTime(st.offlineSince) : "the last sync"}.`;
  }
  if (st.error === "invalid") {
    return "The hub sent rules Hush can't use. Keeping the last good set.";
  }
  return "";
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
  paintHub();
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
    paintHub();
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
  hubSyncInfoEl.hidden = false;
  hubSyncInfoEl.classList.remove("warn");
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
    hubDisconnectBtn.textContent = "Press again to disconnect";
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
  hubDisconnectBtn.hidden = locked;
  hubLockedNoteEl.hidden = !locked;
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
    showNotice(`This browser was removed from ${hubDisplayName()}. Your own words still work.`, () => {
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
