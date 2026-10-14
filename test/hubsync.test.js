const test = require("node:test");
const assert = require("node:assert/strict");
const { decideSync } = require("../src/lib/hubsync.js");
const { validateDeviceConfig } = require("../src/lib/hubconfig.js");
const { compileRule } = require("../src/lib/words.js");
const { SITES } = require("../src/data/sites.js");

const siteIds = SITES.map((s) => s.id);
const validate = (b) => validateDeviceConfig(b, siteIds, compileRule);
const good = {
  version: 3, profileName: "Kid", locked: true, blockWords: ["=cat"], enabledPacks: [],
  packs: [], siteWords: {}, siteOptions: {}, quietHours: null,
};
const prevConfig = { ...good, version: 2, etag: '"old"' };
const run = (o) => decideSync({ now: 1000, validate, previous: {}, ...o });

test("200 valid stores config with etag and clears status", () => {
  const r = run({
    status: 200, body: good, etag: '"v3"',
    previous: { hubStatus: { error: "offline", offlineSince: 5 } },
  });
  assert.equal(r.clearHub, false);
  assert.equal(r.hubConfig.etag, '"v3"');
  assert.equal(r.hubConfig.locked, true);
  assert.deepEqual(r.hubStatus, { lastSync: 1000, lastAttempt: 1000, error: null, offlineSince: null, revokedAt: null });
});

test("200 invalid keeps previous config and flags invalid", () => {
  const r = run({
    status: 200, body: { ...good, locked: "yes" },
    previous: { hubConfig: prevConfig, hubStatus: { lastSync: 500 } },
  });
  assert.equal(r.hubConfig, undefined);
  assert.equal(r.clearHub, false);
  assert.equal(r.hubStatus.error, "invalid");
  assert.equal(r.hubStatus.lastSync, 500);
});

test("304 only advances lastSync", () => {
  const r = run({ status: 304, previous: { hubStatus: { lastSync: 1, error: "offline", offlineSince: 2 } } });
  assert.equal(r.hubConfig, undefined);
  assert.equal(r.hubStatus.lastSync, 1000);
  assert.equal(r.hubStatus.error, null);
  assert.equal(r.hubStatus.offlineSince, null);
});

test("401 drops the hub and records revocation", () => {
  const r = run({ status: 401 });
  assert.equal(r.clearHub, true);
  assert.equal(r.hubStatus.error, "revoked");
  assert.equal(r.hubStatus.revokedAt, 1000);
});

test("network error and 5xx keep everything; offlineSince is set once", () => {
  const first = run({ status: 0 });
  assert.equal(first.hubStatus.error, "offline");
  assert.equal(first.hubStatus.offlineSince, 1000);
  assert.equal(first.clearHub, false);
  assert.equal(first.hubConfig, undefined);
  const again = decideSync({ status: 503, now: 2000, validate, previous: { hubStatus: first.hubStatus } });
  assert.equal(again.hubStatus.offlineSince, 1000);
  assert.equal(again.hubStatus.lastAttempt, 2000);
});
