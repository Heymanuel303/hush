import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PairDeviceDialog from '../devices/PairDeviceDialog.vue'
import { api } from '@/lib/api'
import { useProfilesStore } from '@/stores/profiles'

vi.mock('@/lib/api', async (orig) => {
  const mod = await orig<typeof import('@/lib/api')>()
  return {
    ...mod,
    api: {
      ...mod.api,
      devices: { ...mod.api.devices, list: vi.fn<() => Promise<unknown>>() },
      profiles: { ...mod.api.profiles, createPairingCode: vi.fn<() => Promise<unknown>>() },
    },
  }
})

const device = (id: string, label: string) => ({ id, label, revokedAt: null })

describe('PairDeviceDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    useProfilesStore().$patch({ status: 'ready', profiles: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not announce a device that already existed when opened with an empty store', async () => {
    const existing = [device('d1', 'Old PC')]
    vi.mocked(api.devices.list).mockResolvedValue(existing as never)
    vi.mocked(api.profiles.createPairingCode).mockResolvedValue({
      code: 'ABCDEF',
      profileId: 'p1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    } as never)

    mount(PairDeviceDialog, { props: { open: true, profileId: 'p1' }, attachTo: document.body })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3100)
    expect(document.body.textContent).not.toContain('Paired:')

    vi.mocked(api.devices.list).mockResolvedValue([...existing, device('d2', 'Den PC')] as never)
    await vi.advanceTimersByTimeAsync(3100)
    expect(document.body.textContent).toContain('Paired: Den PC')
  })
})
