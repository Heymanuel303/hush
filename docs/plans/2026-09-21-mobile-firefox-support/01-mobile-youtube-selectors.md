# Phase 1: Mobile YouTube selectors

**Plan:** [mobile-firefox-support](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context

The plan's goal is to make Hush work in Firefox for Android (sideloaded signed .xpi): hide posts on mobile YouTube and Google markup and make the popup lay out correctly full-screen. m.youtube.com is a separate web app from desktop YouTube — its video wrappers are `ytm-`-prefixed custom elements, none of which are in the current `getSelectors()` YouTube list, so today nothing gets hidden on the mobile site even though the content script already injects there (`*://*.youtube.com/*` in `src/manifest.json` covers `m.youtube.com`, and `siteIdForHost("m.youtube.com")` already returns `"YouTube"` — see `test/sites.test.js:31`). This phase adds only the mobile YouTube selectors; mobile Google, the popup layout, and `gecko_android` are later phases.

## Objective

Append the m.youtube.com per-video wrapper selectors to the YouTube branch of `getSelectors()` in `src/content.js` so videos are hidden on the mobile site.

## Files to touch

- `src/content.js` — the **only** file edited. Append 4 mobile selectors plus a short comment block inside the `if (HOST.includes("youtube.com"))` branch of `getSelectors()` (currently lines 78–89; the return array is lines 79–88).

No other files change:
- `src/manifest.json` — already injects into `m.youtube.com` via `*://*.youtube.com/*`; `gecko_android` belongs to a later phase.
- `src/data/sites.js` — `hosts: ["youtube.com"]` already substring-matches `m.youtube.com`.
- `test/` — `getSelectors()` lives in `content.js`, which is untestable browser code (never `require()`d from tests); `test/sites.test.js:31` already covers the mobile host. No test changes.
- `README.md` — it only links CONTRIBUTING.md and documents no per-site selectors, so a selector-only change gives it nothing to update; no edit needed. Do not touch CONTRIBUTING.md either.

## Steps

1. In `src/content.js`, inside the `if (HOST.includes("youtube.com"))` branch of `getSelectors()`, keep all 8 existing selectors exactly as they are (`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`, `ytd-grid-video-renderer`, `ytd-reel-item-renderer`, `ytm-shorts-lockup-view-model`, `ytm-shorts-lockup-view-model-v2`, `yt-lockup-view-model`) with their existing trailing comments. Add a comma after the current last entry (`"yt-lockup-view-model"`, line 87).
2. Append the 4 mobile selectors at the end of the same return array, each with a trailing comment in the existing aligned style but prefixed `// mobile (m.youtube.com):`:

   ```js
       "yt-lockup-view-model",            // new search/related lockup
       // m.youtube.com is a separate app whose per-video wrappers are ytm-*
       // custom elements (the two ytm-shorts-* entries above are the exception:
       // desktop reuses those shorts components). The group below is drafted
       // from known mobile markup and MUST be verified on device — Firefox for
       // Android remote debugging via about:debugging over USB, inspect the
       // element wrapping ONE video. Nesting (ytm-media-item inside the
       // renderers) is expected; scan() hides the outermost match only.
       "ytm-rich-item-renderer",          // mobile (m.youtube.com): home feed item
       "ytm-video-with-context-renderer", // mobile (m.youtube.com): home/subs/search video card
       "ytm-compact-video-renderer",      // mobile (m.youtube.com): watch-page related list
       "ytm-media-item"                   // mobile (m.youtube.com): grid/list media card (newer markup)
   ```

   Never add section/feed containers — `ytm-item-section-renderer`, `ytm-section-list-renderer`, `ytm-rich-grid-renderer`, `ytm-browse` — a single blocked word would hide the entire feed, because such an element wraps many videos, not one post unit.
3. Touch nothing else in `content.js`: no changes to `scan()`, `hide()`, `unhideAll()`, `handleRouteChange()`, `scheduleScan()`, the `data-kb-hidden`/`data-kb-counted` dataset flags, or `pendingDelta`/`deltaInFlight`. Selector-only edit inside the return array. (`handleRouteChange()` re-runs `selectors = getSelectors()` at src/content.js:172, so the new selectors also apply across SPA navigations.)
4. Run the verification commands below.

## Verification

- `npm run lint` — `web-ext lint` validates the manifest and referenced files; must pass.
- `npm test` — `node --test`, Node ≥18, nothing to install; must pass. Note: no unit test covers `getSelectors()` (content.js is untestable browser code), so a green suite proves the edit broke nothing else — it does **not** validate the selectors themselves.
- Manual on-device check (the real verification, see Acceptance).

## Acceptance

- [x] The YouTube branch of `getSelectors()` returns 12 selectors: the 8 pre-existing ones unchanged, followed by `ytm-rich-item-renderer`, `ytm-video-with-context-renderer`, `ytm-compact-video-renderer`, `ytm-media-item`, each with a `// mobile (m.youtube.com): ...` trailing comment and a comment block above the group (separate app / ytm- prefix / verify on device via about:debugging over USB).
- [x] No feed/section container selectors were added (`ytm-item-section-renderer`, `ytm-section-list-renderer`, `ytm-rich-grid-renderer`, `ytm-browse`).
- [x] Only `src/content.js` is modified; `git status` shows no other file touched by this phase. Changes left uncommitted (the user commits manually; no push, no PR).
- [x] `npm test` and `npm run lint` both pass.
- [ ] **Verify on device:** in Firefox for Android with the extension installed, add a common block word (e.g. `the`), open `m.youtube.com` home, search, and a watch page — matching videos vanish and the popup's lifetime count increments (Firefox for Android shows no toolbar badge). If nothing hides, the drafted selectors are stale: connect via `about:debugging` over USB from desktop Firefox, inspect the element wrapping one video on the failing surface, and replace/add the correct `ytm-*` wrapper tag in the mobile group (keeping the per-post-unit rule and comment style).
