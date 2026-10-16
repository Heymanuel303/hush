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
- **Sites** — the **Sites** tab holds a per-site editor. Words you add under a site
  block **only** on that site (Reddit, X, YouTube, or Google), layered on top of your
  global list and any packs. The supported sites are curated in
  [`src/data/sites.js`](../src/data/sites.js). The YouTube block also has a switch
  to **open Subscriptions instead of the home page** — `youtube.com/` (and the
  logo) go straight to your Subscriptions feed.
- **Household** — the **Household** tab connects Hush to a Household Hub that sends this
  browser a profile (see [Household hub](#household-hub)).
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
- The popup remembers the last tab you used. **Left** and **Right** arrow keys switch tabs.
- The all-time total counts each post once per page load; reloading and re-hiding
  the same posts adds to the total again.

## Project structure

```
src/
├── manifest.json        # MV3 manifest
├── background.js        # event page: toolbar badge + persisted all-time total
├── content.js           # injected into sites: hides matching posts, reports counts
├── popup/               # toolbar popup (html / css / js)
│   ├── panel-tabs.js    #   Words / Sites / Household tab bar
│   ├── panel-tabs.css
│   └── fonts/           #   bundled Atkinson Hyperlegible Next (OFL-1.1)
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

Firefox (desktop and Android) 128 or newer; see [Firefox 128 minimum](#firefox-128-minimum).
Chrome: any current release.

## Household hub

Hush can take its rules from a **Household Hub**, a self-hosted console someone in the household
runs on the home server (operator guide: [`hub.md`](hub.md)). The hub is optional: without one,
Hush works entirely on its own and makes no network request.

### Connect

1. In the popup, open the **Household** tab.
2. Enter the hub address (for example `http://hub.tail1234.ts.net` or
   `https://hub.tail1234.ts.net`), the six-character code shown by the hub's **Pair device**
   dialog (it lives ten minutes) and a name for this device, then **Connect**.
3. The browser asks for permission to reach that one address. This is the only time Hush asks
   for a host permission, and only for the origin you typed, never at install.

Once connected, the tab shows a card with the profile name, "from <hub> · synced …" and a
quiet-hours line: "Hub rules apply now, until 07:00", "Hub rules start at 21:00" or "Hub rules
apply all day". Below it are **Sync now** and **Disconnect** (press once, then "Press again to
disconnect"). Hush fetches the profile's config on a 15-minute alarm, when the browser
starts, and whenever the extension wakes more than five minutes after the last attempt, with a
conditional request so an unchanged profile costs one `304`. An edit on the hub reaches the
device within one alarm tick, or at once with **Sync now**.

The hub's words, packs, per-site words and site options are added to your own; they never
appear in, or replace, your own lists. Quiet hours set on the hub are the windows in which the
hub's rules apply; outside them only your own words count. A profile without quiet hours
applies all the time.

### Locked profiles

If the profile is **locked**, the popup opens on the **Household** tab and becomes read-only
under a "Managed by <hub>" banner (lists stay visible), and the hub's rules apply even when Hush
is switched off. A locked device cannot disconnect itself: the tab shows "To release this
browser, revoke it on the hub." in place of Disconnect, and the hub releases the device when it
is revoked there. A lock stops casual edits in the popup; it does not stop someone removing Hush
unless a browser policy force-installs it (see
[`browser/firefox/policies.json`](../browser/firefox/policies.json)).

### Offline, invalid and revoked

- **Hub unreachable** (off the tailnet, server down, a 5xx): Hush keeps the last config it
  received, lock included, and retries on the next tick. The status line reads "Can't reach
  <hub>. Using the rules from <time>."
- **Invalid config** (fails Hush's own validation): the previous config stays in force. The
  status line reads "The hub sent rules Hush can't use. Keeping the last good set."
- **Revoked** (the device was removed on the hub): Hush says so once, drops the hub's rules and
  goes back to your own words. The tab reads "This browser was removed from <hub>. Your own
  words still work."

### Disconnect

**Disconnect** (press, then confirm) forgets the hub, its token and its rules; your own lists are
untouched. It is disabled while the profile is locked.

### Firefox 128 minimum

Firefox (desktop and Android) needs **128** or newer. `optional_host_permissions`, which the
hub connection uses to ask for the hub's origin at connect time, is honoured from 128; on 115
ESR Firefox ignores it with a warning, so the connection could never get permission. 128 is an
ESR.

### Android

On Firefox for Android the popup opens as a full page; the Household tab is the same.
The permission prompt for the hub address appears from Firefox 128. Phones that leave the house
keep syncing as long as Tailscale is on, since the hub is reached over the tailnet; off the
tailnet, Hush keeps the last config (see Offline above).

### Why plain HTTP or Tailscale HTTPS

A hub with a self-signed certificate cannot be used: the extension's `fetch` fails on it and a
browser extension has no way to accept the certificate. Use one of:

- `http://` on the tailnet: the traffic is already encrypted by WireGuard between your devices;
- `tailscale serve`, which gives the hub a `https://<machine>.<tailnet>.ts.net` address with a
  certificate every browser trusts.

## Privacy

The extension fetches only from a hub the user named, config only, never user data.
`data_collection_permissions` stays `none` because nothing is uploaded; if AMO review disagrees,
the declaration changes to the honest minimum and the copy says so.

All state (your word list, packs, per-site words, counts) lives in the browser's local extension
storage. Starter packs are bundled local data. Without a hub, Hush makes no network request at
all; with one, it only downloads its config from the address you entered. Counts never leave
the device.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](../CONTRIBUTING.md) first.
Run `pnpm ext:test` before opening a pull request.

## License

[MIT](../LICENSE) © Emmanuel Janssens

The bundled font, Atkinson Hyperlegible Next, is under the SIL Open Font License 1.1; its licence
text is in `src/popup/fonts/LICENSE.txt`.
