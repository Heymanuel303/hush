# Hush

> Hide the noise. Hush hides posts on **Reddit**, tweets on **X**, videos on
> **YouTube**, and results on **Google Search** whose text contains any word from
> a list you control.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Manifest V3](https://img.shields.io/badge/manifest-v3-orange)
![Dependencies: none](https://img.shields.io/badge/runtime%20dependencies-none-brightgreen)
![Tests: node --test](https://img.shields.io/badge/tests-node%20--test-success)

A small, fast, cross-browser (Firefox + Chrome) extension. No build step, no
bundler, no runtime dependencies, and nothing ever leaves your browser.

## Features

- **Keyword blocking** — hide any post/tweet/video/result whose text contains a
  word you add (case-insensitive). Add `@handle` to block a user on X.
- **Whole-word mode** — prefix a word with `=` (or tap the `≈`/`=` pill on a row)
  to match it as a whole word only, so `=cat` hides "cat" but not "category".
  Boundaries are Unicode-aware (`=café` works).
- **Quick list editing** — double-click a word to rename it, paste a comma- or
  line-separated list to add many at once, and **undo** a remove or clear-all from
  the toast that appears.
- **Starter packs** — toggle on a curated bundle (Spoilers, Politics, Crypto,
  Sports, Celebrity, Search Spam). They're persistent on/off switches that never
  clutter your custom list. Edit them in [`src/data/packs.js`](../src/data/packs.js).
- **Advanced mode** — flip the accent-colored **Advanced** toggle to recolor the
  panel and reveal a per-site editor. Words you add there block **only** on that
  site (Reddit, X, YouTube, or Google), layered on top of your global list and any
  packs. The supported sites are curated in
  [`src/data/sites.js`](../src/data/sites.js). The YouTube block also has a switch
  to **open Subscriptions instead of the home page** — `youtube.com/` (and the
  logo) go straight to your Subscriptions feed.
- **Hidden-post counter** — a toolbar badge shows how many posts are hidden on the
  current tab; the popup shows that plus a persisted **all-time total** and an
  estimate of time saved.
- **On/off toggle** — pause and resume blocking without losing your list; pausing
  brings hidden posts back instantly.
- **Live updates** — editing the list or toggling updates open tabs immediately.
- **Light & dark** — the popup follows your system theme.

## Install

### From source (development)

- **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary
  Add-on…** → select [`src/manifest.json`](../src/manifest.json). (Removed on
  restart.)
- **Chrome / Edge:** open `chrome://extensions` → enable **Developer mode** →
  **Load unpacked** → select the [`src/`](../src/) folder.

Then click the toolbar icon, add a few words, and refresh a Reddit / X / YouTube /
Google tab.

### Permanently on Firefox (signed `.xpi`)

Regular Firefox only loads signed extensions permanently. Mozilla signs
**unlisted** add-ons for free, and the signed `.xpi` is yours to install.

1. Create a developer account at <https://addons.mozilla.org/developers/> and
   generate API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Copy [`.env.example`](../.env.example) to `.env` and fill in your JWT issuer and
   secret as `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` (`.env` is git-ignored —
   never commit it).
3. Bump `"version"` in [`src/manifest.json`](../src/manifest.json) (Mozilla rejects
   re-signing an existing version), then run:
   ```bash
   pnpm ext:sign
   ```
   The signed `.xpi` is written to `web-ext-artifacts/`.
4. Install it: open `about:addons` → gear ⚙ → **Install Add-on From File…** and
   pick the `.xpi`. It now survives restarts.

### Firefox for Android

Firefox for Android installs sideloaded add-ons only through its debug menu.
Use the signed `.xpi` built in the section above (`pnpm ext:sign` →
`web-ext-artifacts/`).

1. Copy the signed `.xpi` to your phone.
2. Enable the debug menu: **Settings → About Firefox** → tap the Firefox logo
   5 times.
3. Go back to **Settings → Install add-on from file…** and pick the `.xpi`.

Notes:

- Sites added to the home screen (**menu → Add to Home screen**) keep working —
  Hush still hides posts inside them.
- The popup opens as a **full-screen page** on Android rather than a popover;
  this is expected, and it lays out to fit the phone width.
- There is **no toolbar badge** count on Android (Firefox for Android has no
  badge); the per-tab and all-time counts are still shown in the popup.

> **Cross-browser note:** the manifest declares the background as both
> `background.service_worker` (Chrome MV3) and `background.scripts` (Firefox MV3);
> each browser reads its own key and ignores the other.

## Usage tips

- Matching is **case-insensitive substring** by default — `cat` also matches
  "category". Prefix with `=` for **whole-word** matching.
- On X, block a **user** by adding their handle, e.g. `@someuser` — the handle
  appears in the tweet's text.
- The all-time total counts each post once per page load; reloading and re-hiding
  the same posts adds to the total again.

## Project structure

```
src/
├── manifest.json        # MV3 manifest
├── background.js        # event page: toolbar badge + persisted all-time total
├── content.js           # injected into sites: hides matching posts, reports counts
├── popup/               # toolbar popup (html / css / js)
├── lib/                 # shared, testable logic: matching engine, formatters,
│                        #   schedule.js (quiet hours), hubconfig.js (hub config validator),
│                        #   hubsync.js (hub sync decision table)
└── data/                # local data: packs.js (starter packs) + sites.js (site registry)
test/                    # node --test unit tests
```

The browser-agnostic logic lives in `src/lib/` and `src/data/`; everything that
touches the DOM, storage, or messaging stays in the three context files
(`background.js`, `content.js`, `popup/panel.js`).

## Development & testing

You only need **Node 22** and pnpm (`corepack enable`) — there is nothing to `pnpm install` for the extension.

```bash
pnpm ext:test     # run the unit tests (node --test)
pnpm ext:lint     # web-ext lint (validates the manifest + file references)
pnpm ext:start    # launch Firefox with the extension + auto-reload (uses web-ext)
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the project layout, code conventions,
how to fix selectors when a site changes its markup, and the correctness
invariants to respect.

## Minimum browser version

Firefox (desktop and Android) needs **128** or newer: `optional_host_permissions`, which the
hub connection uses to ask for the hub's origin at connect time, is honoured from 128 (ignored
with a warning on 115 ESR), and so is its prompt UI on Android. 128 is an ESR.

## Household hub

When paired with a hub, the background fetches the profile's config from the hub origin you
named (on a 15-minute alarm and on wake) and stores it; the host permission is requested per
hub at connect time, never at install. A hub with a self-signed certificate cannot be used
(`fetch` has no override): use plain HTTP on the tailnet or `tailscale serve` HTTPS.
Config is only downloaded, nothing is uploaded.

## Privacy

Hush collects nothing and sends nothing anywhere. All state (your word
list, packs, counts) lives in the browser's local extension storage. Starter
packs are bundled local data — no network requests are made.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](../CONTRIBUTING.md) first.
Run `pnpm ext:test` before opening a pull request.

## License

[MIT](../LICENSE) © Emmanuel Janssens
