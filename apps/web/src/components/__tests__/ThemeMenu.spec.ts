import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// The OS reports light; the composable's System default resolves to it.
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    })),
  )
}

// useTheme is a module-level singleton, so each test loads a fresh copy of it
// (and of the component that imports it).
async function mountMenu() {
  vi.resetModules()
  const { default: ThemeMenu } = await import('../layout/ThemeMenu.vue')
  const wrapper = mount(ThemeMenu, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

// Opened from the keyboard (jsdom has no PointerEvent); reka-ui renders the
// menu in a portal, so items are queried from document.
async function open(wrapper: Awaited<ReturnType<typeof mountMenu>>) {
  await wrapper.get('button').trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))

describe('ThemeMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    stubMatchMedia()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders the trigger', async () => {
    const wrapper = await mountMenu()
    const trigger = wrapper.get('button')
    expect(trigger.attributes('aria-label')).toBe('Theme')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    wrapper.unmount()
  })

  it('lists Light, Dark and System', async () => {
    const wrapper = await mountMenu()
    await open(wrapper)
    expect(items().map((el) => el.textContent?.trim())).toEqual(['Light', 'Dark', 'System'])
    const checked = items().filter((el) => el.getAttribute('aria-checked') === 'true')
    expect(checked.map((el) => el.textContent?.trim())).toEqual(['System'])
    wrapper.unmount()
  })

  it('choosing Dark persists and applies the class', async () => {
    const wrapper = await mountMenu()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    await open(wrapper)
    const dark = items().find((el) => el.textContent?.trim() === 'Dark')
    expect(dark).toBeDefined()
    dark?.click()
    await flushPromises()
    expect(localStorage.getItem('hush-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    wrapper.unmount()
  })
})
