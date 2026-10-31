import { mkdirSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

export const ADMIN_STATE = 'e2e/.auth/admin.json';

// Specs that only need a signed-in admin reuse this one session
// (`test.use({ storageState: ADMIN_STATE })`). It signs in through the oidc-stub test kit
// (playwright.config.ts starts it first), never a real idp: the app's login route, the stub's
// login form, then the callback, which sets the `hush_session` cookie.
const ADMIN_EMAIL = 'admin@hush.local'; // the api's development ADMIN_EMAIL

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  const api = await request.newContext({ baseURL });
  for (let attempt = 0; attempt < 60; attempt++) {
    const health = await api.get('/api/health').catch(() => null);
    if (health?.ok()) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  // Follows the redirect to the stub, which answers its login form (a 200 page).
  const start = await api.get('/api/auth/sso/login');
  const returnTo = new URL(start.url()).searchParams.get('return');
  if (!start.ok() || !returnTo)
    throw new Error(`global setup: the stub login page answered ${start.status()}`);
  // The stub signs the user in, then the redirects end at the app's callback and on to `/`.
  const signedIn = await api.post(new URL('/login', start.url()).href, {
    form: { email: ADMIN_EMAIL, return: returnTo },
  });
  if (!signedIn.ok()) throw new Error(`global setup: sign-in answered ${signedIn.status()}`);
  const me = await api.get('/api/auth/me');
  if (!me.ok()) throw new Error(`global setup: no admin session after sign-in (${me.status()})`);
  mkdirSync('e2e/.auth', { recursive: true });
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
}
