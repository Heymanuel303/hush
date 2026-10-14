# Pi-hole blocklists

> Moving a client into the `Kid` group is now done by the Household Hub ([`docs/hub.md`](../../docs/hub.md#kid-mode)).

State of the live Pi-hole (v6, `192.168.1.11`) on 2026-09-24, plus what to add
for a `Kid` group. Manage through the admin UI (*Lists*, *Groups*, *Clients*) or
the REST API — the container has no `sqlite3`. Reload with
`docker exec pihole pihole -g`.

## Currently enabled (all in group Default)

| List | URL | Note |
|---|---|---|
| StevenBlack unified hosts | `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts` | |
| Hagezi Ultimate (ads, tracking, telemetry, aggressive) | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/ultimate.txt` | Ultimate breaks more than Pro; downgrade to `adblock/pro.txt` if sites misbehave |
| Hagezi Social | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/social.txt` | blocks Facebook/Instagram/TikTok/... **for every client** |
| Hagezi NSFW | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/nsfw.txt` | for every client |
| Social-media-Blocklists: facebook | `https://github.com/gieljnssns/Social-media-Blocklists/blob/master/pihole-facebook.txt` | **broken URL** (HTML page); use `https://raw.githubusercontent.com/gieljnssns/Social-media-Blocklists/master/pihole-facebook.txt` |
| Social-media-Blocklists: instagram | `.../blob/master/pihole-instagram.txt` | same fix |
| Social-media-Blocklists: tiktok | `.../blob/master/pihole-tiktok.txt` | same fix |

Allowlist: `fc.yahoo.com` (exact).

Because Social + NSFW sit in Default, **every** tailnet device is already
socially filtered. If that's not wanted on your own machines, move those two
into the Kid group below.

## Kid group (to create)

| List | URL |
|---|---|
| Hagezi NSFW | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/nsfw.txt` |
| Hagezi Gambling | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/gambling.txt` |
| Hagezi DoH/VPN/TOR/Proxy bypass — stops apps that bring their own resolver | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/doh-vpn-proxy-bypass.txt` |
| oisd NSFW (second opinion, ABP format) | `https://nsfw.oisd.nl` |

A client assigned to Kid **only** gets Kid's lists, so also assign the everyday
lists (StevenBlack, Hagezi Ultimate) to Kid. Add the phone under *Clients* by
its **Tailscale IP** (`100.124.117.46`) — that's the address Pi-hole sees.

Manual wildcard blocks for Kid (*Domains* tab, tick "wildcard"):

```
tiktok.com  tiktokv.com  tiktokcdn.com  byteoversea.com
instagram.com  cdninstagram.com
reddit.com  redd.it  redditmedia.com  redditstatic.com
twitter.com  x.com  twimg.com
discord.com  discordapp.com  discord.gg
```

## Both groups: kill DNS-over-HTTPS bypass

Block `use-application-dns.net` (exact). It's the *canary domain*: Firefox
checks it and, when it's blocked, disables its own DoH and uses the system
resolver — i.e. the Pi-hole. Chrome honours the same signal in "automatic" DoH
mode. Today it is **not** blocked.

## What DNS can't block

Same-host paths: `youtube.com/shorts/…`, `instagram.com/reels/`, Reddit
r/popular, X Explore. Those need the browser layer (`filters/strict-mode.txt`,
enforced by `browser/firefox/policies.json`) — or blocking the whole host.
