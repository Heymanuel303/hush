import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

// Shared by the popup specs: panel.html opened from disk (no extension host) with a
// `chrome.*` shim. It seeds storage.local and records what the popup wrote and sent.
export const POPUP_URL = pathToFileURL(resolve(__dirname, '../src/popup/panel.html')).href;

export type PopupSeed = Record<string, unknown>;

export const HUB = {
  url: 'http://hub.test',
  deviceId: 'd1',
  token: 't',
  profileName: 'Kid (shim)',
  hubName: 'Home hub',
  pairedAt: 1,
};
export const HUB_CONFIG = {
  version: 3,
  profileName: 'Kid (shim)',
  locked: false,
  blockWords: [],
  enabledPacks: [],
  packs: [],
  siteWords: {},
  siteOptions: {},
  quietHours: null,
  etag: '"x"',
};
export const HUB_CONFIG_LOCKED = { ...HUB_CONFIG, locked: true };
export const SYNCED = { lastSync: 1, lastAttempt: 1, error: null };

// The first case of the shared schedule fixture: a UTC Monday 09:00-17:00 window.
export const QUIET_WINDOW: unknown = (
  JSON.parse(readFileSync(resolve(__dirname, '../test/fixtures/schedule/cases.json'), 'utf8')) as {
    quietHours: unknown;
  }[]
)[0].quietHours;

export async function installPopupShim(
  page: Page,
  data: PopupSeed,
  opts: {
    os?: 'linux' | 'android';
    // What runtime.sendMessage answers; default { ok: true }.
    reply?: unknown;
    // 'hang' leaves permissions.request pending forever (the Connecting… state).
    permission?: 'grant' | 'hang';
    // ISO instant to freeze the page clock at (quiet-hours lines).
    now?: string;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ([seedJson, os, reply, permission, nowIso]) => {
      if (nowIso) {
        const fixed = new Date(nowIso as string).getTime();
        const RealDate = Date;
        // @ts-expect-error shim: a fixed clock
        window.Date = class extends RealDate {
          constructor(...a: unknown[]) {
            super(...(a.length ? (a as [number]) : [fixed]));
          }
          static now() {
            return fixed;
          }
        };
      }
      const store: Record<string, unknown> = {
        enabled: true,
        seenOnboarding: true,
        blockWords: [],
        ...JSON.parse(seedJson as string),
      };
      const w = window as any;
      w.__sets = [];
      w.__messages = [];
      w.__perm = [];
      w.__order = [];
      const pick = (keys?: string | string[] | null) => {
        const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
      };
      const noop = { addListener() {}, removeListener() {} };
      w.chrome = {
        storage: {
          local: {
            get: async (keys?: string | string[] | null) => pick(keys),
            set: async (obj: Record<string, unknown>) => {
              w.__sets.push(obj);
              Object.assign(store, obj);
            },
            remove: async () => {},
          },
          onChanged: noop,
        },
        runtime: {
          sendMessage: async (m: unknown) => {
            w.__messages.push(m);
            w.__order.push('message');
            return JSON.parse(reply as string);
          },
          getPlatformInfo: async () => ({ os }),
          onMessage: noop,
        },
        permissions: {
          request: () => {
            w.__perm.push(1);
            w.__order.push('permission');
            return permission === 'hang' ? new Promise(() => {}) : Promise.resolve(true);
          },
        },
        tabs: { query: async () => [], sendMessage: async () => ({}) },
      };
    },
    [
      JSON.stringify(data),
      opts.os ?? 'linux',
      JSON.stringify(opts.reply ?? { ok: true }),
      opts.permission ?? 'grant',
      opts.now ?? null,
    ] as const,
  );
}
