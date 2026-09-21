# Phase 2: Mobile Google selectors

**Plan:** [mobile-firefox-support](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context

The feature goal is to make Hush work in Firefox for Android (sideloaded signed `.xpi`, sites optionally installed as home-screen web apps). `getSelectors()` in `src/content.js` currently targets the desktop Google SERP; mobile Google serves from the same `www.google.com` host (so host matching and manifest `matches` already cover it) but some mobile layouts wrap results without `#rso` or with rotated classes, so matching posts are never found and nothing is hidden. This phase appends mobile-oriented fallback selectors to the Google branch only. Phase 1 appends mobile fallbacks to the YouTube branch of the same function — if both run, run them sequentially in the same tree (per the overview's "Dependency shape") to avoid a merge.

## Objective

Make the Google branch of `getSelectors()` in `src/content.js` hide results on the mobile google.com SERP.

## Files to touch

- `src/content.js` — the **only** file to edit. Inside the `if (HOST.includes("google."))` branch of `getSelectors()` (currently lines 90–114), append mobile-SERP fallback selectors to the returned array, with a short comment block above the mobile group and a trailing `//` comment per selector.

## Steps

1. Open `src/content.js` and locate the Google branch of `getSelectors()` (`if (HOST.includes("google."))`, lines 90–114). Confirm the existing shape before editing:
   - the vertical guard at lines 100–102 — `const p = new URLSearchParams(location.search); const udm = p.get("udm"); if (p.get("tbm") || (udm && udm !== "14")) return [];` — returning `[]` for Images/News/Videos/Shopping;
   - the five existing selectors at lines 103–113: `"#rso .MjjYud"`, `".vt6azd:not(.g-blk)"`, `".Ww4FFb"`, `"#rso div.g"`, `"#rso > div[data-hveid]"`.

   **Keep the guard and every existing selector exactly as they are.** This is a selector-only edit: do not touch `hide()`, `unhideAll()`, `scan()`, `handleRouteChange()`, `scheduleScan()`, the `data-kb-hidden`/`data-kb-counted` flags, or `pendingDelta`/`deltaInFlight` delivery.

2. Append the mobile fallback group to the **end** of the returned array (after `"#rso > div[data-hveid]"`), preceded by a short comment block that mirrors the style of the existing Google comment at lines 91–99. The comment should say, in that style:
   - the mobile SERP mostly shares markup with desktop (`.Ww4FFb` is already commented as "organic root, alternate/mobile layout", so present these as **additional mobile-only-wrapper fallbacks**, not as first mobile support);
   - these fallbacks cover mobile layouts where `#rso` is absent or classes rotated;
   - they are drafted from known markup and **must be verified on device** (Firefox for Android remote debugging via `about:debugging` over USB — see `CONTRIBUTING.md` lines 71–75 for the inspector-driven selector-fix workflow);
   - when they stop matching, re-sync from `github.com/ublacklist/builtin` (`google.yml`), which lists mobile selectors.

   The selectors to append, each with an aligned trailing `//` comment in the existing style (see lines 104–106 and 110–112 for the aligned-continuation-line precedent):

   ```js
   "#rso .kvH3mc",            // mobile organic result card
   "#main .MjjYud"            // mobile SERP where #rso is absent but #main is present
   ```

   A third fallback was considered — `#main div[data-hveid][data-ved]:not([data-hveid] [data-hveid])` — it uses a complex selector inside `:not()` (valid in Gecko 84+), but it is only safe if it can be shown to match **outer result units** and never a column wrapper. Rule for this phase: **if unsure, drop it** rather than risk a container selector. The two selectors above are the safe minimum; add the third only if on-device inspection (step 5) confirms `data-hveid`/`data-ved` sit on per-result wrappers on the live mobile SERP.

3. Safety checks on what you wrote:
   - **Never** add `#main`, `#rso`, `#center_col`, `#search`, or any selector that matches the whole results column — `scan()` hides the outermost matching node, so one such match would blank the entire SERP on a single keyword hit (the failure mode the overview's acceptance explicitly forbids). Every selector must target the element wrapping **one** result.
   - Overlap/nesting with the existing selectors is fine: the ancestor-hidden guard in `scan()` (line 153, `node.parentElement.closest("[data-kb-hidden]")`) hides only the outermost node, so `#main .MjjYud` overlapping `#rso .MjjYud` counts each result exactly once toward the badge and `lifetimeHidden`.
   - No other file changes. In particular: no manifest edit (Google `matches` are per-TLD `*://www.google.XX/search?*` and mobile Google serves from the same `www.google.com` host; the `gecko_android` block is phase 3), no `src/data/sites.js` edit (`{ id: "Google", hosts: ["google."] }` at line 20 already matches every google TLD by substring), and leave the pre-existing uncommitted version/sign-script changes in `src/manifest.json` and `package.json` untouched.

4. Run the verification commands (below). Note `npm test` is a no-regression gate only: `content.js` has no `module.exports` guard and is not `require()`-able from tests, so no unit test exercises `getSelectors()` — selector correctness is established on-device only.

5. On-device verification (marked **verify on device** — the drafted selectors are best-effort until checked against live mobile markup):
   - Sign or temporarily load the extension in Firefox for Android and connect the phone via USB; debug with `about:debugging` on desktop Firefox (remote debugging).
   - In the popup, block a common word (e.g. `the`), then search that word on mobile `www.google.com` (web/All vertical).
   - Expect: individual results vanish; the results column itself **never** disappears; the popup's lifetime count increments once per hidden result. (Do **not** rely on the toolbar badge — the overview lists badge display on Android as out of scope because Firefox for Android has no toolbar badge; use the popup's lifetime count instead.)
   - If nothing hides, or a whole column disappears: open the remote inspector on the mobile SERP, find the element wrapping **one** organic result, and correct the appended selectors to its tag/class/`data-*` (per the workflow in `CONTRIBUTING.md` lines 71–75); `github.com/ublacklist/builtin` (`google.yml`) is the reference list to re-sync mobile selectors from.

6. Leave all changes uncommitted — the user commits manually. No push, no PR.

## Verification

- `npm run lint` — `npx --yes web-ext lint --source-dir src`; must pass (validates the manifest and that referenced files exist).
- `npm test` — `node --test`, Node ≥18, nothing to install; must stay green (no-regression gate; nothing unit-tests `getSelectors()`).
- Manual on-device check as in step 5 (Firefox for Android, remote debugging via `about:debugging` over USB).

## Acceptance

- [ ] The Google branch of `getSelectors()` still contains the vertical guard and all five original selectors, byte-for-byte unchanged, plus the appended mobile fallback group with a comment block and trailing `//` comments in the existing style.
- [ ] No appended selector can match the whole results column (`#main`, `#rso`, `#center_col`, `#search` or equivalent container selectors are absent).
- [ ] `npm test` and `npm run lint` both pass.
- [ ] On-device (Firefox for Android): with a common word like `the` blocked, searching that word on mobile `www.google.com` makes matching results vanish, the results column itself never disappears, and the popup's lifetime count increments once per hidden result — and if this fails, the selectors were corrected from the remote inspector until it passes.
- [ ] Only `src/content.js` differs from the pre-phase tree (beyond the pre-existing uncommitted version/sign-script changes in `src/manifest.json` and `package.json`), and nothing was committed.
