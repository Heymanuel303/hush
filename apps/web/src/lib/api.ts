import type { z } from 'zod'
import { ErrorBody, ROUTES } from 'contracts'
import type { DeviceConfig, RouteName } from 'contracts'

type Body<N extends RouteName> = (typeof ROUTES)[N] extends { request: infer R extends z.ZodType }
  ? z.input<R>
  : undefined

type Result<N extends RouteName> = (typeof ROUTES)[N] extends { response: infer R extends z.ZodType }
  ? z.output<R>
  : void

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

/** A non-2xx answer, built from the contract's `ErrorBody`. */
export class ApiError extends Error {
  readonly status: number
  readonly error: string
  readonly details: unknown

  constructor(status: number, body: { error: string; message: string; details?: unknown }) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.error = body.error
    this.details = body.details
  }
}

interface CallOptions {
  params?: Record<string, string>
  body?: unknown
  headers?: Record<string, string>
}

interface Reply {
  status: number
  etag: string | null
  data: unknown
}

function urlFor(path: string, params: Record<string, string> = {}): string {
  const filled = path.replace(/:(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ''))
  return API_BASE + filled.replace(/^\/api/, '')
}

async function send(name: RouteName, options: CallOptions = {}): Promise<Reply> {
  const route = ROUTES[name]
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  const init: RequestInit = { method: route.method, credentials: 'include', headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  let res: Response
  try {
    res = await fetch(urlFor(route.path, options.params), init)
  } catch {
    throw new ApiError(0, { error: 'network', message: 'The hub did not answer.' })
  }
  const text = res.status === 204 || res.status === 304 ? '' : await res.text()
  let json: unknown
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
  }
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(json)
    throw new ApiError(
      res.status,
      parsed.success
        ? parsed.data
        : { error: 'unknown', message: `The hub answered ${res.status}.` },
    )
  }
  return { status: res.status, etag: res.headers.get('ETag'), data: json }
}

/** Calls a route and parses the body with its contract schema (`undefined` when it has none). */
async function call<N extends RouteName>(name: N, options?: CallOptions): Promise<Result<N>> {
  const reply = await send(name, options)
  const route = ROUTES[name]
  // Result<N> is derived from the same table, so the two cannot disagree.
  return ('response' in route ? route.response.parse(reply.data) : undefined) as Result<N>
}

const id = (value: string) => ({ params: { id: value } })

/** `If-Match` carries the profile version the edit was based on (stale → 412 stale_version). */
export const ifMatch = (version: number): Record<string, string> => ({
  'If-Match': String(version),
})

export type ConfigResult = { notModified: true } | { notModified: false; config: DeviceConfig; etag: string | null }

/** One function per name in contracts `ROUTES`. Only the admin ones are used by the web app. */
export const api = {
  auth: {
    logout: () => call('logout'),
    me: () => call('me'),
    setupStatus: () => call('setupStatus'),
    hubStatus: () => call('hubStatus'),
  },
  profiles: {
    list: () => call('listProfiles'),
    create: (body: Body<'createProfile'>) => call('createProfile', { body }),
    get: (profileId: string) => call('getProfile', id(profileId)),
    patch: (profileId: string, body: Body<'patchProfile'>) =>
      call('patchProfile', { ...id(profileId), body }),
    remove: (profileId: string) => call('deleteProfile', id(profileId)),
    putRules: (profileId: string, version: number, rules: Body<'putRules'>) =>
      call('putRules', {
        ...id(profileId),
        body: rules,
        headers: ifMatch(version),
      }),
    createPairingCode: (profileId: string) =>
      call('createPairingCode', id(profileId)),
    templates: () => call('listTemplates'),
  },
  packs: {
    list: () => call('listPacks'),
    create: (body: Body<'createPack'>) => call('createPack', { body }),
    patch: (packId: string, body: Body<'patchPack'>) =>
      call('patchPack', { ...id(packId), body }),
    remove: (packId: string) => call('deletePack', id(packId)),
  },
  devices: {
    list: () => call('listDevices'),
    patch: (deviceId: string, body: Body<'patchDevice'>) =>
      call('patchDevice', { ...id(deviceId), body }),
    revoke: (deviceId: string) => call('revokeDevice', id(deviceId)),
    putKidMode: (deviceId: string, body: Body<'putKidMode'>) =>
      call('putKidMode', { ...id(deviceId), body }),
    // Public and device routes: listed for the e2e tests, not used by the web app.
    pair: (body: Body<'pairDevice'>) => call('pairDevice', { body }),
    config: async (token: string, etag?: string): Promise<ConfigResult> => {
      const reply = await send('deviceConfig', {
        headers: { Authorization: `Bearer ${token}`, ...(etag ? { 'If-None-Match': etag } : {}) },
      })
      if (reply.status === 304) return { notModified: true }
      const config = ROUTES.deviceConfig.response.parse(reply.data)
      return { notModified: false, config, etag: reply.etag }
    },
  },
  pihole: {
    get: () => call('getPihole'),
    put: (body: Body<'putPihole'>) => call('putPihole', { body }),
    remove: () => call('deletePihole'),
    test: (body: Body<'testPihole'>) => call('testPihole', { body }),
    summary: () => call('piholeSummary'),
  },
}
