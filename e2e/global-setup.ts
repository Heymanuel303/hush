import { mkdirSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

export const ADMIN_STATE = 'e2e/.auth/admin.json';

// The login route allows 10 attempts a minute per client, and every spec file that signs in
// itself spends some of them. Specs that only need a signed-in admin reuse this one session
// (`test.use({ storageState: ADMIN_STATE })`) instead of logging in again.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  const api = await request.newContext({ baseURL });
  for (let attempt = 0; attempt < 60; attempt++) {
    const health = await api.get('/api/health').catch(() => null);
    if (health?.ok()) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const login = await api.post('/api/auth/login', {
    data: { email: 'admin@hush.local', password: 'hush-dev-password' },
  });
  if (!login.ok()) throw new Error(`global setup: sign-in answered ${login.status()}`);
  mkdirSync('e2e/.auth', { recursive: true });
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
}
