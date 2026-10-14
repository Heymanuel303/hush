import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RuleSet } from 'contracts'
import { ApiError } from '@/lib/api'
import { useProfilesStore } from '../profiles'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const ID = '3f2b8c1e-5a4d-4e6f-8a7b-1c2d3e4f5a6b'
const rules: RuleSet = {
  blockWords: ['cat'],
  enabledPacks: [],
  siteWords: {},
  siteOptions: {},
  quietHours: null,
}
const profile = {
  id: ID,
  name: 'Kid',
  locked: false,
  version: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  rules,
}

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('profiles store', () => {
  it('load() fills profiles, and records the error on failure', async () => {
    const s = useProfilesStore()
    fetchMock.mockResolvedValueOnce(json(200, [profile]))
    await s.load()
    expect(s.status).toBe('ready')
    expect(s.profiles).toHaveLength(1)

    fetchMock.mockResolvedValueOnce(json(500, { error: 'internal', message: 'Boom' }))
    await s.load()
    expect(s.status).toBe('error')
    expect(s.error).toBe('Boom')
  })

  it('putRules sends If-Match and returns the fresh profile', async () => {
    const s = useProfilesStore()
    s.profiles = [profile]
    fetchMock.mockResolvedValueOnce(json(200, { ...profile, version: 2 }))
    const fresh = await s.putRules(ID, 1, rules)
    expect(fresh.version).toBe(2)
    expect(s.profiles[0]?.version).toBe(2)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'If-Match': '1' })
  })

  it('putRules rethrows a 412 and keeps the stored profile', async () => {
    const s = useProfilesStore()
    s.profiles = [profile]
    fetchMock.mockResolvedValueOnce(
      json(412, { error: 'stale_version', message: 'Changed elsewhere.' }),
    )
    await expect(s.putRules(ID, 1, rules)).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 412 && e.error === 'stale_version',
    )
    expect(s.profiles[0]?.version).toBe(1)
    expect(s.error).toBeNull()
  })

  it('create, patch and remove keep the list in step', async () => {
    const s = useProfilesStore()
    fetchMock.mockResolvedValueOnce(json(201, profile))
    await s.create({ name: 'Kid' })
    expect(s.profiles).toHaveLength(1)
    fetchMock.mockResolvedValueOnce(json(200, { ...profile, locked: true, version: 2 }))
    await s.patch(ID, { locked: true })
    expect(s.profiles[0]?.locked).toBe(true)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await s.remove(ID)
    expect(s.profiles).toEqual([])
  })
})
