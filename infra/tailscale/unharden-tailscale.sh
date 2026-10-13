#!/bin/bash
# Reverts harden-tailscale.sh. Tailscale itself is left running; stop it
# afterwards with: systemctl stop tailscaled
set -e
systemctl disable --now tailscale-watchdog.timer 2>/dev/null || true
chattr -i /etc/systemd/system/tailscaled.service.d/hardening.conf /usr/local/sbin/tailscale-watchdog 2>/dev/null || true
rm -f /etc/systemd/system/tailscaled.service.d/hardening.conf
rmdir /etc/systemd/system/tailscaled.service.d 2>/dev/null || true
rm -f /usr/local/sbin/tailscale-watchdog
rm -f /etc/systemd/system/tailscale-watchdog.service /etc/systemd/system/tailscale-watchdog.timer
systemctl daemon-reload
echo "Reverted. Tailscale is still running; 'sudo systemctl stop tailscaled' now works."
