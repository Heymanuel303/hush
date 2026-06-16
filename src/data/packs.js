// Word Block — starter packs.
//
// Optional keyword bundles shown as on/off toggles in the popup. Loaded as a
// plain <script> by panel.html (before panel.js) and by content.js (manifest
// `content_scripts`, listed before content.js) so the same PACKS array resolves
// an enabled pack's name to its words for matching. It is also `require()`d by
// the Node test suite via the trailing `module.exports`.
//
// This is purely local data — nothing is fetched, nothing leaves the browser —
// so it keeps the "data_collection: none" promise. PACKS must stay a top-level
// `const` so the next script in the shared browser scope can see it.
//
// Edit freely. Each pack is { name, words: [...] }. A pack's `name` is the stable
// id stored in `enabledPacks`, so renaming a pack drops its toggle state. A
// leading "=" on a word means whole-word match (same convention as the keyword
// list), handy for short words that would otherwise over-match (e.g. "=nba"
// won't hit "unbathed").
const PACKS = [
  { name: "Spoilers",  words: ["spoiler", "spoilers", "leaked", "=ending", "plot twist"] },
  { name: "Politics",  words: ["election", "politics", "congress", "=senate", "president"] },
  { name: "Crypto",    words: ["crypto", "bitcoin", "ethereum", "=nft", "altcoin"] },
  { name: "Sports",    words: ["=nfl", "=nba", "playoffs", "world cup", "premier league"] },
  { name: "Celebrity", words: ["kardashian", "celebrity gossip", "red carpet"] },
  // Mainly for Google: each result's text includes its displayed URL, so a bare
  // domain name here hides results from that site (the classic "clean up my
  // search" list — edit to taste). Kept as substrings, not "=" whole-word:
  // Google runs result fields together (e.g. "quora.com›Next"), so a trailing
  // word boundary often wouldn't match. On Reddit/X/YouTube these just match as
  // ordinary words.
  { name: "Search Spam", words: ["pinterest", "quora", "fandom", "ehow", "ask.com"] },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PACKS };
}
