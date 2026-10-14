import { Agent, fetch } from 'undici';
import type { Dispatcher } from 'undici';

export interface PiholeClientOptions {
  url: string;
  password: string;
  tlsInsecure: boolean;
}

export type PiholeErrorCode = 'pihole_no_seats' | 'pihole_auth' | 'pihole_unreachable';

export class PiholeError extends Error {
  constructor(
    readonly code: PiholeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PiholeGroup {
  id: number;
  name: string;
}
export interface PiholeClientEntry {
  client: string;
  name?: string | null;
  comment?: string | null;
  groups: number[];
}
export interface PiholeSummaryRaw {
  queries: { total: number; blocked: number; percent_blocked: number };
}
export interface PiholeTopClient {
  ip: string;
  name?: string | null;
  count: number;
}

const TIMEOUT_MS = 10_000;
/** Renew the sid this long before Pi-hole would expire it. */
const MARGIN_MS = 30_000;

/**
 * Pi-hole v6 API client. Holds ONE session per instance (Pi-hole allows only
 * `webserver.api.max_sessions`, default 16, and answers 429 when exhausted, which also locks
 * the web UI out): authenticates lazily, caches the sid until shortly before it expires and
 * re-authenticates once on 401.
 */
export class PiholeClient {
  private sid: string | null = null;
  private sidExpiresAt = 0;
  private authInFlight: Promise<string> | null = null;
  private readonly base: string;
  private readonly dispatcher: Dispatcher | undefined;

  constructor(private readonly options: PiholeClientOptions) {
    this.base = options.url.replace(/\/+$/, '');
    // Scoped to this client; NODE_TLS_REJECT_UNAUTHORIZED is never touched.
    this.dispatcher = options.tlsInsecure
      ? new Agent({ connect: { rejectUnauthorized: false } })
      : undefined;
  }

  async groups(): Promise<PiholeGroup[]> {
    const body = await this.request<{ groups?: PiholeGroup[] }>('GET', '/api/groups');
    return (body.groups ?? []).map((g) => ({ id: g.id, name: g.name }));
  }

  async clients(): Promise<PiholeClientEntry[]> {
    const body = await this.request<{ clients?: PiholeClientEntry[] }>('GET', '/api/clients');
    return body.clients ?? [];
  }

  createClient(ip: string, comment: string, groupIds: number[]): Promise<unknown> {
    return this.request('POST', '/api/clients', { client: ip, comment, groups: groupIds });
  }

  /** Pi-hole replaces every field on PUT, so all of them are always sent. */
  setClientGroups(ip: string, comment: string, groupIds: number[]): Promise<unknown> {
    return this.request('PUT', `/api/clients/${encodeURIComponent(ip)}`, {
      client: ip,
      comment,
      groups: groupIds,
    });
  }

  async summary(): Promise<PiholeSummaryRaw> {
    return this.request<PiholeSummaryRaw>('GET', '/api/stats/summary');
  }

  async topClientsBlocked(count: number): Promise<PiholeTopClient[]> {
    const body = await this.request<{ clients?: PiholeTopClient[] }>(
      'GET',
      `/api/stats/top_clients?blocked=true&count=${count}`,
    );
    return body.clients ?? [];
  }

  async version(): Promise<string> {
    const body = await this.request<{
      version?: { core?: { local?: { version?: string } } };
    }>('GET', '/api/info/version');
    return body.version?.core?.local?.version ?? 'unknown';
  }

  /** Ends the session on Pi-hole (frees the seat). Never throws. */
  async logout(): Promise<void> {
    const sid = this.sid;
    this.sid = null;
    this.sidExpiresAt = 0;
    const pending = this.authInFlight;
    this.authInFlight = null;
    const live = sid ?? (await pending?.catch(() => null)) ?? null;
    if (!live) return;
    try {
      await this.raw('DELETE', '/api/auth', undefined, live);
    } catch {
      // The seat frees itself at session timeout.
    }
  }

  /** Releases the connection pool of the insecure agent (after logout). */
  async close(): Promise<void> {
    await this.logout();
    await this.dispatcher?.close();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let sid = await this.session();
    let res = await this.raw(method, path, body, sid);
    if (res.status === 401) {
      this.sid = null;
      sid = await this.session();
      res = await this.raw(method, path, body, sid);
    }
    if (!res.ok) {
      throw new PiholeError('pihole_unreachable', `Pi-hole answered ${res.status} for ${method} ${path}.`);
    }
    return (await res.json().catch(() => ({}))) as T;
  }

  private session(): Promise<string> {
    if (this.sid && Date.now() < this.sidExpiresAt) return Promise.resolve(this.sid);
    this.authInFlight ??= this.authenticate().finally(() => {
      this.authInFlight = null;
    });
    return this.authInFlight;
  }

  private async authenticate(): Promise<string> {
    const res = await this.raw('POST', '/api/auth', { password: this.options.password });
    if (res.status === 429) {
      throw new PiholeError(
        'pihole_no_seats',
        'Pi-hole has no free API sessions. Raise webserver.api.max_sessions or free sessions.',
      );
    }
    const body = (await res.json().catch(() => ({}))) as {
      session?: { valid?: boolean; sid?: string | null; validity?: number };
    };
    if (!res.ok || !body.session?.valid || !body.session.sid) {
      throw new PiholeError('pihole_auth', 'Pi-hole rejected the password.');
    }
    this.sid = body.session.sid;
    this.sidExpiresAt = Date.now() + Math.max(0, (body.session.validity ?? 0) * 1000 - MARGIN_MS);
    return this.sid;
  }

  private async raw(method: string, path: string, body?: unknown, sid?: string) {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (sid) headers.sid = sid;
    try {
      return await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        dispatcher: this.dispatcher,
      });
    } catch (e) {
      const reason = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : 'failed';
      throw new PiholeError('pihole_unreachable', `Cannot reach Pi-hole: ${reason}`);
    }
  }
}
