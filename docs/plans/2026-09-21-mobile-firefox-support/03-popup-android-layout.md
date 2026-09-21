# Phase 3: Popup Android layout

**Plan:** [mobile-firefox-support](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context

The feature goal is to make Hush work in Firefox for Android (sideloaded signed `.xpi`): hide posts on mobile YouTube/Google markup and make the popup usable there. Firefox for Android does not show action popups as a 324px popover — it opens `popup/panel.html` as a **full-screen page**, where the hard-coded `width: 324px` on `html`/`body` (panel-theme.css) leaves a narrow column with tiny desktop-sized tap targets. This phase makes the popup lay out fluidly at phone width — opt-in via a single `mobile` class on `<html>` added at runtime, so desktop popover sizing is byte-for-byte unchanged — and declares Android support in the manifest (`gecko_android`). It is independent of the selector phases.

## Objective

Fluid, tappable popup layout when Firefox for Android opens the popup as a full-screen page, plus the `gecko_android` manifest block and README install notes for Android.

## Files to touch

- `src/popup/panel.js` — add Android detection at the top of the `init()` IIFE (before the storage read / first render) that adds class `mobile` to `document.documentElement`
- `src/popup/panel-theme.css` — append one scoped `html.mobile` block after the base `body` rule: fluid width + larger tap targets (all mobile overrides live here, in this one file)
- `src/popup/panel.html` — add the missing `<meta name="viewport" ...>` to `<head>` (no reordering of stylesheet links or scripts)
- `src/manifest.json` — add `"gecko_android": { "strict_min_version": "120.0" }` inside `browser_specific_settings`, as a **sibling** of `"gecko"`
- `README.md` — new `### Firefox for Android` subsection under `## Install`

**Do not touch:** storage writes, the single `storage.onChanged` listener (panel.js lines 128–160), script/stylesheet load order, the dark-mode `@media (prefers-color-scheme: dark)` block (panel-theme.css lines 23–44), the `gecko` block's id/`strict_min_version`/`data_collection_permissions`, or the manifest `version` (the user bumps it manually before signing).

## Steps

1. **`src/popup/panel.html`** — in `<head>` (lines 3–14), directly after `<meta charset="utf-8" />` (line 4) and **before** the stylesheet links, add:

   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1" />
   ```

   It is harmless for the desktop popover and required for the full-page layout on Android. The head comment says stylesheet ORDER MATTERS (theme first, misc last) — do not reorder any `<link>` or `<script>`.

2. **`src/popup/panel.js`** — inside the existing `(async function init() { ... })()` IIFE (line 173), insert the detection **as the first statements**, before the `await api.storage.local.get(...)` at lines 174–175, so the class is on `<html>` before the first render and the layout never flashes from 324px to fluid:

   ```js
   // Firefox for Android opens action popups as a full-page tab, not a 324px
   // popover — tag <html> so panel-theme.css can swap to the fluid layout.
   try {
     const info = await api.runtime.getPlatformInfo();
     if (info && info.os === "android") document.documentElement.classList.add("mobile");
   } catch {
     if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add("mobile");
   }
   ```

   Use the `api` shim already declared in `panel-core.js` line 10 (`const api = typeof browser !== "undefined" ? browser : chrome;`). **Do not redeclare `api`** — the popup's classic scripts share one global lexical scope and a second `const api` is a SyntaxError that kills the whole popup. `api.runtime.getPlatformInfo()` returns a Promise of `{os, arch}` in both Firefox and Chrome MV3; `os === "android"` on Firefox for Android. The try/catch + fallback mirrors the existing `showHiddenCount()` pattern (panel.js:54–73). Change nothing else in the file — not the render calls (lines 178–186), not `setControlsDisabled`, not the `onChanged` listener.

3. **`src/popup/panel-theme.css`** — append the mobile block **between** the base `body` rule (ends line 65) and the `body.paused` block (starts line 66), following the same appended-state-class pattern as `body.paused`/`body.advanced`. Keep the existing `html { width: 324px; }` (lines 51–53) and `body { width: 324px; ... }` (lines 54–65) rules **unchanged** — the 324px html rule exists because Firefox may measure the popup before styles fully apply (comment at lines 49–50), and desktop must stay exactly as it is. Add, with a short comment:

   ```css
   /* Mobile (html.mobile, set by panel.js when the platform is Android):
      Firefox for Android opens the popup as a full-screen page, so the 324px
      popover width goes fluid — edge-to-edge on phones, a centred readable
      column on tablets — and every control gets a >=40px tap target. All
      mobile overrides live in this one block; html.mobile-prefixed selectors
      out-specify the originals in the later stylesheets, so order is safe. */
   html.mobile,
   html.mobile body {
     width: 100%;
     max-width: 100%;
   }
   html.mobile body {
     max-width: 520px;
     margin: 0 auto;
     padding: 16px;
     font-size: 14px;
   }

   /* Tap targets (originals are 20–36px tall; see the per-file sources below). */
   html.mobile #word,        /* 36px — panel-hero.css */
   html.mobile #add,         /* 36px — panel-hero.css */
   html.mobile #clearAll,    /* text button — panel-list.css */
   html.mobile #resetTotal,  /* text button — panel-hero.css */
   html.mobile .mode,        /* 22px pill — panel-list.css */
   html.mobile li.row input.edit, /* 26px — panel-list.css */
   html.mobile .pack,        /* ~27px chip — panel-packs.css */
   html.mobile .packs-toggle, /* — panel-packs.css */
   html.mobile .site-input,  /* 32px — panel-sites.css */
   html.mobile .site-add-btn, /* 32px — panel-sites.css */
   html.mobile .site-toggle, /* — panel-sites.css */
   html.mobile .adv-toggle,  /* 24px pill — panel-header.css */
   html.mobile .onboard-x,   /* — panel-list.css */
   html.mobile .toast #undo  /* — panel-misc.css */ {
     min-height: 40px;
   }
   /* .remove is a 28px circle (panel-list.css); grow both axes to keep it round. */
   html.mobile .remove {
     width: 40px;
     height: 40px;
   }
   /* The on/off switch (.toggle, panel-header.css) is fixed 34x20px geometry —
      the thumb travel is a hard-coded translateX(14px), so stretching .toggle
      breaks it. Enlarge the surrounding label's tap area instead. */
   html.mobile .switch {
     padding: 10px 0 10px 10px;
   }
   ```

   Notes that make this correct despite panel-theme.css loading FIRST:
   - Specificity, not order, wins: `html.mobile .remove` (0,2,1) beats `.remove` (0,1,0); `html.mobile` (0,1,1) beats `html` (0,0,1).
   - Id-styled controls need the id repeated: `#add` is (1,0,0), so a class-only override would lose — hence `html.mobile #add`, `html.mobile #word`, `html.mobile #clearAll`, `html.mobile #resetTotal`.
   - `min-height` beats a fixed `height` when larger, so the 36px/32px/26px `height` rules in the later files need no edits.
   - The add-row `#word`/`#add` styles live in **panel-hero.css** (lines 111–147), not panel-theme.css (panel-theme.css only has a dark-mode `#add { color: #1a1a1c; }` at lines 41–43) — but the overrides still belong here, in this one block; do **not** create a new stylesheet, edit the other panel-*.css files, or change link order in panel.html.
   - `panel-misc.css`'s `prefers-reduced-motion` blanket (`!important`, lines 58–63) only touches `animation`/`transition`, so it cannot fight the sizing rules.
   - Do not touch the dark-mode `:root` var overrides (lines 23–44): the mobile block changes only dimensions, never custom properties, so dark mode keeps working untouched.

4. **`src/manifest.json`** — inside `"browser_specific_settings"` (lines 74–82), add `"gecko_android"` as a **sibling** of `"gecko"` (not nested inside it), changing nothing else — not the gecko `id` (`word-block@emmanueljanssens.dev`), not gecko's `strict_min_version` (`"115.0"` stays), not `data_collection_permissions`, not `"version"`:

   ```json
   "browser_specific_settings": {
     "gecko": {
       "id": "word-block@emmanueljanssens.dev",
       "strict_min_version": "115.0",
       "data_collection_permissions": {
         "required": ["none"]
       }
     },
     "gecko_android": {
       "strict_min_version": "120.0"
     }
   }
   ```

   This is the same "each browser reads its own key" pattern as the dual `service_worker`/`scripts` background declaration (manifest.json:11–14). `npm run lint` (web-ext lint) parses the manifest and will catch a malformed block.

5. **`README.md`** — under `## Install` (line 41), add a new subsection `### Firefox for Android` **after** the `### Permanently on Firefox (signed .xpi)` section (ends ~line 73) and **before** the `> **Cross-browser note:**` blockquote. Mirror the existing subsection style (numbered steps, inline code for menu paths). Content:
   - Firefox for Android only installs sideloaded add-ons via the debug menu: enable it with **Settings → About Firefox → tap the Firefox logo 5 times**, then **Settings → Install add-on from file…** and pick the signed `.xpi` from `web-ext-artifacts/` (produced by `npm run sign`, as documented in the section above — the directory already exists with a signed build).
   - Sites can be added to the home screen (**menu → Add to Home screen**) and Hush keeps working inside them.
   - The popup opens as a full-screen page on Android (not a popover) — this is expected.
   - The toolbar badge count is not shown on Android (Firefox for Android has no badge; `background.js` already absorbs this with `.catch(() => {})`).

6. **No new tests.** `npm test` (node --test) only covers the pure logic in `src/lib/` and `src/data/`; `panel.js`, CSS, HTML, and the manifest are not unit-testable and must not be `require()`d from tests. Verification is lint + manual.

## Verification

- `npm run lint` — web-ext lint validates the manifest (would reject a malformed `gecko_android`) and referenced files; must pass with 0 errors.
- `npm test` — must still pass (nothing in this phase can regress it, but run it anyway per plan constraints).
- Manual, desktop Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `src/manifest.json` → open the popup — it is still exactly 324px wide, light and dark mode both look unchanged (only dimension rules were added, never custom properties).
- Manual, desktop spot-check of the mobile layout without a phone: open `src/popup/panel.html` (or the popup) with devtools, run `document.documentElement.classList.add("mobile")` in the console — layout goes fluid, controls grow to ≥40px, the on/off switch thumb still travels correctly (its 34×20 geometry untouched), `.remove` stays round.
- Manual, on device (Firefox for Android ≥120, sideloaded signed `.xpi`): open the extension's popup from the extensions menu — it fills the screen width with **no horizontal scroll**, 16px gutters, controls comfortably tappable, dark mode follows the system theme.

## Acceptance

- [x] `npm run lint` and `npm test` pass.
- [ ] Desktop popup is byte-identical in behavior: `html`/`body` still 324px, no `mobile` class present, no visual change light or dark.
- [ ] On Firefox for Android the popup opens as a full page, lays out fluidly at phone width (no horizontal scroll, max 520px centred column on wide screens), and every control (add row, keyword rows, mode pills, remove buttons, pack chips, site editor, header toggles) has a ≥40px tap target; the on/off switch still animates correctly.
- [x] The `mobile` class is added before the first render (no visible 324px→fluid flash) and detection survives `getPlatformInfo` being unavailable (userAgent fallback).
- [x] `src/manifest.json` has `browser_specific_settings.gecko_android.strict_min_version === "120.0"` and the `gecko` block plus `version` are unchanged (`git diff src/manifest.json` shows only the added block).
- [x] README has the `### Firefox for Android` install subsection (debug-menu sideload of the signed `.xpi`, home-screen web apps keep working, full-page popup, no badge on Android).
- [x] All changes are left **uncommitted**; no push, no PR.
