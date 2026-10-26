/**
 * Sign-in test kit: the idp client's OIDC stub plus a helper that walks a real
 * login → stub → callback round trip against the app. Never the real idp.
 */
import type { INestApplication } from '@nestjs/common';
import { startOidcStub } from '@heymanuel303/idp-client/testkit';
import type { OidcStub } from '@heymanuel303/idp-client/testkit';
import request from 'supertest';

export const PUBLIC_URL = 'http://localhost:5173';
export const CLIENT_ID = 'hush';
export const CLIENT_SECRET = 'test-client-secret';
export const ADMIN_EMAIL = 'parent@example.test';

export function startStub(): Promise<OidcStub> {
  return startOidcStub({
    port: 0,
    clients: [
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUris: [`${PUBLIC_URL}/api/auth/sso/callback`],
        postLogoutUris: [`${PUBLIC_URL}/signin`],
        backchannelLogoutUri: `${PUBLIC_URL}/api/auth/sso/backchannel-logout`,
      },
    ],
  });
}

/** The environment of an app that signs in through `stub`. */
export function ssoEnv(stub: OidcStub, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ADMIN_EMAIL,
    SESSION_SECRET: 'test-session-secret',
    COOKIE_SECURE: 'false',
    ISSUER_URL: stub.issuer,
    CLIENT_ID,
    CLIENT_SECRET,
    PUBLIC_URL,
    ...extra,
  };
}

const cookiePair = (res: { headers: Record<string, unknown> }, name: string): string | undefined =>
  ((res.headers['set-cookie'] ?? []) as string[]).map((c) => c.split(';')[0]!).find((c) => c.startsWith(`${name}=`));

/**
 * Signs `email` in through the stub: app login → stub authorize → stub login → authorize →
 * app callback. Resolves the callback response and the `hush_session=…` pair, when one was set.
 */
export async function signInThroughStub(
  app: INestApplication,
  stub: OidcStub,
  email = ADMIN_EMAIL,
): Promise<{ callback: request.Response; cookie: string | undefined; location: string }> {
  const server = request(app.getHttpServer());
  const start = await server.get('/api/auth/sso/login').expect(302);
  const loginCookie = cookiePair(start, 'hush_sso_login')!;
  const authorize = start.headers['location'] as string;

  const first = await fetch(authorize, { redirect: 'manual' });
  const form = new URLSearchParams({ email, return: new URL(first.headers.get('location')!, stub.issuer).pathname + new URL(first.headers.get('location')!, stub.issuer).search });
  const login = await fetch(new URL('/login', stub.issuer), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const stubSession = login.headers.get('set-cookie')!.split(';')[0]!;
  const approved = await fetch(authorize, { redirect: 'manual', headers: { cookie: stubSession } });
  const back = new URL(approved.headers.get('location')!);

  const callback = await server
    .get(`${back.pathname}${back.search}`)
    .set('Cookie', loginCookie);
  return {
    callback,
    cookie: cookiePair(callback, 'hush_session'),
    location: (callback.headers['location'] as string | undefined) ?? '',
  };
}

/** Signs the admin in and returns the `hush_session=…` cookie pair; throws when it was refused. */
export async function adminCookie(app: INestApplication, stub: OidcStub, email = ADMIN_EMAIL): Promise<string> {
  const { cookie, location } = await signInThroughStub(app, stub, email);
  if (!cookie) throw new Error(`sign-in through the stub was refused: ${location}`);
  return cookie;
}
