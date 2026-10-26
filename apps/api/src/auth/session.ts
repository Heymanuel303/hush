/** The cookie that carries the `AdminSession` id (set by the idp client's callback). */
export const SESSION_COOKIE = 'hush_session';

/** Value of one cookie from a Cookie header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
