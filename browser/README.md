# browser

The browser layer: **uBlock Origin** with a fixed baseline, and **Hush** with a
default word list. Both are plain JSON files that Firefox feeds to the extension
through its *managed storage* mechanism, so reproducing the setup on a new
machine is `./setup.sh` from the repo root and a Firefox restart. No root, no
profile copying.

```
browser/
├── ublock/managed-storage.json   uBO baseline: settings + the exact filter-list selection
├── hush/managed-storage.json     Hush defaults: blockWords, enabledPacks, siteWords, ytHomeRedirect
├── firefox/policies.json         LOCKED-DEVICE policy (kid PC): force-install + lock down. Not for your own machine.
└── chrome/policies.json          same for Chrome, weaker (uBO Lite can't take custom list URLs)
```

## How it works

Firefox reads `<mozilla home>/managed-storage/<extension-id>.json` and exposes
its `data` object to that extension as `browser.storage.managed`
([MDN: native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests#managed_storage_manifests)).
`setup.sh` copies the two files into every Firefox flavour it finds:

| Firefox flavour | managed-storage folder |
|---|---|
| deb / tarball / Mozilla apt | `~/.mozilla/managed-storage/` |
| Ubuntu snap | `~/snap/firefox/common/.mozilla/managed-storage/` |
| flatpak | `~/.var/app/org.mozilla.firefox/.mozilla/managed-storage/` |

Firefox for Android has no managed storage. There, import the filter lists by
URL (see [`../filters/README.md`](../filters/README.md)) and type the Hush words
in.

### uBlock Origin — enforced baseline

uBO applies `toOverwrite.filterLists` and `userSettings` **on every startup**
(`restoreAdminSettings` in uBO's `storage.js`). Changing the list selection in
the dashboard therefore lasts until the next restart. This is the point: every
machine runs the same selection, and the selection is versioned here. To change
it, edit `ublock/managed-storage.json`, re-run `./setup.sh`, restart Firefox.

What the baseline is:

- uBO's default lists + EasyList/EasyPrivacy + malware/URLhaus + Peter Lowe.
- Annoyances: uBlock + EasyList annoyances, cookie notices (uBO and Fanboy),
  mobile app banners, newsletter and notification prompts, AI widgets.
- Regional: `DEU-0` (de/ch/at) and `FRA-0` (fr/be/ca). Drop them if you don't
  read those languages.
- The three lists in [`../filters/`](../filters/), fetched from GitHub raw and
  re-fetched daily (`Expires: 1 day` in the list headers). A push to `main`
  reaches every machine within a day.
- Settings: WebRTC IP hidden, prefetching and hyperlink auditing off, CNAME
  uncloaking on, large media > 50 KB blocked only where you turn the switch on.

**"My filters" is deliberately not managed** (`toOverwrite.filters` is omitted),
so local experiments there survive restarts. Same for the trusted-sites list.
Exact key names come from uBO's source (`userSettings` entries are
`[name, "value-as-string"]`; `toOverwrite.filterLists` takes asset tokens from
`assets.json` or full URLs).

### Hush — seed once

Hush copies `data` into its own `storage.local` **once**, the first time it
starts with no `blockWords` of its own (`seedFromManaged` in
`src/background.js`). After that it never touches your list again, so:

- a fresh install on a new machine starts with the default words, packs and
  per-site words;
- an existing install keeps whatever you have;
- to re-seed an install, clear all words in the popup **and** remove the
  `seededFromManaged` flag (easiest: remove and reinstall Hush).

`setup.sh` installs the Hush file **only where the Hush `.xpi` is present** in
that Firefox's profiles (`--force-hush` overrides, e.g. to prepare a machine
before installing Hush). The defaults in `hush/managed-storage.json` are a
starting point: replace `blockWords`, `enabledPacks` (names from
`src/data/packs.js`), `siteWords` (keys from `src/data/sites.js`: `Reddit`,
`X`, `YouTube`, `Google`) with your own. Keys Hush doesn't know are ignored.

### Managed storage and the hub

Managed storage seeds a machine **once**: it gives a fresh Hush its starting words and then
never touches them again. The [Household Hub](../docs/hub.md) manages devices
**continuously**: a paired Hush pulls its profile every 15 minutes, on any browser including
Firefox for Android, which has no managed storage. The two coexist: seed a machine first with
`./setup.sh`, pair it to the hub later. The hub's rules are added on top of the seeded words and
never overwrite them.

## Locked device (kid PC)

`sudo ./setup.sh --locked` installs [`firefox/policies.json`](firefox/policies.json)
system-wide (`/etc/firefox/policies/policies.json`; the Ubuntu snap reads it
too). It force-installs uBO and Hush, **blocks every other extension**, disables
private browsing and `about:config`, locks DoH off (so DNS always goes to the
Pi-hole) and blocks autoplay. The same uBO/Hush data is embedded under
`3rdparty` — policy and per-user manifest are two doors to the same
`storage.managed`. Check `about:policies` after a restart.

The Hush `install_url` expects a signed `.xpi` attached to a GitHub release as
`hush.xpi` (`npm run sign` → `web-ext-artifacts/`, upload, done). Until one is
published, that force-install entry logs an error in `about:policies` and the
rest of the policy still applies.

Chrome: [`chrome/policies.json`](chrome/policies.json) mirrors the intent, but
uBO Lite can't pin custom list URLs and Hush isn't in the Web Store, so Firefox
is the browser this repo is built around.

## Verifying

- uBO dashboard → **Filter lists**: the three `hush — …` entries are ticked and
  the annoyance lists are on; untick one, restart, it's back.
- Hush popup on a fresh profile: the default words are listed; **Advanced** shows
  the per-site words.
- `./setup.sh status` prints which folders have which manifest.
