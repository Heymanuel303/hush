// Hush — hub sync decision table.
//
// Pure state machine behind background.js's syncHubConfig(): given what the hub answered,
// decide what to store. No fetch, no storage, no clock of its own, so it is unit-tested
// without extension APIs. background.js only wires fetch and storage around it.
//
// Failure table (nothing here ever clears `locked` or the config on a failure):
//   200 valid    → store config + etag, status cleared
//   200 invalid  → keep previous config, error 'invalid'
//   304          → lastSync only
//   401          → drop hub + config (device falls back to local), error 'revoked'
//   network/5xx/other → keep everything, error 'offline', offlineSince set once
//
// Needs `validateDeviceConfig` from lib/hubconfig.js (and `compileRule` from lib/words.js)
// in the shared scope, or a `validate(body)` function passed in (the tests do).

// → { hubConfig, hubStatus, clearHub }
//   hubConfig: object to store, or undefined to leave the stored one untouched
//   hubStatus: the complete new status object
//   clearHub:  true → remove `hub` and `hubConfig`
// `status` is the HTTP status, or 0 / null when the request failed (network, timeout).
function decideSync({ status, body, etag, previous, now, siteIds, validate }) {
  const prev = (previous && previous.hubStatus) || {};
  const t = typeof now === "number" ? now : Date.now();
  const base = {
    lastSync: prev.lastSync || null,
    lastAttempt: t,
    error: null,
    offlineSince: null,
    revokedAt: null,
  };

  if (status === 200) {
    const check = validate
      ? validate(body)
      : validateDeviceConfig(body, siteIds);
    if (check && check.ok) {
      return {
        hubConfig: { ...check.config, etag: etag || null },
        hubStatus: { ...base, lastSync: t },
        clearHub: false,
      };
    }
    return { hubConfig: undefined, hubStatus: { ...base, error: "invalid" }, clearHub: false };
  }

  if (status === 304) {
    return { hubConfig: undefined, hubStatus: { ...base, lastSync: t }, clearHub: false };
  }

  if (status === 401) {
    return {
      hubConfig: undefined,
      hubStatus: { ...base, lastSync: null, error: "revoked", revokedAt: t },
      clearHub: true,
    };
  }

  return {
    hubConfig: undefined,
    hubStatus: { ...base, error: "offline", offlineSince: prev.offlineSince || t },
    clearHub: false,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { decideSync };
}
