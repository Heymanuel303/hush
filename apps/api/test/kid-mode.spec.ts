import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Device } from 'contracts';
import type { PairResponse, ProfileWithRules, QuietHours } from 'contracts';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import request from 'supertest';
import { KidModeWorker, KID_MODE_CLOCK } from '../src/kid-mode/kid-mode.worker.js';
import type { KidModeClock } from '../src/kid-mode/kid-mode.worker.js';
import { isInsideWindows } from '../src/kid-mode/schedule.js';
import { createTestApp, prismaOf, resetDb } from './db.js';
import { adminCookie, ssoEnv, startStub } from './sso.js';
import { startFakePihole } from './fake-pihole.js';
import type { FakePihole } from './fake-pihole.js';

const saved = { ...process.env };
let stub: OidcStub;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(async () => {
  await stub.close();
});
const PASSWORD = 'app-password-123';
const IP = '100.64.0.9';
let app: INestApplication;
let cookie: string;
let fake: FakePihole;

const api = (method: 'get' | 'put' | 'post' | 'patch' | 'delete', path: string, authed = true) => {
  const r = request(app.getHttpServer())[method](`/api${path}`);
  return authed ? r.set('Cookie', cookie) : r;
};
const writes = () => (fake.calls['PUT /api/clients/:client'] ?? 0) + (fake.calls['POST /api/clients'] ?? 0);
const piholeCalls = () => Object.entries(fake.calls).filter(([k]) => k !== 'POST /api/auth' && k !== 'DELETE /api/auth');
const connect = () => api('put', '/pihole').send({ url: fake.url, appPassword: PASSWORD, kidGroupName: 'Kid' }).expect(200);
const makeDevice = async (tailscaleIp: string | null = IP): Promise<string> => {
  const profile = (await api('post', '/profiles').send({ name: `Kid ${Math.random()}` }).expect(201)).body as ProfileWithRules;
  const { code } = (await api('post', `/profiles/${profile.id}/pairing-codes`).expect(201)).body;
  const paired = (await api('post', '/devices/pair', false).send({ code, label: 'Tablet' }).expect(201)).body as PairResponse;
  if (tailscaleIp) await api('patch', `/devices/${paired.deviceId}`).send({ tailscaleIp }).expect(200);
  return paired.deviceId;
};
const putKid = (id: string, enabled: boolean, schedule: QuietHours | null = null) =>
  api('put', `/devices/${id}/kid-mode`).send({ enabled, schedule });
const row = (id: string) => prismaOf(app).device.findUniqueOrThrow({ where: { id } });
const schoolDay: QuietHours = {
  timezone: 'UTC',
  windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00' }],
};

/** Rebuilds the app on the same data (no truncate) with the given env; the session cookie stays valid. */
async function restart(env: Record<string, string>, nowIso?: string) {
  await app.close();
  process.env = { ...process.env, ...env };
  // The clock is installed before bootstrap so the start-up pass already sees the fake time.
  app = await createTestApp(
    nowIso ? (b) => b.overrideProvider(KID_MODE_CLOCK).useValue({ now: () => new Date(nowIso) }) : undefined,
  );
}

async function boot(env: Record<string, string> = {}) {
  process.env = {
    ...saved,
    ...ssoEnv(stub),
    ...env,
  };
  app = await createTestApp();
  await resetDb(prismaOf(app));
  await app.close();
  app = await createTestApp();
  cookie = await adminCookie(app, stub);
}

beforeEach(async () => {
  fake = await startFakePihole({ password: PASSWORD });
  await boot();
});

afterEach(async () => {
  await app.close();
  await fake.close();
  process.env = saved;
});

describe('isInsideWindows', () => {
  const cases = JSON.parse(
    readFileSync(new URL('../../../test/fixtures/schedule/cases.json', import.meta.url), 'utf8'),
  ) as { name: string; quietHours: QuietHours | null; now: string; expected: boolean }[];
  it.each(cases)('$name', ({ quietHours, now, expected }) => {
    expect(isInsideWindows(quietHours, new Date(now))).toBe(expected);
  });
  it('is false for null and for a bad time zone', () => {
    expect(isInsideWindows(null, new Date())).toBe(false);
    expect(isInsideWindows({ ...schoolDay, timezone: 'Nowhere/Land' }, new Date())).toBe(false);
  });
});

describe('PUT /api/devices/:id/kid-mode', () => {
  it('needs the admin session', async () => {
    const id = await makeDevice();
    await api('put', `/devices/${id}/kid-mode`, false).send({ enabled: true, schedule: null }).expect(401);
  });

  it('rejects a malformed body and an unknown device', async () => {
    const id = await makeDevice();
    await api('put', `/devices/${id}/kid-mode`).send({ enabled: 'yes' }).expect(400);
    await putKid('3f1c2f0e-6a52-4f0e-9f0a-1b2c3d4e5f60', true).expect(404);
  });

  it('toggles on and off through the Pi-hole API', async () => {
    await connect();
    const id = await makeDevice();
    fake.state.clients.push({ client: IP, comment: 'my tablet', groups: [0] });
    const on = await putKid(id, true).expect(200);
    expect(Device.parse(on.body).kidMode).toMatchObject({ enabled: true, state: 'kid', schedule: null });
    expect(on.body.kidMode.lastAppliedAt).toBeDefined();
    expect(fake.state.clients[0]).toEqual({ client: IP, comment: 'my tablet', groups: [1] });
    const off = await putKid(id, false).expect(200);
    expect(off.body.kidMode).toMatchObject({ enabled: false, state: 'default' });
    expect(fake.state.clients[0]).toEqual({ client: IP, comment: 'my tablet', groups: [0] });
  });

  it('creates the client when Pi-hole does not know the IP', async () => {
    await connect();
    const id = await makeDevice();
    const res = await putKid(id, true).expect(200);
    expect(res.body.kidMode.state).toBe('kid');
    expect(fake.calls['POST /api/clients']).toBe(1);
    expect(fake.state.clients).toEqual([{ client: IP, comment: 'Hush: Tablet', groups: [1] }]);
  });

  it('applying the current state again makes no Pi-hole call', async () => {
    await connect();
    const id = await makeDevice();
    await putKid(id, true).expect(200);
    const before = JSON.stringify(piholeCalls());
    await putKid(id, true).expect(200);
    expect(JSON.stringify(piholeCalls())).toBe(before);
  });

  it('409 pihole_not_configured without a connection', async () => {
    const id = await makeDevice();
    const res = await putKid(id, true).expect(409);
    expect(res.body.error).toBe('pihole_not_configured');
    expect((await row(id)).kidModeEnabled).toBe(false);
  });

  it('409 no_tailscale_ip without an address', async () => {
    await connect();
    const id = await makeDevice(null);
    expect((await putKid(id, true).expect(409)).body.error).toBe('no_tailscale_ip');
    expect(writes()).toBe(0);
  });

  it('409 kid_group_missing lists the groups', async () => {
    await connect();
    fake.state.groups = [{ id: 0, name: 'Default' }];
    const id = await makeDevice();
    const res = await putKid(id, true).expect(409);
    expect(res.body).toMatchObject({ error: 'kid_group_missing', details: { groups: ['Default'] } });
    expect(writes()).toBe(0);
  });

  it('502 pihole_unreachable stores state error and the message', async () => {
    await connect();
    const id = await makeDevice();
    fake.state.down = true;
    const res = await putKid(id, true).expect(502);
    expect(res.body.error).toBe('pihole_unreachable');
    const device = (await api('get', '/devices').expect(200)).body.find((d: Device) => d.id === id) as Device;
    expect(device.kidMode.state).toBe('error');
    expect(device.kidMode.lastError).toBeTruthy();
    // Recovery: the next toggle works and clears the error.
    fake.state.down = false;
    const ok = await putKid(id, true).expect(200);
    expect(ok.body.kidMode.state).toBe('kid');
    expect(ok.body.kidMode.lastError).toBeUndefined();
  });

  it('404 for a revoked device', async () => {
    await connect();
    const id = await makeDevice();
    await api('delete', `/devices/${id}`).expect(204);
    await putKid(id, true).expect(404);
    expect(writes()).toBe(0);
  });

  it('with a schedule stores it, ignores enabled and makes no Pi-hole call', async () => {
    await connect();
    const id = await makeDevice();
    const before = JSON.stringify(piholeCalls());
    const res = await putKid(id, true, schoolDay).expect(200);
    expect(res.body.kidMode).toMatchObject({ enabled: true, state: 'unknown', schedule: schoolDay });
    expect(JSON.stringify(piholeCalls())).toBe(before);
    // Clearing the schedule with enabled=false applies Default at once.
    const off = await putKid(id, false).expect(200);
    expect(off.body.kidMode).toMatchObject({ schedule: null, state: 'default' });
  });

  it('rejects an invalid schedule', async () => {
    const id = await makeDevice();
    await putKid(id, true, { timezone: 'Nowhere/Land', windows: schoolDay.windows }).expect(400);
  });
});

describe('KidModeWorker', () => {
  const at = (iso: string) => {
    app.get<KidModeClock>(KID_MODE_CLOCK).now = () => new Date(iso);
  };
  const tick = () => app.get(KidModeWorker).tick();

  it('follows the schedule with one write per transition', async () => {
    await connect();
    const id = await makeDevice();
    await putKid(id, false, schoolDay).expect(200);

    at('2026-10-12T08:00:00Z');
    await tick();
    expect((await row(id)).kidModeState).toBe('default');
    expect(writes()).toBe(1);
    await tick();
    expect(writes()).toBe(1);

    at('2026-10-12T09:00:00Z');
    await tick();
    expect((await row(id)).kidModeState).toBe('kid');
    expect(fake.state.clients[0]!.groups).toEqual([1]);
    expect(writes()).toBe(2);
    at('2026-10-12T16:59:00Z');
    await tick();
    expect(writes()).toBe(2);

    at('2026-10-12T17:00:00Z');
    await tick();
    expect((await row(id)).kidModeState).toBe('default');
    expect(fake.state.clients[0]!.groups).toEqual([0]);
    expect(writes()).toBe(3);
  });

  it('retries each tick during a Pi-hole outage, records the error, and recovers', async () => {
    await connect();
    const id = await makeDevice();
    await putKid(id, false, schoolDay).expect(200);
    at('2026-10-12T10:00:00Z');
    fake.state.down = true;
    await tick();
    const failed = await row(id);
    expect(failed.kidModeState).toBe('error');
    expect(failed.kidModeLastError).toBeTruthy();
    await tick();
    expect((await row(id)).kidModeState).toBe('error');
    fake.state.down = false;
    await tick();
    const ok = await row(id);
    expect(ok.kidModeState).toBe('kid');
    expect(ok.kidModeLastError).toBeNull();
  });

  it('records a setup problem (no connection) on the device instead of throwing', async () => {
    const id = await makeDevice();
    await putKid(id, false, schoolDay).expect(200);
    at('2026-10-12T10:00:00Z');
    await expect(tick()).resolves.toBeUndefined();
    const d = await row(id);
    expect(d.kidModeState).toBe('error');
    expect(d.kidModeLastError).toMatch(/Pi-hole/);
  });

  it('skips revoked devices, devices without a schedule and devices without an IP', async () => {
    await connect();
    const revoked = await makeDevice();
    await putKid(revoked, false, schoolDay).expect(200);
    await api('delete', `/devices/${revoked}`).expect(204);
    await makeDevice(); // no schedule
    const noIp = await makeDevice(null);
    await putKid(noIp, false, schoolDay).expect(200);
    at('2026-10-12T10:00:00Z');
    await tick();
    expect(writes()).toBe(0);
    expect((await row(noIp)).kidModeState).toBe('unknown');
  });

  it('does nothing at bootstrap while WORKER_ENABLED is not true', async () => {
    await connect();
    const id = await makeDevice();
    await putKid(id, false, schoolDay).expect(200);
    await restart({ WORKER_ENABLED: 'false' });
    await new Promise((r) => setTimeout(r, 300));
    expect(writes()).toBe(0);
    expect((await row(id)).kidModeState).toBe('unknown');
  });

  it('runs once at start when WORKER_ENABLED=true', async () => {
    await connect();
    const id = await makeDevice();
    await putKid(id, false, schoolDay).expect(200);
    await restart({ WORKER_ENABLED: 'true' }, '2026-10-12T10:00:00Z');
    // No tick() from the test: only the bootstrap pass can have moved the device.
    await vi.waitFor(async () => expect((await row(id)).kidModeState).toBe('kid'));
    expect(writes()).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(writes()).toBe(1);
  });
});
