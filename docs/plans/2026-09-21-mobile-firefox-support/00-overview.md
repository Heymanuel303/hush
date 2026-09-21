# Mobile Firefox support

**Slug:** `mobile-firefox-support` (folder: `docs/plans/2026-09-21-mobile-firefox-support/`)
**Created:** 2026-09-21
**Status:** in-progress

## Goal
Make Hush usable in Firefox for Android (sideloaded signed `.xpi`, with Reddit/X/YouTube/Google optionally added to the home screen as web apps). Two things stand in the way today: `getSelectors()` only knows desktop YouTube/Google markup, and the popup is a fixed 324px popover, which looks broken when Firefox for Android opens it as a full-screen page.

## Scope
- `src/content.js`: mobile `ytm-*` selectors for `m.youtube.com`; mobile-SERP fallbacks for Google.
- `src/popup/panel.js` + `src/popup/panel-theme.css` (+ viewport meta in `panel.html`): `html.mobile` class set from `api.runtime.getPlatformInfo()`, fluid width and larger tap targets under it.
- `src/manifest.json`: `browser_specific_settings.gecko_android` block.
- `README.md`: Firefox for Android install notes.

## Out of scope
- Chromium-based mobile browsers (Chrome has no extensions; Edge/Lemur sideloading is unreliable).
- DuckDuckGo or any new site (no new `SITES` entries or manifest match patterns).
- Native Reddit/X/YouTube apps (a browser extension cannot reach them).
- Badge display on Android (Firefox for Android has no toolbar badge; counting still happens).
- Touch-specific UX for keyword rows (double-click rename etc.).
- Version bump / signing (the user bumps `version` manually before `npm run sign`).

## Constraints
- No build step, no dependencies: plain files in `src/`.
- Selector-only edits in `content.js`; counting/SPA/delivery invariants untouched.
- Desktop popup stays 324px; all mobile CSS is scoped under `html.mobile`.
- Live mobile markup can't be verified from the repo: selectors are drafted from known markup and **must be checked on device** (Firefox for Android remote debugging via `about:debugging` over USB).
- `npm test` and `npm run lint` green after every phase.

## Acceptance criteria
- [ ] On Firefox for Android, with a common block word set, videos disappear on `m.youtube.com` home/search/watch-related.
- [ ] Same for mobile Google web results; the results column itself never disappears.
- [ ] Reddit and X mobile web still hide posts (no regression; they already share desktop markup).
- [ ] The popup fills the phone width with no horizontal scroll; the desktop popup is unchanged at 324px.
- [ ] `web-ext lint` accepts the `gecko_android` manifest block.
- [ ] Sites added to the home screen via "Add to Home screen" still get filtered.

## Phases
1. [01-mobile-youtube-selectors](01-mobile-youtube-selectors.md) — append `ytm-*` per-video wrappers to the YouTube branch of `getSelectors()` · _solo_ ✓
2. [02-mobile-google-selectors](02-mobile-google-selectors.md) — add mobile-SERP result fallbacks to the Google branch of `getSelectors()` · _solo_ ✓
3. [03-popup-android-layout](03-popup-android-layout.md) — `html.mobile` detection + fluid popup CSS, `gecko_android` manifest block, README install notes · _solo_

**Dependency shape:** 01, 02 and 03 are independent and can run in any order or in parallel (01 and 02 both edit `getSelectors()` in `src/content.js` but different branches; run them sequentially in the same tree to avoid a merge).

## Open questions
- Exact mobile YouTube/Google selectors are best-effort until checked on a device; the executor corrects them from the inspector if nothing hides.
