# Listing copy

The text for the addons.mozilla.org and Chrome Web Store listings. Paste it as is; keep it in
step with [`extension.md`](extension.md) and the manifest `description` in
[`src/manifest.json`](../src/manifest.json). No prices and no promises of future features
belong here.

## Name

Hush

## Summary

Hide Reddit posts, X tweets, YouTube videos and Google results that mention words you choose,
optionally from your household hub.

(The same string as the manifest `description`; AMO caps it at 132 characters.)

## Description

Hush hides the posts you would rather not see. Add a word, and every Reddit post, X tweet,
YouTube video and Google result whose text contains it disappears from the feed, including the
ones that load as you scroll. Turn Hush off and they come straight back.

**What it hides.** Matching is case-insensitive and looks at the whole post: title, text, author.
`cat` also hides "category". To block a person on X, add their `@handle`.

**Whole words.** Put `=` in front of a word, or tap the pill next to it, to match only the whole
word: `=cat` hides "cat" but not "category". Word boundaries understand accents, so `=café`
works.

**Starter packs.** Switch on a ready-made bundle (Spoilers, Politics, Crypto, Sports, Celebrity,
Search Spam). Packs are on/off switches; their words never clutter your own list.

**Sites.** The Sites tab holds a per-site editor: words added there apply on one site only
(Reddit, X, YouTube or Google), on top of your list and packs. The YouTube block can also open
your Subscriptions feed instead of the home page.

**Household hub (optional).** If someone in your household runs the self-hosted Hush Household
Hub on a home server, open the **Household** tab to connect Hush to it with a six-character
code. Hush then downloads that profile's words and settings from the hub address you entered,
every 15 minutes. A profile can be locked, which makes the popup read-only. Without a hub, Hush
works entirely on its own; nothing about the hub is required.

**Counts.** The toolbar badge shows how many posts are hidden on the current tab, and the popup
keeps an all-time total with an estimate of time saved. Counts never leave the device.

## Privacy

The extension fetches only from a hub the user named, config only, never user data.
`data_collection_permissions` stays `none` because nothing is uploaded; if AMO review disagrees,
the declaration changes to the honest minimum and the copy says so.

In plain words: your words, your counts and what you read stay in your browser. Without a hub
connected, Hush makes no network request at all. With one, it only downloads its rules from the
address you typed, and sends nothing about what you read or hide.

## Permission justifications

| Permission | Why Hush needs it |
| --- | --- |
| `storage` | Keeps your word list, packs, per-site words, settings and counts in the browser's local extension storage. |
| `tabs` | Shows the hidden-post count for the current tab on the toolbar badge and resets it when the tab navigates. |
| `alarms` | Checks the household hub for an updated profile every 15 minutes, only when a hub is connected. |
| Optional host permission (`*://*/*`, asked for one origin at a time) | For the hub address you enter. Hush asks for access to that single address when you click Connect, never at install, and fetches nothing else. |

Content scripts run on Reddit, X, YouTube and Google search pages only, to hide matching posts
in the page.
