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
});

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

// Per-tab badge text persists until changed, so clear it when a tab navigates
// away (e.g. to a non-monitored site) until the content script re-reports.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    api.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
