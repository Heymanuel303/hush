import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// A matchMedia stub whose `matches` the test controls; flipping it fires
// `change` like the OS switching scheme.
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  )
  return {
    set(matches: boolean) {
      mql.matches = matches
      listeners.forEach((fn) => fn({ matches }))
    },
  }
}

// The composable is a module-level singleton, so each test loads a fresh copy.
async function loadTheme() {
  vi.resetModules()
  const { useTheme } = await import('../useTheme')
  const theme = useTheme()
  await nextTick()
  return theme
}

const html = () => document.documentElement

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    html().className = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to auto', async () => {
    const os = stubMatchMedia(false)
    const theme = await loadTheme()
    expect(theme.preference.value).toBe('auto')
    expect(theme.resolved.value).toBe('light')
    expect(html().classList.contains('dark')).toBe(false)

    os.set(true)
    await nextTick()
    expect(theme.resolved.value).toBe('dark')
    expect(html().classList.contains('dark')).toBe(true)
  })

  it('dark adds the html class and persists', async () => {
    stubMatchMedia(false)
    const theme = await loadTheme()
    theme.setPreference('dark')
    await nextTick()
    expect(theme.preference.value).toBe('dark')
    expect(theme.resolved.value).toBe('dark')
    expect(html().classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('hush-theme')).toBe('dark')
  })

  it('light removes the class and persists', async () => {
    stubMatchMedia(true)
    const theme = await loadTheme()
    expect(html().classList.contains('dark')).toBe(true)

    theme.setPreference('light')
    await nextTick()
    expect(theme.resolved.value).toBe('light')
    expect(html().classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('hush-theme')).toBe('light')
  })

  it('reads a stored preference', async () => {
    localStorage.setItem('hush-theme', 'dark')
    stubMatchMedia(false)
    const theme = await loadTheme()
    expect(theme.preference.value).toBe('dark')
    expect(theme.resolved.value).toBe('dark')
    expect(html().classList.contains('dark')).toBe(true)
  })

  it('treats an unknown stored value as auto', async () => {
    localStorage.setItem('hush-theme', 'sepia')
    const os = stubMatchMedia(true)
    const theme = await loadTheme()
    expect(theme.preference.value).toBe('auto')
    expect(theme.resolved.value).toBe('dark')
    expect(html().classList.contains('dark')).toBe(true)
    expect(html().classList.contains('sepia')).toBe(false)

    os.set(false)
    await nextTick()
    expect(theme.resolved.value).toBe('light')
    expect(html().classList.contains('dark')).toBe(false)
  })

  it('returns the same refs to every caller', async () => {
    stubMatchMedia(false)
    vi.resetModules()
    const { useTheme } = await import('../useTheme')
    const a = useTheme()
    const b = useTheme()
    expect(a.preference).toBe(b.preference)
    a.setPreference('dark')
    expect(b.preference.value).toBe('dark')
  })
})
