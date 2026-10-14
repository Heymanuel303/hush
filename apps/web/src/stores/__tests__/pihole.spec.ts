import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePiholeStore } from '../pihole'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('pihole store', () => {
  it('treats 404 not_configured as not connected, not an error', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'not_configured', message: 'None' }))
    const store = usePiholeStore()
    await store.load()
    expect(store.connection).toBeNull()
    expect(store.status).toBe('ready')
    expect(store.error).toBeNull()
  })

  it('load() stores the connection', async () => {
    fetchMock.mockResolvedValue(
      json(200, { url: 'http://192.168.1.11:8070', kidGroupName: 'Kid', hasSecret: true }),
    )
    const store = usePiholeStore()
    await store.load()
    expect(store.connection?.hasSecret).toBe(true)
  })

  it('load() reports other failures as an error', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'internal', message: 'Boom' }))
    const store = usePiholeStore()
    await store.load()
    expect(store.status).toBe('error')
    expect(store.error).toBe('Boom')
  })

  it('loadSummary() keeps a failure out of the page error', async () => {
    fetchMock.mockResolvedValue(json(502, { error: 'pihole_unreachable', message: 'Down' }))
    const store = usePiholeStore()
    await store.loadSummary()
    expect(store.summaryError).toBe('Down')
    expect(store.error).toBeNull()
  })

  it('disconnect() clears the connection and summary', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { url: 'http://pi.local', kidGroupName: 'Kid', hasSecret: true }),
    )
    const store = usePiholeStore()
    await store.load()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await store.disconnect()
    expect(store.connection).toBeNull()
    expect(store.summary).toBeNull()
  })

  it('save() refreshes the summary for the new connection', async () => {
    const conn = { url: 'http://pi.local', kidGroupName: 'Children', hasSecret: true }
    const summary = {
      queries: { total: 10, blocked: 4, percentBlocked: 40 },
      topClients: [],
    }
    fetchMock.mockResolvedValueOnce(json(200, conn)).mockResolvedValueOnce(json(200, summary))
    const store = usePiholeStore()
    store.summary = { queries: { total: 1, blocked: 0, percentBlocked: 0 }, topClients: [] }
    await store.save({ url: conn.url, kidGroupName: 'Children' })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/pihole/summary')
    expect(store.summary?.queries.total).toBe(10)
  })
})
