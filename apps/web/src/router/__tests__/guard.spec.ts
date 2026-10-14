import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installAuthGuard } from '..'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useHubStore } from '@/stores/hub'

vi.mock('@/lib/api', async (orig) => {
  const mod = await orig<typeof import('@/lib/api')>()
  return {
    ...mod,
    api: { ...mod.api, auth: { ...mod.api.auth, hubStatus: vi.fn<() => Promise<unknown>>() } },
  }
})

const stub = { render: () => null }
const status = (profileCount: number) =>
  ({ piholeConnected: false, profileCount, deviceCount: 0 }) as never

function makeRouter() {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/setup', name: 'setup', component: stub },
      { path: '/profiles', name: 'profiles', component: stub },
      { path: '/signin', name: 'signin', component: stub, meta: { public: true } },
    ],
  })
  installAuthGuard(r)
  return r
}

describe('first-run redirect', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.auth.hubStatus).mockReset()
    useAuthStore().$patch({ status: 'authenticated' })
  })

  it('sends "/" to /setup when the hub has no profiles', async () => {
    vi.mocked(api.auth.hubStatus).mockResolvedValue(status(0))
    const r = makeRouter()
    await r.push('/')
    expect(r.currentRoute.value.name).toBe('setup')
  })

  it('sends "/" to /profiles when a profile exists, and asks once', async () => {
    vi.mocked(api.auth.hubStatus).mockResolvedValue(status(2))
    const r = makeRouter()
    await r.push('/')
    expect(r.currentRoute.value.name).toBe('profiles')
    await r.push('/setup')
    await r.push('/')
    expect(r.currentRoute.value.name).toBe('profiles')
    expect(api.auth.hubStatus).toHaveBeenCalledTimes(1)
  })

  it('keeps /setup reachable when profiles exist', async () => {
    useHubStore().$patch({ status: status(1) })
    const r = makeRouter()
    await r.push('/setup')
    expect(r.currentRoute.value.name).toBe('setup')
  })

  it('falls back to /profiles when the status cannot be read', async () => {
    vi.mocked(api.auth.hubStatus).mockRejectedValue(new ApiError(0, { error: 'network', message: 'down' }))
    const r = makeRouter()
    await r.push('/')
    expect(r.currentRoute.value.name).toBe('profiles')
  })
})
