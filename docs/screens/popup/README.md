# Popup screenshots

Every popup screen in light and dark at 324px (desktop Firefox popup width, `os: linux`) and
375px (`os: android`, `html.mobile` touch targets), so the palette can be judged on real
content. Files are named `<screen>-<light|dark>-<324|375>.png`.

Regenerate (needs the hub dev stack, like the other specs; the spec is skipped otherwise):

```bash
POPUP_SCREENS=1 pnpm e2e e2e/popup-screens.spec.ts --project=desktop
```

`e2e/popup-screens.spec.ts` opens `src/popup/panel.html` from `file://` with the shim in
`e2e/popup-shim.ts` and refuses to capture unless Atkinson Hyperlegible Next has loaded.

| Screen | Shows |
| --- | --- |
| `words` | Words tab, six custom words, the Spoilers pack on |
| `words-empty` | Words tab with no words |
| `sites` | Sites tab, YouTube block open, "Open Subscriptions" switch on |
| `household-off` | Household, not connected: the connect form |
| `household-connecting` | Connect pressed while the permission request is pending |
| `household-connected` | Connected, with a quiet-hours window (window Monday 09:00-17:00 UTC, captured at 10:00) |
| `household-offline` | Hub unreachable, using the last rules |
| `household-invalid` | Hub sent rules Hush can't use |
| `household-revoked` | Device removed on the hub, rejoin help |
| `household-locked` | Locked profile, Household tab |
| `words-locked` | Locked profile, Words tab, opened from Household, editors disabled with the "Managed by" banner |
| `paused` | Hush off while paired: hub rules paused too |
