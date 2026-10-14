// Chrome loads only background.js (service_worker); Firefox lists the libs in
// manifest background.scripts, so this is a no-op there.
if (typeof importScripts === "function" && typeof compileRule === "undefined") {
  importScripts("lib/words.js", "lib/hubconfig.js", "lib/hubsync.js", "data/sites.js");
}

// Works in both Firefox (browser.*) and Chrome (chrome.*)
const api = typeof browser !== "undefined" ? browser : chrome;

// Registered top-level so the non-persistent event page can be woken by
// incoming messages and re-applies this on every wake.
api.action.setBadgeBackgroundColor({ color: "#d93a00" }).catch(() => {});

// All writes to the lifetime total funnel through this one event page and are
// serialized on a promise chain, so concurrent tabs can't lose updates
// (storage.local has no atomic increment).
let writeChain = Promise.resolve();

function addToLifetime(delta) {
  writeChain = writeChain.then(async () => {
    const { lifetimeHidden = 0 } = await api.storage.local.get("lifetimeHidden");
    await api.storage.local.set({ lifetimeHidden: lifetimeHidden + delta });
  }).catch(() => {});
  return writeChain;
}

function resetLifetime() {
  writeChain = writeChain.then(() =>
    api.storage.local.set({ lifetimeHidden: 0 })
  ).catch(() => {});
  return writeChain;
}

api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;

  // One-way notification from a content script: how many posts it has hidden
  // on its tab (tabCount) and how many were newly hidden this scan (delta).
  if (msg.type === "hidden" && sender.tab) {
    const tabId = sender.tab.id;
    const text = msg.tabCount > 0 ? String(msg.tabCount) : "";
    api.action.setBadgeText({ tabId, text }).catch(() => {});
    // Return the write promise so the non-persistent event page defers unload
    // until the storage write finishes (otherwise the increment can be lost).
    if (msg.delta > 0) return addToLifetime(msg.delta);
    return; // no write pending
  }

  // From the popup: wipe the persisted all-time total.
  if (msg.type === "resetTotal") {
    return resetLifetime().then(() => ({ ok: true }));
  }

  // From the popup, which has already obtained the host permission for the hub.
  if (msg.type === "hubPair") return hubPair(msg);
  if (msg.type === "hubSync") {
    return syncHubConfig("manual").then(() => api.storage.local.get("hubStatus"))
      .then(({ hubStatus }) => hubStatus || null);
  }
  if (msg.type === "hubDisconnect") return hubDisconnect();
});

// ---- Household hub (config flows down; nothing is ever uploaded) ----
// The background is the ONLY writer of `hub`, `hubConfig` and `hubStatus` and the
// only place that talks to the hub. The popup and content script just read them.
// All writes funnel through syncChain (storage.local has no transactions), like writeChain.
// The decision table itself is in lib/hubsync.js.
const HUB_ALARM = "hub-sync";
const HUB_FETCH_TIMEOUT_MS = 10000;
const HUB_STALE_MS = 5 * 60 * 1000;
let syncChain = Promise.resolve();

function onSyncChain(task) {
  const run = syncChain.then(task);
  syncChain = run.catch(() => {});
  return run;
}

function ensureHubAlarm() {
  return api.alarms.create(HUB_ALARM, { periodInMinutes: 15 });
}

async function hubFetch(url, options) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HUB_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function syncHubConfig(reason) {
  return onSyncChain(async () => {
    const { hub, hubConfig, hubStatus } =
      await api.storage.local.get(["hub", "hubConfig", "hubStatus"]);
    if (!hub) return;
    const headers = { Authorization: "Bearer " + hub.token };
    if (hubConfig && hubConfig.etag) headers["If-None-Match"] = hubConfig.etag;
    let status = 0;
    let body;
    let etag = null;
    let res;
    try {
      res = await hubFetch(hub.url + "/api/device/config", { headers });
      status = res.status;
      etag = res.headers.get("ETag");
    } catch {
      status = 0; // network error or timeout
    }
    if (status === 200) {
      try { body = await res.json(); } catch { body = null; } // unreadable → 'invalid'
    }
    const d = decideSync({
      status, body, etag,
      previous: { hubConfig, hubStatus },
      now: Date.now(),
      siteIds: SITES.map((s) => s.id),
    });
    if (d.clearHub) {
      await api.storage.local.remove(["hub", "hubConfig"]);
      await api.alarms.clear(HUB_ALARM);
    } else if (d.hubConfig) {
      await api.storage.local.set({ hubConfig: d.hubConfig });
    }
    await api.storage.local.set({ hubStatus: d.hubStatus });
  });
}

function hubPair({ url, code, label }) {
  return onSyncChain(async () => {
    let origin;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      origin = u.origin;
    } catch {
      return { ok: false, error: "network" };
    }
    let res;
    try {
      res = await hubFetch(origin + "/api/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: String(code || "").toUpperCase(),
          label,
          browser: typeof browser !== "undefined" ? "firefox" : "chrome",
        }),
      });
    } catch {
      return { ok: false, error: "network" };
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }
    if (res.status !== 201 || !data) {
      const error = data && typeof data.error === "string" ? data.error : "network";
      return { ok: false, error };
    }
    await api.storage.local.set({
      hub: {
        url: origin,
        deviceId: data.deviceId,
        token: data.token,
        profileName: data.profileName,
        hubName: data.hubName,
        pairedAt: Date.now(),
      },
    });
    await api.storage.local.remove(["hubConfig", "hubStatus"]);
    await ensureHubAlarm();
    return { ok: true, profileName: data.profileName, hubName: data.hubName };
  }).then(async (reply) => {
    if (reply.ok) await syncHubConfig("pair");
    return reply;
  });
}

function hubDisconnect() {
  return onSyncChain(async () => {
    const { hub, hubConfig } = await api.storage.local.get(["hub", "hubConfig"]);
    // Defence in depth: a locked device cannot self-disconnect; revoke it on the hub.
    if (hubConfig && hubConfig.locked) return { ok: false, error: "locked" };
    await api.alarms.clear(HUB_ALARM);
    await api.storage.local.remove(["hub", "hubConfig", "hubStatus"]);
    if (hub) {
      try {
        await api.permissions.remove({ origins: [hub.url + "/*"] });
      } catch { /* best effort */ }
    }
    return { ok: true };
  });
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HUB_ALARM) syncHubConfig("alarm").catch(() => {});
});

function hubStartup() {
  api.storage.local.get("hub").then(({ hub }) => {
    if (hub) return ensureHubAlarm(); // the wake check below does the stale sync
  }).catch(() => {});
}
api.runtime.onInstalled.addListener(hubStartup);
api.runtime.onStartup.addListener(hubStartup);

// Managed-storage seeding. A per-user native manifest (or an enterprise policy)
// can hand Hush a default configuration — see browser/hush/managed-storage.json
// in the repo, installed by setup.sh. It is copied into storage.local exactly
// once: the first time Hush runs with no blockWords of its own. An existing
// install is never overwritten, and turning packs back off after the seed
// sticks (the `seededFromManaged` flag stops a second seed). This is the one
// blockWords write outside the popup's queueWrite chain; it only ever runs when
// the key doesn't exist yet, so there is nothing for it to race with.
const SEED_KEYS = ["blockWords", "enabledPacks", "siteWords", "ytHomeRedirect", "advanced"];

async function seedFromManaged() {
  let managed;
  try {
    managed = await api.storage.managed.get(SEED_KEYS);
  } catch {
    return; // no managed manifest for this extension (the normal case)
  }
  if (!managed) return;
  const seed = {};
  for (const key of SEED_KEYS) {
    if (managed[key] !== undefined) seed[key] = managed[key];
  }
  if (Object.keys(seed).length === 0) return;
  const { blockWords, seededFromManaged } =
    await api.storage.local.get(["blockWords", "seededFromManaged"]);
  if (blockWords !== undefined || seededFromManaged) return; // already configured
  await api.storage.local.set({ ...seed, seededFromManaged: true });
}

// Runs on every wake of the event page; it's a cheap read and a no-op once seeded.
seedFromManaged().catch(() => {});

// Same cheap check on every wake: sync if the last attempt is stale.
api.storage.local.get(["hub", "hubStatus"]).then(({ hub, hubStatus }) => {
  const last = (hubStatus && hubStatus.lastAttempt) || 0;
  if (hub && Date.now() - last > HUB_STALE_MS) return syncHubConfig("wake");
}).catch(() => {});

// Per-tab badge text persists until changed, so clear it when a tab navigates
// away (e.g. to a non-monitored site) until the content script re-reports.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    api.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
