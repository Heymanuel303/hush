import { GoneException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Device, DevicePatch, PairRequest, PairResponse, PairingCode } from 'contracts';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateCode, generateToken, hashToken } from './tokens.js';

export const CODE_TTL_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type DeviceRow = Awaited<ReturnType<PrismaService['device']['findUniqueOrThrow']>>;

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  profileId: r.profileId,
  label: r.label,
  ...(r.browser ? { browser: r.browser as Device['browser'] } : {}),
  pairedAt: r.pairedAt.toISOString(),
  lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
  revokedAt: r.revokedAt?.toISOString() ?? null,
  tailscaleIp: r.tailscaleIp,
  kidMode: {
    enabled: r.kidModeEnabled,
    schedule: r.kidModeSchedule as Device['kidMode']['schedule'],
    state: r.kidModeState as Device['kidMode']['state'],
    ...(r.kidModeLastAppliedAt ? { lastAppliedAt: r.kidModeLastAppliedAt.toISOString() } : {}),
    ...(r.kidModeLastError ? { lastError: r.kidModeLastError } : {}),
  },
});

const gone = (error: 'code_expired' | 'code_used', message: string) =>
  new GoneException({ error, message });
const noDevice = () => new NotFoundException({ error: 'not_found', message: 'No such device.' });

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createCode(profileId: string): Promise<PairingCode> {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
    if (!profile) throw new NotFoundException({ error: 'not_found', message: 'No such profile.' });
    const now = Date.now();
    const cutoff = new Date(now - DAY_MS);
    await this.prisma.pairingCode.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
    });
    const expiresAt = new Date(now + CODE_TTL_MS);
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await this.prisma.pairingCode.create({
          data: { code: generateCode(), profileId, expiresAt },
        });
        return { code: row.code, profileId, expiresAt: expiresAt.toISOString() };
      } catch (e) {
        if ((e as { code?: unknown }).code !== 'P2002' || attempt >= 5) throw e;
      }
    }
  }

  async pair(input: PairRequest): Promise<PairResponse> {
    const code = input.code.toUpperCase();
    const row = await this.prisma.pairingCode.findUnique({
      where: { code },
      include: { profile: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException({ error: 'unknown_code', message: 'That code is not known.' });
    if (row.consumedAt) throw gone('code_used', 'That code was already used.');
    if (row.expiresAt.getTime() <= Date.now()) throw gone('code_expired', 'That code has expired.');

    const token = generateToken();
    const deviceId = await this.prisma.$transaction(async (tx) => {
      // Conditional update: of two racing browsers exactly one sees count 1.
      const claimed = await tx.pairingCode.updateMany({
        where: { code, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) throw gone('code_used', 'That code was already used.');
      const device = await tx.device.create({
        data: {
          profileId: row.profileId,
          label: input.label,
          browser: input.browser ?? null,
          tokenHash: hashToken(token),
        },
      });
      return device.id;
    });
    return { deviceId, token, profileName: row.profile.name, hubName: this.config.hubName };
  }

  async list(): Promise<Device[]> {
    const rows = await this.prisma.device.findMany({ orderBy: { pairedAt: 'desc' } });
    return rows.map(toDevice);
  }

  async patch(id: string, input: DevicePatch): Promise<Device> {
    if (!(await this.prisma.device.findUnique({ where: { id }, select: { id: true } }))) throw noDevice();
    if (input.profileId) {
      const p = await this.prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } });
      if (!p) throw new UnprocessableEntityException({ error: 'unknown_profile', message: 'No such profile.' });
    }
    const row = await this.prisma.device.update({
      where: { id },
      data: { label: input.label, profileId: input.profileId, tailscaleIp: input.tailscaleIp },
    });
    return toDevice(row);
  }

  async revoke(id: string): Promise<void> {
    if (!(await this.prisma.device.findUnique({ where: { id }, select: { id: true } }))) throw noDevice();
    await this.prisma.device.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async touch(id: string): Promise<void> {
    await this.prisma.device.updateMany({ where: { id, revokedAt: null }, data: { lastSeenAt: new Date() } });
  }
}

export const tooManyAttempts = () =>
  new HttpException({ error: 'too_many_attempts', message: 'Too many attempts. Try again in a minute.' }, 429);
