const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { HUB_CAPS, validateDeviceConfig } = require("../src/lib/hubconfig.js");
const { compileRule } = require("../src/lib/words.js");
const { SITES } = require("../src/data/sites.js");

const dir = path.join(__dirname, "fixtures/device-config");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const siteIds = SITES.map((s) => s.id);
const validate = (obj) => validateDeviceConfig(obj, siteIds, compileRule);
const base = () => load("valid-minimal.json");

test("HUB_CAPS matches the shared caps fixture", () => {
  assert.deepEqual(HUB_CAPS, load("caps.json"));
});

for (const f of fs.readdirSync(dir).filter((n) => /^valid-.*\.json$/.test(n))) {
  test(`${f} passes and keeps its words`, () => {
    const input = load(f);
    const r = validate(input);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.config.blockWords, input.blockWords);
    assert.deepEqual(r.config.packs, input.packs);
    assert.deepEqual(r.config.siteWords, input.siteWords);
    assert.deepEqual(r.config, input);
  });
}

for (const f of fs.readdirSync(dir).filter((n) => /^invalid-.*\.json$/.test(n))) {
  test(`${f} is rejected with a reason`, () => {
    const r = validate(load(f));
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === "string" && r.error.length > 0);
  });
}

test("a 64-character word passes, 65 rejects", () => {
  const c = base();
  c.blockWords = ["a".repeat(64)];
  assert.equal(validate(c).ok, true);
  c.blockWords = ["a".repeat(65)];
  assert.equal(validate(c).ok, false);
});

test("a '='-only word rejects", () => {
  const c = base();
  c.blockWords = ["="];
  assert.equal(validate(c).ok, false);
});

test("an unknown site key rejects", () => {
  const c = base();
  c.siteWords = { Nope: ["x"] };
  assert.equal(validate(c).ok, false);
});

test("a non-boolean or unknown site option rejects", () => {
  const c = base();
  c.siteOptions = { ytHomeRedirect: "yes" };
  assert.equal(validate(c).ok, false);
  c.siteOptions = { somethingElse: true };
  assert.equal(validate(c).ok, false);
});

test("over-cap arrays reject rather than truncate", () => {
  const c = base();
  c.blockWords = Array.from({ length: HUB_CAPS.maxWords + 1 }, (_, i) => "w" + i);
  assert.equal(validate(c).ok, false);
  const d = base();
  d.siteWords = { Reddit: Array.from({ length: HUB_CAPS.maxSiteWords + 1 }, (_, i) => "w" + i) };
  assert.equal(validate(d).ok, false);
  const e = base();
  e.packs = [{ name: "P", words: Array.from({ length: HUB_CAPS.maxPackWords + 1 }, (_, i) => "w" + i) }];
  assert.equal(validate(e).ok, false);
});

test("unknown top-level keys are dropped and strings trimmed", () => {
  const c = base();
  c.extra = "x";
  c.profileName = "  Kid  ";
  c.blockWords = ["  =cat  "];
  const r = validate(c);
  assert.equal(r.ok, true);
  assert.equal("extra" in r.config, false);
  assert.equal(r.config.profileName, "Kid");
  assert.deepEqual(r.config.blockWords, ["=cat"]);
});

test("non-object input rejects without throwing", () => {
  for (const v of [null, undefined, 1, "x", []]) assert.equal(validate(v).ok, false);
});
