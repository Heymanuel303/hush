"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { PACKS } = require("../src/data/packs.js");
const { compileRule } = require("../src/lib/words.js");

test("PACKS is a non-empty array", () => {
  assert.ok(Array.isArray(PACKS));
  assert.ok(PACKS.length > 0);
});

test("every pack has a non-empty string name", () => {
  for (const pack of PACKS) {
    assert.equal(typeof pack.name, "string");
    assert.ok(pack.name.trim().length > 0);
  }
});

test("pack names are unique (they are the stable id in enabledPacks)", () => {
  const names = PACKS.map(p => p.name);
  assert.equal(new Set(names).size, names.length);
});

test("every pack has at least one word, all non-empty strings", () => {
  for (const pack of PACKS) {
    assert.ok(Array.isArray(pack.words));
    assert.ok(pack.words.length > 0, `${pack.name} has no words`);
    for (const word of pack.words) {
      assert.equal(typeof word, "string", `${pack.name} has a non-string word`);
      assert.ok(word.trim().length > 0, `${pack.name} has an empty word`);
    }
  }
});

test("every pack word compiles to a usable rule", () => {
  for (const pack of PACKS) {
    for (const word of pack.words) {
      assert.notEqual(compileRule(word), null, `${pack.name}: "${word}" failed to compile`);
    }
  }
});
