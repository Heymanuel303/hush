import { z } from 'zod';

const DEV_ADMIN_EMAIL = 'admin@hush.local';
// Development defaults point at the idp test stub (`oidc-stub` on 127.0.0.1:3999, client `hush`).
const DEV_ISSUER_URL = 'http://127.0.0.1:3999';
const DEV_CLIENT_ID = 'hush';
const DEV_CLIENT_SECRET = 'hush-dev-client-secret';
const DEV_PUBLIC_URL = 'http://localhost:5173';
// 32 bytes, fixed, public: only ever used outside production (with a warning).
const DEV_ENCRYPTION_KEY = 'aHVzaC1kZXYtZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=';
const DEV_SESSION_SECRET = 'hush-dev-session-secret-not-for-production';

/** Empty strings (an unset `${VAR:-}` in compose) count as missing. */
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const Env = z.object({
  NODE_ENV: optional,
  ADMIN_EMAIL: optional.pipe(z.email().optional()),
  ISSUER_URL: optional.pipe(z.url().optional()),
  CLIENT_ID: optional,
  CLIENT_SECRET: optional,
  PUBLIC_URL: optional.pipe(z.url().optional()),
  HUB_NAME: optional,
  SESSION_SECRET: optional,
  COOKIE_SECURE: optional,
  HUB_ENCRYPTION_KEY: optional,
  PIHOLE_TLS_INSECURE: optional,
  WORKER_ENABLED: optional,
});

export interface AppConfig {
  production: boolean;
  adminEmail: string;
  /** The idp (Hey Id) issuer, client credentials and the origin the browser reaches the hub at. */
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  hubName: string;
  sessionSecret: string;
  cookieSecure: boolean;
  /** 32-byte AES-256-GCM key for secrets at rest. */
  encryptionKey: Buffer;
  /** Accept self-signed HTTPS certificates from Pi-hole (that client only). */
  piholeTlsInsecure: boolean;
  /** Run the kid-mode schedule loop in this process (the worker service only). */
  workerEnabled: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Reads and validates the environment once at boot. Production refuses to start without the
 * admin values and the session secret; elsewhere they default to development values (warned).
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = () => undefined,
): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${fields}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production) {
    const missing: string[] = (
      ['ADMIN_EMAIL', 'SESSION_SECRET', 'ISSUER_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'PUBLIC_URL'] as const
    ).filter((k) => !e[k]);
    if (!e.HUB_ENCRYPTION_KEY) missing.push('HUB_ENCRYPTION_KEY');
    if (missing.length > 0) {
      throw new Error(`Missing required environment in production: ${missing.join(', ')}`);
    }
  } else {
    const defaulted: string[] = (
      [
        'ADMIN_EMAIL',
        'SESSION_SECRET',
        'HUB_ENCRYPTION_KEY',
        'ISSUER_URL',
        'CLIENT_ID',
        'CLIENT_SECRET',
        'PUBLIC_URL',
      ] as const
    ).filter((k) => !e[k]);
    if (defaulted.length > 0) {
      warn(`${defaulted.join(', ')} not set: using development defaults. Do not use in production.`);
    }
  }
  const key = Buffer.from(e.HUB_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('Invalid environment: HUB_ENCRYPTION_KEY (must be 32 bytes, base64)');
  }
  return {
    production,
    adminEmail: e.ADMIN_EMAIL ?? DEV_ADMIN_EMAIL,
    issuerUrl: e.ISSUER_URL ?? DEV_ISSUER_URL,
    clientId: e.CLIENT_ID ?? DEV_CLIENT_ID,
    clientSecret: e.CLIENT_SECRET ?? DEV_CLIENT_SECRET,
    publicUrl: (e.PUBLIC_URL ?? DEV_PUBLIC_URL).replace(/\/+$/, ''),
    hubName: e.HUB_NAME ?? 'Hush Hub',
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    cookieSecure: e.COOKIE_SECURE === 'true',
    encryptionKey: key,
    piholeTlsInsecure: e.PIHOLE_TLS_INSECURE === 'true',
    workerEnabled: e.WORKER_ENABLED === 'true',
  };
}
