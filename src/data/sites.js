// Hush — site registry.
//
// The single curated list of sites Hush operates on. Loaded as a plain <script>
// in both browser contexts — the content script (manifest `content_scripts`,
// listed before content.js) and the popup (panel.html, before panel.js) — so
// both share these definitions through the surrounding scope, and `require()`d
// by the Node test suite via the trailing `module.exports`.
//
// To add a site you (or a contributor) curate THREE places together:
//   1. an entry here — `id` + `label` + the host substrings that identify it,
//   2. its URL `matches` pattern(s) in manifest.json `content_scripts`,
//   3. its DOM "post unit" selectors in getSelectors() (content.js).
//
// The `id` is the stable key for that site's words in the `siteWords` store, so
// renaming an id drops its saved per-site words (same rule as a pack `name`).
const SITES = [
  { id: "Reddit",  label: "Reddit",  hosts: ["reddit.com"] },
  { id: "X",       label: "X",       hosts: ["x.com", "twitter.com"] },
  { id: "YouTube", label: "YouTube", hosts: ["youtube.com"] },
  { id: "Google",  label: "Google",  hosts: ["google."] },
];

// Map a hostname (location.hostname) to a site id, or null if unsupported.
// Mirrors the host patterns in manifest.json `content_scripts`. This is the
// single source of truth for "which curated site is this?" — content.js's
// currentSite() delegates here so the popup and the matcher can never disagree.
function siteIdForHost(host) {
  const h = String(host || "");
  for (const site of SITES) {
    if (site.hosts.some(frag => h.includes(frag))) return site.id;
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SITES, siteIdForHost };
}
