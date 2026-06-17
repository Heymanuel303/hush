"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SITES, siteIdForHost } = require("../src/data/sites.js");

test("SITES is a non-empty list of well-formed entries", () => {
  assert.ok(Array.isArray(SITES) && SITES.length > 0);
  for (const s of SITES) {
    assert.equal(typeof s.id, "string");
    assert.ok(s.id.length > 0);
    assert.equal(typeof s.label, "string");
    assert.ok(s.label.length > 0);
    assert.ok(Array.isArray(s.hosts) && s.hosts.length > 0);
    assert.ok(s.hosts.every(h => typeof h === "string" && h.length > 0));
  }
});

test("site ids are unique (so siteWords keys never collide)", () => {
  const ids = SITES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("siteIdForHost maps known hosts to the curated id", () => {
  assert.equal(siteIdForHost("www.reddit.com"), "Reddit");
  assert.equal(siteIdForHost("old.reddit.com"), "Reddit");
  assert.equal(siteIdForHost("x.com"), "X");
  assert.equal(siteIdForHost("twitter.com"), "X"); // legacy domain still maps to X
  assert.equal(siteIdForHost("www.youtube.com"), "YouTube");
  assert.equal(siteIdForHost("m.youtube.com"), "YouTube");
  assert.equal(siteIdForHost("www.google.com"), "Google");
  assert.equal(siteIdForHost("www.google.co.uk"), "Google");
});

test("siteIdForHost returns null for unsupported / empty hosts", () => {
  assert.equal(siteIdForHost("example.com"), null);
  assert.equal(siteIdForHost(""), null);
  assert.equal(siteIdForHost(null), null);
  assert.equal(siteIdForHost(undefined), null);
});
