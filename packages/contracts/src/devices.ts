import { z } from 'zod';
import { Name } from './common.js';
import { QuietHours } from './schedule.js';

const Instant = z.iso.datetime({ offset: true });

/** Six characters from an alphabet without 0, O, 1, I. */
export const PairingCode = z.object({
  code: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  profileId: z.uuid(),
  expiresAt: Instant,
});
export type PairingCode = z.infer<typeof PairingCode>;

export const BROWSERS = ['firefox', 'chrome', 'other'] as const;
export const Browser = z.enum(BROWSERS);

export const PairRequest = z.object({
  code: PairingCode.shape.code,
  label: Name,
  browser: Browser.optional(),
});
export type PairRequest = z.infer<typeof PairRequest>;

/** 201. Errors: 404 `unknown_code`; 410 `code_expired` | `code_used`. */
export const PairResponse = z.object({
  deviceId: z.uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  profileName: z.string(),
  hubName: z.string(),
});
export type PairResponse = z.infer<typeof PairResponse>;

export const KidMode = z.object({
  enabled: z.boolean(),
  schedule: QuietHours.nullable(),
  state: z.enum(['default', 'kid', 'unknown', 'error']),
  lastAppliedAt: Instant.optional(),
  lastError: z.string().optional(),
});
export type KidMode = z.infer<typeof KidMode>;

const IpAddress = z.union([z.ipv4(), z.ipv6()]);

export const Device = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  label: Name,
  browser: Browser.optional(),
  pairedAt: Instant,
  lastSeenAt: Instant.nullable().optional(),
  revokedAt: Instant.nullable().optional(),
  tailscaleIp: IpAddress.nullable().optional(),
  kidMode: KidMode,
});
export type Device = z.infer<typeof Device>;

export const DevicePatch = z.object({
  label: Name.optional(),
  profileId: z.uuid().optional(),
  tailscaleIp: IpAddress.nullable().optional(),
});
export type DevicePatch = z.infer<typeof DevicePatch>;

export const KidModePut = z.object({
  enabled: z.boolean(),
  schedule: QuietHours.nullable(),
});
export type KidModePut = z.infer<typeof KidModePut>;
