// Word Block — word rules.
//
// The single source of truth for the "=" whole-word convention and for matching
// post text against the active block list. Keeping this logic in one file is what
// guarantees the content script and the popup never disagree about what a stored
// word means.
//
// Loaded as a plain <script> in two browser contexts (so both share these
// definitions through the surrounding scope):
//   • the content script — manifest `content_scripts`, listed before content.js
//   • the popup          — panel.html, listed before panel.js
// and `require()`d directly by the Node test suite. The trailing `module.exports`
// is a no-op in the browser (there is no CommonJS there) and the export hook for
// `node --test`.
//
// Convention — a raw word may carry a leading "=" meaning "whole word only":
//   "cat"  → case-insensitive substring   ("category" matches)
//   "=cat" → whole word only              ("category" does NOT match)

// Escape a user-supplied string for safe inclusion in a RegExp.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Split a stored raw word into its display text and whole-word flag. Trims around
// the "=" so a hand-typed "=  cat" behaves exactly like "=cat".
function parseWord(raw) {
  const s = String(raw || "").trim();
  return s[0] === "="
    ? { whole: true, text: s.slice(1).trim() }
    : { whole: false, text: s };
}

// Inverse of parseWord: build the stored raw form from a flag + display text.
function composeWord(whole, text) {
  return whole ? "=" + text : text;
}

// Compile one raw word into a matcher rule. Whole-word rules pre-build a Unicode
// word-boundary regex once; bare words keep a lowercased substring needle.
// Returns null for an empty word so callers can filter it out.
function compileRule(raw) {
  const { whole, text } = parseWord(raw);
  const needle = text.toLowerCase();
  if (!needle) return null;
  let re = null;
  if (whole) {
    try {
      // \p{L}\p{N}_ boundaries so "=cat" matches "cat" but not "category" or
      // "scat", and works for non-ASCII scripts too. Falls back to a substring
      // match if the engine can't build the pattern.
      re = new RegExp(
        "(?<![\\p{L}\\p{N}_])" + escapeRegex(needle) + "(?![\\p{L}\\p{N}_])",
        "u"
      );
    } catch (e) {
      re = null;
    }
  }
  return { needle, re };
}

// True if `text` matches any compiled rule. Lowercases the text once; rules
// already hold lowercased needles / case-insensitive regexes.
function matchesAny(text, rules) {
  const lower = String(text || "").toLowerCase();
  return (rules || []).some(r =>
    r.re ? r.re.test(lower) : lower.includes(r.needle)
  );
}

// Dedupe raw words case-insensitively (after trimming), keeping the first form
// seen and dropping empties. Used to merge custom words with enabled-pack words
// so an overlapping entry compiles only once.
function dedupeWords(words) {
  const seen = new Set();
  const out = [];
  for (const w of words || []) {
    const key = String(w || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

// Collect the raw words of every pack whose `name` appears in `enabledPacks`.
function resolvePackWords(packs, enabledPacks) {
  const on = new Set(enabledPacks || []);
  const out = [];
  for (const pack of packs || []) {
    if (pack && on.has(pack.name)) out.push(...(pack.words || []));
  }
  return out;
}

// Build the active compiled rule set from the union of custom words and the words
// of every enabled pack: dedupe the raw union, then compile each survivor.
function buildRules(customWords, packs, enabledPacks) {
  const raw = dedupeWords([
    ...(customWords || []),
    ...resolvePackWords(packs, enabledPacks),
  ]);
  return raw.map(compileRule).filter(Boolean);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeRegex,
    parseWord,
    composeWord,
    compileRule,
    matchesAny,
    dedupeWords,
    resolvePackWords,
    buildRules,
  };
}
