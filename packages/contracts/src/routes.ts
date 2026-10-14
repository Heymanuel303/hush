import { z } from 'zod';
import { AdminInfo, HubStatus, LoginRequest, SetupStatus } from './auth.js';
import { ErrorBody } from './common.js';
import { DeviceConfig } from './device-config.js';
import {
  Device,
  DevicePatch,
  KidModePut,
  PairRequest,
  PairResponse,
  PairingCode,
} from './devices.js';
import { Pack, PackCreate, PackUpdate } from './packs.js';
import {
  PiholeConnection,
  PiholeConnectionPut,
  PiholeSummary,
  PiholeTestResult,
} from './pihole.js';
import {
  ProfileCreate,
  ProfilePatch,
  ProfileWithRules,
  RuleSetPut,
  Template,
} from './profiles.js';

export type RouteAuth = 'admin' | 'device' | 'public';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteSpec {
  method: Method;
  /** Path with `:param` placeholders, including the `/api` prefix. */
  path: string;
  /** `admin` = session cookie, `device` = bearer token, `public` = none. */
  auth: RouteAuth;
  /** Body schema; absent when the route takes no body. */
  request?: z.ZodType;
  /** Success body schema; absent for 204 and for bodies the route documents in `note`. */
  response?: z.ZodType;
  /** Success status code. */
  status: number;
  note?: string;
}


/**
 * Every route of the API. There is no stats or telemetry route; none may be added.
 * Every non-2xx response carries `ErrorBody` (`error`).
 */
export const ROUTES = {
  login: { method: 'POST', path: '/api/auth/login', auth: 'public', status: 200, request: LoginRequest, response: AdminInfo, note: '401 invalid_credentials' },
  logout: { method: 'POST', path: '/api/auth/logout', auth: 'admin', status: 204 },
  me: { method: 'GET', path: '/api/auth/me', auth: 'admin', status: 200, response: AdminInfo },
  setupStatus: { method: 'GET', path: '/api/setup/status', auth: 'public', status: 200, response: SetupStatus },
  hubStatus: { method: 'GET', path: '/api/hub/status', auth: 'admin', status: 200, response: HubStatus },

  listProfiles: { method: 'GET', path: '/api/profiles', auth: 'admin', status: 200, response: z.array(ProfileWithRules) },
  createProfile: { method: 'POST', path: '/api/profiles', auth: 'admin', status: 201, request: ProfileCreate, response: ProfileWithRules },
  getProfile: { method: 'GET', path: '/api/profiles/:id', auth: 'admin', status: 200, response: ProfileWithRules },
  patchProfile: { method: 'PATCH', path: '/api/profiles/:id', auth: 'admin', status: 200, request: ProfilePatch, response: ProfileWithRules },
  deleteProfile: { method: 'DELETE', path: '/api/profiles/:id', auth: 'admin', status: 204 },
  putRules: { method: 'PUT', path: '/api/profiles/:id/rules', auth: 'admin', status: 200, request: RuleSetPut, response: ProfileWithRules, note: 'If-Match: <version>; stale → 412 stale_version' },
  createPairingCode: { method: 'POST', path: '/api/profiles/:id/pairing-codes', auth: 'admin', status: 201, response: PairingCode },
  listTemplates: { method: 'GET', path: '/api/templates', auth: 'admin', status: 200, response: z.array(Template) },

  listPacks: { method: 'GET', path: '/api/packs', auth: 'admin', status: 200, response: z.array(Pack) },
  createPack: { method: 'POST', path: '/api/packs', auth: 'admin', status: 201, request: PackCreate, response: Pack },
  patchPack: { method: 'PATCH', path: '/api/packs/:id', auth: 'admin', status: 200, request: PackUpdate, response: Pack },
  deletePack: { method: 'DELETE', path: '/api/packs/:id', auth: 'admin', status: 204 },

  listDevices: { method: 'GET', path: '/api/devices', auth: 'admin', status: 200, response: z.array(Device) },
  patchDevice: { method: 'PATCH', path: '/api/devices/:id', auth: 'admin', status: 200, request: DevicePatch, response: Device },
  revokeDevice: { method: 'DELETE', path: '/api/devices/:id', auth: 'admin', status: 204, note: 'revokes the device' },
  putKidMode: { method: 'PUT', path: '/api/devices/:id/kid-mode', auth: 'admin', status: 200, request: KidModePut, response: Device },
  pairDevice: { method: 'POST', path: '/api/devices/pair', auth: 'public', status: 201, request: PairRequest, response: PairResponse, note: '404 unknown_code; 410 code_expired | code_used' },
  deviceConfig: { method: 'GET', path: '/api/device/config', auth: 'device', status: 200, response: DeviceConfig, note: 'ETag "<profileId>:<version>"; 304 on matching If-None-Match; 401 revoked' },

  getPihole: { method: 'GET', path: '/api/pihole', auth: 'admin', status: 200, response: PiholeConnection },
  putPihole: { method: 'PUT', path: '/api/pihole', auth: 'admin', status: 200, request: PiholeConnectionPut, response: PiholeConnection },
  deletePihole: { method: 'DELETE', path: '/api/pihole', auth: 'admin', status: 204 },
  testPihole: { method: 'POST', path: '/api/pihole/test', auth: 'admin', status: 200, request: PiholeConnectionPut, response: PiholeTestResult },
  piholeSummary: { method: 'GET', path: '/api/pihole/summary', auth: 'admin', status: 200, response: PiholeSummary },
} as const satisfies Record<string, RouteSpec>;

export type RouteName = keyof typeof ROUTES;
export const ERROR_RESPONSE = ErrorBody;
