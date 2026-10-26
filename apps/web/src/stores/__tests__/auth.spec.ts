import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../auth'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('auth store', () => {
  it('starts unknown', () => {
    expect(useAuthStore().status).toBe('unknown')
  })

  it('load() authenticates when me answers', async () => {
    fetchMock.mockResolvedValue(json(200, { email: 'admin@hush.local' }))
    const auth = useAuthStore()
    await auth.load()
    expect(auth.status).toBe('authenticated')
    expect(auth.admin).toEqual({ email: 'admin@hush.local' })
  })

  it('load() becomes anonymous on 401', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'unauthenticated', message: 'No' }))
    const auth = useAuthStore()
    await auth.load()
    expect(auth.status).toBe('anonymous')
    expect(auth.admin).toBeNull()
  })

  it('load() rethrows other failures and stays unknown', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'internal', message: 'Boom' }))
    const auth = useAuthStore()
    await expect(auth.load()).rejects.toMatchObject({ status: 500 })
    expect(auth.status).toBe('unknown')
  })

  it('logout follows the location', async () => {
    const assign = vi.fn<(url: string) => void>()
    vi.stubGlobal('location', { assign })
    const auth = useAuthStore()
    fetchMock.mockResolvedValueOnce(json(200, { email: 'a@b.co' }))
    await auth.load()
    fetchMock.mockResolvedValueOnce(json(200, { location: 'https://id.example/session/end' }))
    await auth.logout()
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/logout')
    expect(assign).toHaveBeenCalledWith('https://id.example/session/end')
    expect(auth.status).toBe('anonymous')
    expect(auth.admin).toBeNull()
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('logout() drops to anonymous even when the call fails', async () => {
    const auth = useAuthStore()
    fetchMock.mockResolvedValueOnce(json(200, { email: 'a@b.co' }))
    await auth.load()
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(auth.logout()).rejects.toBeTruthy()
    expect(auth.status).toBe('anonymous')
    expect(auth.admin).toBeNull()
  })

  it('loadSetupStatus() stores adminConfigured', async () => {
    fetchMock.mockResolvedValue(json(200, { adminConfigured: false }))
    const auth = useAuthStore()
    await auth.loadSetupStatus()
    expect(auth.setupStatus).toEqual({ adminConfigured: false })
  })
})
