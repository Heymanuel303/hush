import type { Device } from 'contracts'

/** A code lives ten minutes (the api's TTL); the dialog drains its bar over the same span. */
export const CODE_TTL_MS = 10 * 60 * 1000
/** Three missed 15-minute alarm ticks. */
export const OFFLINE_AFTER_MS = 45 * 60 * 1000

export interface Countdown {
  /** `m:ss`, never below 0:00. */
  text: string
  /** 1 = full, 0 = drained. */
  fraction: number
  expired: boolean
}

export function countdown(expiresAt: string, now: number, ttlMs: number = CODE_TTL_MS): Countdown {
  const left = Math.max(0, new Date(expiresAt).getTime() - now)
  const seconds = Math.ceil(left / 1000)
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return { text, fraction: Math.min(1, left / ttlMs), expired: left === 0 }
}

export function isOffline(lastSeenAt: string | null | undefined, now: number): boolean {
  return !!lastSeenAt && now - new Date(lastSeenAt).getTime() > OFFLINE_AFTER_MS
}

export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** Why the kid-mode switch is off-limits, or `null` when it can be used. */
export function kidSwitchReason(
  device: Pick<Device, 'tailscaleIp' | 'revokedAt' | 'kidMode'>,
  piholeConnected: boolean,
): string | null {
  if (device.revokedAt) return 'This device is revoked.'
  if (!piholeConnected) return 'Connect Pi-hole to use kid mode.'
  if (!device.tailscaleIp) return 'Set the device’s Tailscale IP first.'
  if (device.kidMode.schedule) return 'A schedule controls kid mode. Edit or remove the schedule to switch it by hand.'
  return null
}
