"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  escapeRegex,
  parseWord,
  composeWord,
  compileRule,
  matchesAny,
  dedupeWords,
  resolvePackWords,
  buildRules,
} = require("../src/lib/words.js");

test("escapeRegex neutralizes regex metacharacters", () => {
  assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
  assert.equal(escapeRegex("(x)"), "\\(x\\)");
});

test("parseWord splits the leading = and trims", () => {
  assert.deepEqual(parseWord("cat"), { whole: false, text: "cat" });
  assert.deepEqual(parseWord("=cat"), { whole: true, text: "cat" });
  assert.deepEqual(parseWord("=  cat "), { whole: true, text: "cat" });
  assert.deepEqual(parseWord("  spaced  "), { whole: false, text: "spaced" });
  assert.deepEqual(parseWord(""), { whole: false, text: "" });
  assert.deepEqual(parseWord(null), { whole: false, text: "" });
});

test("composeWord is the inverse of parseWord", () => {
  // For already-canonical inputs, compose(parse(raw)) round-trips exactly.
  for (const raw of ["cat", "=cat", "plot twist", "=café"]) {
    const { whole, text } = parseWord(raw);
    assert.equal(composeWord(whole, text), raw);
  }
  assert.equal(composeWord(true, "dog"), "=dog");
  assert.equal(composeWord(false, "dog"), "dog");
});

test("compileRule returns null for empty / whitespace words", () => {
  assert.equal(compileRule(""), null);
  assert.equal(compileRule("   "), null);
  assert.equal(compileRule("="), null);
});

test("compileRule lowercases the needle and skips the regex for substrings", () => {
  const rule = compileRule("Cat");
  assert.equal(rule.needle, "cat");
  assert.equal(rule.re, null);
});

test("compileRule builds a word-boundary regex for whole-word rules", () => {
  const rule = compileRule("=cat");
  assert.ok(rule.re instanceof RegExp);
  assert.ok(rule.re.test("a cat sat"));
  assert.ok(!rule.re.test("category"));
  assert.ok(!rule.re.test("scat"));
});

test("matchesAny does case-insensitive substring matching by default", () => {
  const rules = [compileRule("cat")];
  assert.ok(matchesAny("Category theory", rules)); // substring, case-insensitive
  assert.ok(matchesAny("the CAT", rules));
  assert.ok(!matchesAny("dogs only", rules));
});

test("matchesAny respects whole-word rules", () => {
  const rules = [compileRule("=cat")];
  assert.ok(matchesAny("a cat sat", rules));
  assert.ok(!matchesAny("category", rules));
});

test("matchesAny supports non-ASCII whole-word boundaries", () => {
  const rules = [compileRule("=café")];
  assert.ok(matchesAny("the café opened", rules));
  assert.ok(!matchesAny("cafétéria", rules));
});

test("matchesAny tolerates empty input and empty rule sets", () => {
  assert.equal(matchesAny("", [compileRule("cat")]), false);
  assert.equal(matchesAny("anything", []), false);
  assert.equal(matchesAny(null, []), false);
});

test("dedupeWords removes case-insensitive duplicates, keeping the first form", () => {
  assert.deepEqual(dedupeWords(["Cat", "cat", "CAT"]), ["Cat"]);
  assert.deepEqual(dedupeWords(["a", " a ", "b"]), ["a", "b"]);
  assert.deepEqual(dedupeWords(["x", "", "  ", "y"]), ["x", "y"]);
  assert.deepEqual(dedupeWords([]), []);
  assert.deepEqual(dedupeWords(null), []);
});

test("resolvePackWords returns words only for enabled packs", () => {
  const packs = [
    { name: "A", words: ["a1", "a2"] },
    { name: "B", words: ["b1"] },
  ];
  assert.deepEqual(resolvePackWords(packs, ["A"]), ["a1", "a2"]);
  assert.deepEqual(resolvePackWords(packs, ["A", "B"]), ["a1", "a2", "b1"]);
  assert.deepEqual(resolvePackWords(packs, ["missing"]), []);
  assert.deepEqual(resolvePackWords(packs, []), []);
  assert.deepEqual(resolvePackWords(null, ["A"]), []);
});

test("buildRules unions custom + enabled-pack words and dedupes", () => {
  const packs = [{ name: "Pets", words: ["cat", "=dog"] }];
  const rules = buildRules(["bird", "cat"], packs, ["Pets"]);
  // "cat" appears in both sources but compiles once.
  const needles = rules.map(r => r.needle).sort();
  assert.deepEqual(needles, ["bird", "cat", "dog"]);
  // The pack's "=dog" kept its whole-word regex through the union.
  const dog = rules.find(r => r.needle === "dog");
  assert.ok(dog.re instanceof RegExp);
  assert.ok(!dog.re.test("dogma"));
});

test("buildRules works with no packs enabled", () => {
  const rules = buildRules(["solo"], [{ name: "P", words: ["x"] }], []);
  assert.deepEqual(rules.map(r => r.needle), ["solo"]);
});

test("buildRules folds in per-site words and dedupes across all sources", () => {
  const packs = [{ name: "Pets", words: ["cat"] }];
  // custom: bird; pack: cat; per-site: =dog (whole-word) + bird (dup of custom)
  const rules = buildRules(["bird"], packs, ["Pets"], ["=dog", "bird"]);
  const needles = rules.map(r => r.needle).sort();
  assert.deepEqual(needles, ["bird", "cat", "dog"]); // "bird" compiled once
  // The per-site "=dog" kept its whole-word regex through the union.
  const dog = rules.find(r => r.needle === "dog");
  assert.ok(dog.re instanceof RegExp);
  assert.ok(dog.re.test("a dog ran"));
  assert.ok(!dog.re.test("dogma"));
});

test("buildRules treats an omitted/empty siteWords arg as no per-site words", () => {
  const a = buildRules(["x"], [], []);
  const b = buildRules(["x"], [], [], []);
  assert.deepEqual(a.map(r => r.needle), b.map(r => r.needle));
  assert.deepEqual(a.map(r => r.needle), ["x"]);
});
