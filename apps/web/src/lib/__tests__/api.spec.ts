import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
}

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => fetchMock.mockReset())

describe('api client', () => {
  it('parses a valid body and sends credentials', async () => {
    fetchMock.mockResolvedValue(reply(200, { email: 'admin@hush.local' }))
    expect(await api.auth.me()).toEqual({ email: 'admin@hush.local' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/auth/me')
    expect(init?.credentials).toBe('include')
  })

  it('sends JSON bodies', async () => {
    fetchMock.mockResolvedValue(reply(200, { email: 'a@b.co' }))
    await api.auth.login({ email: 'a@b.co', password: 'pw' })
    const init = fetchMock.mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'pw' }))
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('rejects a body that breaks the contract', async () => {
    fetchMock.mockResolvedValue(reply(200, { nope: true }))
    await expect(api.auth.me()).rejects.toHaveProperty('name', 'ZodError')
  })

  it('throws ApiError with the contract error code on 4xx', async () => {
    fetchMock.mockResolvedValue(
      reply(401, { error: 'invalid_credentials', message: 'Wrong', details: { a: 1 } }),
    )
    const error = await api.auth.login({ email: 'a@b.co', password: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 401,
      error: 'invalid_credentials',
      message: 'Wrong',
      details: { a: 1 },
    })
  })

  it('falls back to a generic ApiError when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
    await expect(api.auth.me()).rejects.toMatchObject({ status: 502, error: 'unknown' })
  })

  it('maps a network failure to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(api.auth.me()).rejects.toMatchObject({ status: 0, error: 'network' })
  })

  it('sends If-Match and fills path params', async () => {
    fetchMock.mockResolvedValue(reply(412, { error: 'stale_version', message: 'Stale' }))
    const id = '3f0b3c1e-6a39-4a54-9f55-6a3a0a1d2b11'
    await api.profiles
      .putRules(id, 7, { blockWords: [], enabledPacks: [], siteWords: {}, siteOptions: {}, quietHours: null })
      .catch(() => undefined)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`/api/profiles/${id}/rules`)
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('If-Match')).toBe('7')
  })

  it('returns 204 routes as undefined', async () => {
    fetchMock.mockResolvedValue(reply(204))
    await expect(api.auth.logout()).resolves.toBeUndefined()
  })
})
