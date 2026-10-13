#!/usr/bin/env bash
# setup.sh — reproduce the privacy setup on a Linux machine.
#
#   ./setup.sh              install the uBlock Origin baseline for every Firefox found
#                           (+ the Hush defaults, only where Hush is installed)
#   ./setup.sh status       show what's installed / active on this machine
#   ./setup.sh --locked     ALSO install the locked-device policy (needs sudo; kid PC only)
#   ./setup.sh --tailscale  ALSO join the tailnet and use the Pi-hole as DNS (needs sudo)
#   ./setup.sh --harden     ALSO make tailscaled un-stoppable (needs sudo; kid PC only)
#   ./setup.sh --force-hush install the Hush defaults even where Hush isn't installed yet
#
# What it does, in plain terms: Firefox reads "managed storage" manifests from
# <profile home>/.mozilla/managed-storage/<extension-id>.json. uBlock Origin and
# Hush both read theirs on startup. So the whole browser config is two JSON files
# copied into the right folder — no root, no profile surgery, works for snap,
# deb/tarball and flatpak Firefox alike. Restart Firefox after running this.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UBO_ID="uBlock0@raymondhill.net"
HUSH_ID="word-block@emmanueljanssens.dev"
UBO_SRC="$REPO_DIR/browser/ublock/managed-storage.json"
HUSH_SRC="$REPO_DIR/browser/hush/managed-storage.json"
POLICY_SRC="$REPO_DIR/browser/firefox/policies.json"
CHROME_POLICY_SRC="$REPO_DIR/browser/chrome/policies.json"
PIHOLE_TS_IP="100.126.224.9"   # tailscale-pihole container on the server (see infra/README.md)

# Every place a Firefox flavour keeps its ".mozilla" on Linux.
FIREFOX_HOMES=(
  "$HOME/.mozilla"                                  # deb / tarball / Mozilla's apt repo
  "$HOME/snap/firefox/common/.mozilla"              # Ubuntu snap
  "$HOME/.var/app/org.mozilla.firefox/.mozilla"     # flatpak
)

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

check_json() { python3 -m json.tool "$1" >/dev/null 2>&1 || die "invalid JSON: $1"; }

hush_installed_in() { # $1 = .mozilla dir
  compgen -G "$1/firefox/*/extensions/$HUSH_ID.xpi" >/dev/null 2>&1
}
flavour_of() {
  case "$1" in
    *"/snap/"*) echo "snap";; *"/.var/app/"*) echo "flatpak";; *) echo "deb/tarball";;
  esac
}

install_browser() {
  local force_hush="$1" found=0
  check_json "$UBO_SRC"; check_json "$HUSH_SRC"
  for home in "${FIREFOX_HOMES[@]}"; do
    [ -d "$home/firefox" ] || continue
    found=1
    local dst="$home/managed-storage"
    say "Firefox ($(flavour_of "$home")): $home"
    mkdir -p "$dst"
    install -m 644 "$UBO_SRC" "$dst/$UBO_ID.json"
    note "uBlock Origin baseline -> $dst/$UBO_ID.json"
    if hush_installed_in "$home" || [ "$force_hush" = 1 ]; then
      install -m 644 "$HUSH_SRC" "$dst/$HUSH_ID.json"
      note "Hush defaults        -> $dst/$HUSH_ID.json"
    else
      rm -f "$dst/$HUSH_ID.json"
      note "Hush not installed in this Firefox — defaults skipped (install the signed .xpi, re-run, or use --force-hush)"
    fi
  done
  [ "$found" = 1 ] || warn "no Firefox profile folder found — install Firefox, start it once, then re-run"
  say "Restart Firefox. Check: uBO dashboard -> Filter lists shows the three 'hush — …' lists; Hush popup shows the default words."
}

install_locked() {
  check_json "$POLICY_SRC"
  say "Locked-device policy (sudo)"
  sudo install -d -m 755 /etc/firefox/policies
  sudo install -m 644 "$POLICY_SRC" /etc/firefox/policies/policies.json
  note "-> /etc/firefox/policies/policies.json  (verify in about:policies)"
  for dir in /etc/opt/chrome/policies/managed /etc/chromium/policies/managed; do
    if [ -d "$(dirname "$(dirname "$dir")")" ]; then
      sudo install -d -m 755 "$dir"
      sudo install -m 644 "$CHROME_POLICY_SRC" "$dir/hush.json"
      note "-> $dir/hush.json  (verify in chrome://policy)"
    fi
  done
}

install_tailscale() {
  if ! command -v tailscale >/dev/null; then
    say "Installing Tailscale (official script, sudo)"
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  say "Joining the tailnet — a login URL will be printed if this device is new"
  sudo tailscale up --accept-dns=true
  sudo tailscale set --accept-dns=true
  note "DNS now goes to the Pi-hole at $PIHOLE_TS_IP (set tailnet-wide in the Tailscale admin console)"
}

install_harden() {
  say "Hardening tailscaled (sudo) — see infra/tailscale/harden-tailscale.sh"
  sudo bash "$REPO_DIR/infra/tailscale/harden-tailscale.sh"
}

status() {
  say "Firefox managed storage"
  local any=0
  for home in "${FIREFOX_HOMES[@]}"; do
    [ -d "$home/firefox" ] || continue
    any=1
    local ubo="no" hush="no" hushx="no"
    [ -f "$home/managed-storage/$UBO_ID.json" ] && ubo="yes"
    [ -f "$home/managed-storage/$HUSH_ID.json" ] && hush="yes"
    hush_installed_in "$home" && hushx="yes"
    note "$(flavour_of "$home"): uBO baseline=$ubo  hush defaults=$hush  (hush installed: $hushx)"
  done
  [ "$any" = 1 ] || note "no Firefox profile folder found"
  say "Locked policy"
  [ -f /etc/firefox/policies/policies.json ] && note "present: /etc/firefox/policies/policies.json" || note "not installed (fine for your own PC)"
  say "Tailscale"
  if command -v tailscale >/dev/null; then
    tailscale status --self 2>/dev/null | head -1 || note "installed, not running"
    tailscale dns status 2>/dev/null | grep -m1 'Tailscale DNS:' | sed 's/^/    /' || true
  else
    note "not installed (./setup.sh --tailscale)"
  fi
  say "DNS goes through the Pi-hole?"
  if command -v dig >/dev/null; then
    local a; a="$(dig +short +time=2 doubleclick.net 2>/dev/null | head -1)"
    case "$a" in 0.0.0.0|"") note "yes — doubleclick.net -> ${a:-NXDOMAIN} (blocked)";; *) warn "no — doubleclick.net -> $a (resolving publicly)";; esac
  else
    note "dig not installed; try: resolvectl query doubleclick.net"
  fi
}

do_browser=1 do_locked=0 do_tailscale=0 do_harden=0 force_hush=0
for arg in "$@"; do
  case "$arg" in
    status) status; exit 0;;
    --locked) do_locked=1;;
    --tailscale) do_tailscale=1;;
    --harden) do_harden=1;;
    --force-hush) force_hush=1;;
    -h|--help) sed -n '2,20p' "$0"; exit 0;;
    *) die "unknown option: $arg (see --help)";;
  esac
done

[ "$do_browser" = 1 ] && install_browser "$force_hush"
[ "$do_locked" = 1 ] && install_locked
[ "$do_tailscale" = 1 ] && install_tailscale
[ "$do_harden" = 1 ] && install_harden
exit 0
