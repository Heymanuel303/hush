/**
 * A fake Pi-hole v6 for tests (api specs, kid mode, Playwright flows): plain node:http, remembers
 * clients and sessions, counts every call. `startFakePihole({ password, seatLimit })`.
 */
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeClient {
  client: string;
  comment: string | null;
  groups: number[];
}

export interface FakePiholeState {
  groups: { id: number; name: string }[];
  clients: FakeClient[];
  sessions: Set<string>;
  /** Per-client blocked counts served by top_clients. */
  topBlocked: { ip: string; name: string; count: number }[];
  /** Seconds a new session stays valid. */
  validity: number;
  version: string;
  /** Answer every non-auth call with 503. */
  down: boolean;
}

export interface FakePihole {
  url: string;
  state: FakePiholeState;
  /** Call counters keyed `METHOD /path` (query stripped; client paths collapse to /api/clients/:client). */
  calls: Record<string, number>;
  /** Makes every live sid answer 401, as after a Pi-hole restart. */
  invalidateSessions(): void;
  close(): Promise<void>;
}

export interface FakePiholeOptions {
  password?: string;
  seatLimit?: number;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function startFakePihole(options: FakePiholeOptions = {}): Promise<FakePihole> {
  const password = options.password ?? 'app-password';
  const seatLimit = options.seatLimit ?? 16;
  let counter = 0;
  const state: FakePiholeState = {
    groups: [
      { id: 0, name: 'Default' },
      { id: 1, name: 'Kid' },
    ],
    clients: [],
    sessions: new Set(),
    topBlocked: [],
    validity: 1800,
    version: 'v6.0.4',
    down: false,
  };
  const calls: Record<string, number> = {};

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const path = url.pathname;
      const key = `${req.method} ${path.startsWith('/api/clients/') ? '/api/clients/:client' : path}`;
      calls[key] = (calls[key] ?? 0) + 1;
      const send = (status: number, body: unknown = {}) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      try {
        if (path === '/api/auth') {
          if (req.method === 'POST') {
            const body = await readJson(req);
            if (body.password !== password) {
              return send(401, { session: { valid: false, sid: null, validity: -1 } });
            }
            if (state.sessions.size >= seatLimit) {
              return send(429, { error: { key: 'rate_limiting', message: 'API seats exhausted' } });
            }
            const sid = `sid-${++counter}`;
            state.sessions.add(sid);
            return send(200, { session: { valid: true, sid, validity: state.validity } });
          }
          if (req.method === 'DELETE') {
            state.sessions.delete(String(req.headers.sid ?? ''));
            res.writeHead(204);
            return res.end();
          }
        }
        if (!state.sessions.has(String(req.headers.sid ?? ''))) {
          return send(401, { error: { key: 'unauthorized', message: 'Unauthorized' } });
        }
        if (state.down) return send(503, { error: { key: 'down', message: 'down' } });
        if (req.method === 'GET' && path === '/api/info/version') {
          return send(200, { version: { core: { local: { version: state.version } } } });
        }
        if (req.method === 'GET' && path === '/api/groups') return send(200, { groups: state.groups });
        if (req.method === 'GET' && path === '/api/clients') return send(200, { clients: state.clients });
        if (req.method === 'POST' && path === '/api/clients') {
          const b = await readJson(req);
          const client = String(b.client);
          if (state.clients.some((c) => c.client === client)) return send(400, { error: { key: 'bad_request' } });
          state.clients.push({ client, comment: (b.comment as string) ?? null, groups: (b.groups as number[]) ?? [0] });
          return send(201, { clients: state.clients });
        }
        if (req.method === 'PUT' && path.startsWith('/api/clients/')) {
          const b = await readJson(req);
          const client = decodeURIComponent(path.slice('/api/clients/'.length));
          const at = state.clients.findIndex((c) => c.client === client);
          if (at < 0) return send(404, { error: { key: 'not_found' } });
          state.clients[at] = { client, comment: (b.comment as string) ?? null, groups: (b.groups as number[]) ?? [] };
          return send(200, { clients: [state.clients[at]] });
        }
        if (req.method === 'GET' && path === '/api/stats/summary') {
          const blocked = state.topBlocked.reduce((n, c) => n + c.count, 0);
          const total = blocked + 100;
          return send(200, { queries: { total, blocked, percent_blocked: (blocked / total) * 100 } });
        }
        if (req.method === 'GET' && path === '/api/stats/top_clients') {
          const count = Number(url.searchParams.get('count') ?? 10);
          return send(200, { clients: state.topBlocked.slice(0, count) });
        }
        return send(404, { error: { key: 'not_found' } });
      } catch {
        send(400, { error: { key: 'bad_request' } });
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    calls,
    invalidateSessions: () => state.sessions.clear(),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
