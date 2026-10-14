import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePacksStore } from '../packs'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const ID = '3f2b8c1e-5a4d-4e6f-8a7b-1c2d3e4f5a6b'
const pack = { id: ID, name: 'Mine', words: ['a'], builtIn: false }

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('packs store', () => {
  it('load() fills packs', async () => {
    fetchMock.mockResolvedValue(json(200, [pack]))
    const s = usePacksStore()
    await s.load()
    expect(s.status).toBe('ready')
    expect(s.packs).toEqual([pack])
  })

  it('load() records the error', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'internal', message: 'Boom' }))
    const s = usePacksStore()
    await s.load()
    expect(s.status).toBe('error')
    expect(s.error).toBe('Boom')
  })

  it('create, update and remove keep the list in step', async () => {
    const s = usePacksStore()
    fetchMock.mockResolvedValueOnce(json(201, pack))
    await s.create({ name: 'Mine', words: ['a'] })
    expect(s.packs).toHaveLength(1)

    fetchMock.mockResolvedValueOnce(json(200, { ...pack, name: 'Renamed' }))
    await s.update(ID, { name: 'Renamed' })
    expect(s.packs[0]?.name).toBe('Renamed')

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await s.remove(ID)
    expect(s.packs).toEqual([])
  })

  it('create() rethrows name_taken for the form and leaves the list and error alone', async () => {
    fetchMock.mockResolvedValue(json(409, { error: 'name_taken', message: 'Taken.' }))
    const s = usePacksStore()
    await expect(s.create({ name: 'Mine', words: ['a'] })).rejects.toMatchObject({
      status: 409,
      error: 'name_taken',
    })
    expect(s.packs).toEqual([])
    expect(s.error).toBeNull()
  })
})
