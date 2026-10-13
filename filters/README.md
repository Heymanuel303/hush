# Filters

uBlock Origin filter lists, kept here so they're versioned. **Not part of the
extension** (outside `src/`, never shipped). Untested starting points — sites
change markup constantly; fix selectors with uBO's *Block element…* picker and
commit.

| File | What it does |
|---|---|
| `youtube-cleanup.txt` | Hides Shorts, the Home feed + its nav entry, related videos, sidebar clutter. Search untouched. |
| `social-cleanup.txt` | Same idea for Reddit, X, Instagram, Facebook, Google Search: trends, "you might like", upsells, AI Overview. |
| `strict-mode.txt` | Refuses to *load* whole pages (`$document`): Shorts/Reels/TikTok/Explore. Much stronger than hiding, shows a uBO interstitial. |

## Installing

On a Linux desktop, nothing to do: `./setup.sh` (repo root) installs a uBO
baseline that already selects these three lists by URL
(`browser/ublock/managed-storage.json`). Elsewhere (Firefox for Android, a
machine without the repo): uBO → Dashboard → **Filter lists** → *Import* →
paste:

```
https://raw.githubusercontent.com/Heymanuel303/hush/main/filters/youtube-cleanup.txt
https://raw.githubusercontent.com/Heymanuel303/hush/main/filters/social-cleanup.txt
https://raw.githubusercontent.com/Heymanuel303/hush/main/filters/strict-mode.txt
```

uBO re-fetches daily (`Expires: 1 day`), so a push to `main` reaches every
device within a day.

Built-in lists worth enabling on top of the defaults (Filter lists tab):
**Annoyances** → *uBlock filters – Annoyances*, *EasyList – Annoyances*,
*AdGuard – Annoyances* (cookie banners, "get the app" bars, social widgets).

uBO settings for phones: **Block media elements larger than 50 KB** (video
never loads until tapped), **Block remote fonts**.

## What filters cannot do: a child on your phone

uBO has no password. Anyone can tap its icon and turn it off, open a private
tab, or use the YouTube *app* instead of Firefox. Filters clean *your* browsing.
Protection for someone else has to live where they can't reach it:

1. **Separate profile.** Android *Settings → System → Multiple users* (or
   Samsung *Secure Folder* / a **Family Link**-supervised child account). Only
   that profile gets kid-safe apps; your Firefox, Reddit etc. don't exist in it.
   Cheapest option with zero setup: **app pinning** (*Settings → Security → Pin
   app*) locks the phone to one app until your PIN is entered.
2. **Filter at DNS, device-wide.** NextDNS / AdGuard DNS / a Pi-hole:
   *Settings → Network → Private DNS* on Android. Blocks adult/gambling
   categories in **every app**, and can force **Google SafeSearch** and
   **YouTube Restricted Mode** by rewriting `www.youtube.com` →
   `restrictmoderate.youtube.com` (NextDNS: *Parental Control* tab — also
   "block bypass methods" for VPN/DoH apps). A child can undo Private DNS unless
   the device is supervised (Family Link locks it).
3. **Account-level.** YouTube *Restricted Mode* on the account; Google
   *SafeSearch* locked (needs a supervised account to be un-removable); Reddit
   *"Show mature content"* off.
4. **uBO extras for the kid profile's Firefox** (belt and braces, still
   bypassable): import an NSFW hosts list — e.g. Steven Black's `alternates/porn`
   hosts file or oisd's NSFW list — plus `strict-mode.txt`.

Order of usefulness: 1 > 2 > 3 > 4. Do 1 and 2 and the filters here become a
nice-to-have rather than a safety measure.
