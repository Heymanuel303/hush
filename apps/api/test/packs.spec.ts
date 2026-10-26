import type { INestApplication } from '@nestjs/common';
import { BUILT_IN_PACKS, Pack } from 'contracts';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import request from 'supertest';
import { createTestApp, prismaOf, resetDb } from './db.js';
import { adminCookie, ssoEnv, startStub } from './sso.js';

const saved = { ...process.env };
let stub: OidcStub;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(async () => {
  await stub.close();
});
let app: INestApplication;
let cookie: string;

const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, authed = true) => {
  const r = request(app.getHttpServer())[method](`/api${path}`);
  return authed ? r.set('Cookie', cookie) : r;
};

async function makeProfile(name: string, enabledPacks: string[]) {
  return prismaOf(app).profile.create({
    data: {
      name,
      rules: { create: { blockWords: [], enabledPacks, siteWords: {}, siteOptions: {} } },
    },
  });
}
const version = async (id: string) =>
  (await prismaOf(app).profile.findUniqueOrThrow({ where: { id } })).version;
const packsOf = async (id: string) =>
  (await prismaOf(app).ruleSet.findUniqueOrThrow({ where: { profileId: id } })).enabledPacks;
const create = async (name: string, words: string[]) =>
  (await api('post', '/packs').send({ name, words }).expect(201)).body as Pack;

beforeEach(async () => {
  process.env = {
    ...saved,
    ...ssoEnv(stub),
  };
  app = await createTestApp();
  await resetDb(prismaOf(app));
  await app.close();
  app = await createTestApp();
  cookie = await adminCookie(app, stub);
});

afterEach(async () => {
  await app.close();
  process.env = saved;
});

describe('auth', () => {
  it.each([
    ['get', '/packs'],
    ['post', '/packs'],
    ['patch', '/packs/6f1c2d3e-0000-4000-8000-000000000000'],
    ['delete', '/packs/6f1c2d3e-0000-4000-8000-000000000000'],
  ] as const)('%s %s without a session is 401', async (m, p) => {
    const res = await api(m, p, false).send({ name: 'x', words: ['a'] }).expect(401);
    expect(res.body.error).toBe('unauthenticated');
  });
});

describe('GET /api/packs', () => {
  it('lists the built-in six in order, then household packs by name', async () => {
    await create('Zebra', ['z']);
    await create('apple', ['a']);
    const res = await api('get', '/packs').expect(200);
    const list = res.body as Pack[];
    expect(() => list.forEach((p) => Pack.parse(p))).not.toThrow();
    expect(list.map((p) => p.name)).toEqual([...BUILT_IN_PACKS.map((p) => p.name), 'Zebra', 'apple']);
    expect(list.map((p) => p.builtIn)).toEqual([true, true, true, true, true, true, false, false]);
    expect(list[0]!.words).toEqual([...BUILT_IN_PACKS[0]!.words]);
  });
});

describe('POST /api/packs', () => {
  it('creates a household pack storing words as sent (= untouched)', async () => {
    const res = await api('post', '/packs').send({ name: ' Gaming ', words: [' =fortnite ', 'Minecraft'] }).expect(201);
    expect(Pack.parse(res.body)).toMatchObject({ name: 'Gaming', words: ['=fortnite', 'Minecraft'], builtIn: false });
  });

  it('409 name_taken, case-insensitively, including built-in names', async () => {
    await create('Gaming', ['a']);
    for (const name of ['gaming', 'GAMING', 'crypto', 'SPOILERS']) {
      const res = await api('post', '/packs').send({ name, words: ['x'] }).expect(409);
      expect(res.body.error).toBe('name_taken');
    }
  });

  it('400 duplicate_word, case-insensitively', async () => {
    const res = await api('post', '/packs').send({ name: 'Dup', words: ['Cat', 'cat'] }).expect(400);
    expect(res.body.error).toBe('duplicate_word');
    expect(await prismaOf(app).pack.count({ where: { name: 'Dup' } })).toBe(0);
  });

  it('400 validation on malformed bodies', async () => {
    for (const body of [{}, { name: '', words: ['a'] }, { name: 'X', words: [] }, { name: 'X' }, { name: 'X', words: [1] }]) {
      const res = await api('post', '/packs').send(body).expect(400);
      expect(res.body.error).toBe('validation');
    }
  });

  it('concurrent creates of the same name: one 201, the rest 409', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api('post', '/packs').send({ name: 'Race', words: ['a'] })),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409, 409, 409, 409]);
  });
});

describe('PATCH /api/packs/:id', () => {
  it('403 built_in_pack', async () => {
    const builtIn = await prismaOf(app).pack.findUniqueOrThrow({ where: { name: 'Crypto' } });
    const res = await api('patch', `/packs/${builtIn.id}`).send({ words: ['x'] }).expect(403);
    expect(res.body.error).toBe('built_in_pack');
    expect((await prismaOf(app).pack.findUniqueOrThrow({ where: { name: 'Crypto' } })).words).toEqual(builtIn.words);
  });

  it('404 for unknown id, 400 for a malformed id', async () => {
    await api('patch', '/packs/6f1c2d3e-0000-4000-8000-000000000000').send({ words: ['x'] }).expect(404);
    await api('patch', '/packs/not-a-uuid').send({ words: ['x'] }).expect(400);
  });

  it('rename propagates to enabledPacks and bumps affected profiles by exactly one', async () => {
    const pack = await create('Gaming', ['a']);
    const a = await makeProfile('A', ['Crypto', 'Gaming']);
    const b = await makeProfile('B', ['Gaming']);
    const c = await makeProfile('C', ['Crypto']);
    const res = await api('patch', `/packs/${pack.id}`).send({ name: 'Games' }).expect(200);
    expect(res.body).toMatchObject({ id: pack.id, name: 'Games', words: ['a'], builtIn: false });
    expect(await packsOf(a.id)).toEqual(['Crypto', 'Games']);
    expect(await packsOf(b.id)).toEqual(['Games']);
    expect(await packsOf(c.id)).toEqual(['Crypto']);
    expect([await version(a.id), await version(b.id), await version(c.id)]).toEqual([2, 2, 1]);
  });

  it('renaming onto another pack (any case) is 409 and changes nothing', async () => {
    const pack = await create('Gaming', ['a']);
    const p = await makeProfile('A', ['Gaming']);
    for (const name of ['crypto', 'Crypto']) {
      const res = await api('patch', `/packs/${pack.id}`).send({ name }).expect(409);
      expect(res.body.error).toBe('name_taken');
    }
    expect(await packsOf(p.id)).toEqual(['Gaming']);
    expect(await version(p.id)).toBe(1);
  });

  it('case-only rename of its own name is allowed', async () => {
    const pack = await create('Gaming', ['a']);
    const p = await makeProfile('A', ['Gaming']);
    await api('patch', `/packs/${pack.id}`).send({ name: 'GAMING' }).expect(200);
    expect(await packsOf(p.id)).toEqual(['GAMING']);
  });

  it('words-only edit bumps only profiles that enable the pack', async () => {
    const pack = await create('Gaming', ['a']);
    const on = await makeProfile('On', ['Gaming']);
    const off = await makeProfile('Off', ['Crypto']);
    const res = await api('patch', `/packs/${pack.id}`).send({ words: ['b', 'c'] }).expect(200);
    expect(res.body.words).toEqual(['b', 'c']);
    expect(await version(on.id)).toBe(2);
    expect(await version(off.id)).toBe(1);
    expect(await packsOf(on.id)).toEqual(['Gaming']);
  });

  it('duplicate words are 400 and bump nothing', async () => {
    const pack = await create('Gaming', ['a']);
    const p = await makeProfile('On', ['Gaming']);
    const res = await api('patch', `/packs/${pack.id}`).send({ words: ['x', 'X'] }).expect(400);
    expect(res.body.error).toBe('duplicate_word');
    expect(await version(p.id)).toBe(1);
  });

  it('an empty patch changes nothing and bumps nothing', async () => {
    const pack = await create('Gaming', ['a']);
    const p = await makeProfile('On', ['Gaming']);
    await api('patch', `/packs/${pack.id}`).send({}).expect(200);
    expect(await version(p.id)).toBe(1);
  });
});

describe('DELETE /api/packs/:id', () => {
  it('204, removes the reference, bumps only those profiles', async () => {
    const pack = await create('Gaming', ['a']);
    const a = await makeProfile('A', ['Crypto', 'Gaming']);
    const b = await makeProfile('B', ['Crypto']);
    await api('delete', `/packs/${pack.id}`).expect(204);
    expect(await prismaOf(app).pack.count({ where: { id: pack.id } })).toBe(0);
    expect(await packsOf(a.id)).toEqual(['Crypto']);
    expect(await packsOf(b.id)).toEqual(['Crypto']);
    expect([await version(a.id), await version(b.id)]).toEqual([2, 1]);
    await api('delete', `/packs/${pack.id}`).expect(404);
  });

  it('403 built_in_pack and nothing changes', async () => {
    const builtIn = await prismaOf(app).pack.findUniqueOrThrow({ where: { name: 'Sports' } });
    const p = await makeProfile('A', ['Sports']);
    const res = await api('delete', `/packs/${builtIn.id}`).expect(403);
    expect(res.body.error).toBe('built_in_pack');
    expect(await prismaOf(app).pack.count({ where: { name: 'Sports' } })).toBe(1);
    expect(await packsOf(p.id)).toEqual(['Sports']);
    expect(await version(p.id)).toBe(1);
  });
});
