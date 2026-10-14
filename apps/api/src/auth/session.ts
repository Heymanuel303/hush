import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'hush_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

const sign = (data: string, secret: string): string =>
  createHmac('sha256', secret).update(data).digest('base64url');

/** base64url(JSON payload) + '.' + HMAC-SHA256 over it. Stateless: any replica validates it. */
export function signSession(sub: string, secret: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { sub, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** The payload of a genuine, unexpired token; otherwise null. Never throws. */
export function verifySession(token: string, secret: string, nowMs = Date.now()): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || typeof p.iat !== 'number') return null;
    if (p.exp * 1000 <= nowMs) return null;
    return p as SessionPayload;
  } catch {
    return null;
  }
}

/** Value of one cookie from a Cookie header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
