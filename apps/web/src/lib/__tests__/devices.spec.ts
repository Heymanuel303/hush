import { describe, expect, it } from 'vitest'
import { CODE_TTL_MS, countdown, isOffline, kidSwitchReason, relativeTime } from '../devices'

const start = Date.parse('2026-10-14T10:00:00Z')
const expires = new Date(start + CODE_TTL_MS).toISOString()
const base = { tailscaleIp: '100.64.0.7', revokedAt: null, kidMode: { enabled: false, schedule: null, state: 'default' as const } }

describe('countdown', () => {
  it('runs from 10:00 to 0:00 and drains the bar', () => {
    expect(countdown(expires, start)).toEqual({ text: '10:00', fraction: 1, expired: false })
    expect(countdown(expires, start + 5 * 60_000).text).toBe('5:00')
    expect(countdown(expires, start + 5 * 60_000).fraction).toBe(0.5)
    expect(countdown(expires, start + CODE_TTL_MS - 1_000).text).toBe('0:01')
  })
  it('is expired at zero and never goes negative', () => {
    expect(countdown(expires, start + CODE_TTL_MS)).toEqual({ text: '0:00', fraction: 0, expired: true })
    expect(countdown(expires, start + CODE_TTL_MS + 60_000).text).toBe('0:00')
  })
})

describe('last seen', () => {
  it('says never for null and flags offline after 45 minutes', () => {
    expect(relativeTime(null, start)).toBe('never')
    expect(isOffline(null, start)).toBe(false)
    const ago = (min: number) => new Date(start - min * 60_000).toISOString()
    expect(isOffline(ago(44), start)).toBe(false)
    expect(isOffline(ago(46), start)).toBe(true)
    expect(relativeTime(ago(5), start)).toBe('5 min ago')
    expect(relativeTime(ago(120), start)).toBe('2 h ago')
  })
})

describe('kidSwitchReason', () => {
  it('picks the first blocking reason', () => {
    expect(kidSwitchReason(base, true)).toBeNull()
    expect(kidSwitchReason(base, false)).toMatch(/Connect Pi-hole/)
    expect(kidSwitchReason({ ...base, tailscaleIp: null }, true)).toMatch(/Tailscale IP/)
    const scheduled = { ...base, kidMode: { ...base.kidMode, schedule: { timezone: 'UTC', windows: [] } } }
    expect(kidSwitchReason(scheduled, true)).toMatch(/schedule/)
    expect(kidSwitchReason({ ...base, revokedAt: start.toString() }, true)).toMatch(/revoked/)
  })
})
