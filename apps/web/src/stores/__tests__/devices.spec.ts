import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDevicesStore } from '../devices'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

const device = (n: number, revokedAt: string | null = null) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  profileId: '00000000-0000-4000-8000-0000000000aa',
  label: `Laptop ${n}`,
  pairedAt: '2026-10-01T10:00:00Z',
  revokedAt,
  kidMode: { enabled: false, schedule: null, state: 'default' },
})

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('devices store', () => {
  it('hides revoked devices until showRevoked is on', async () => {
    fetchMock.mockResolvedValue(json(200, [device(1), device(2, '2026-10-02T10:00:00Z')]))
    const store = useDevicesStore()
    await store.load()
    expect(store.showRevoked).toBe(false)
    expect(store.visible.map((d) => d.label)).toEqual(['Laptop 1'])
    store.showRevoked = true
    expect(store.visible).toHaveLength(2)
  })

  it('records a load failure for the screen', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'boom', message: 'Down' }))
    const store = useDevicesStore()
    await store.load()
    expect(store.status).toBe('error')
    expect(store.error).toBe('Down')
  })

  it('patch replaces the row in place', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [device(1)]))
    const store = useDevicesStore()
    await store.load()
    fetchMock.mockResolvedValueOnce(json(200, { ...device(1), label: 'Den PC' }))
    await store.patch(device(1).id, { label: 'Den PC' })
    expect(store.devices[0]?.label).toBe('Den PC')
  })
})
