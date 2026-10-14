import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashToken } from './tokens.js';

export interface CurrentDeviceInfo {
  id: string;
  profileId: string;
}
export type DeviceRequest = Request & { device?: CurrentDeviceInfo };

/** Bearer-token guard for GET /api/device/config. One 401 `revoked` for missing, unknown and revoked tokens. */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<DeviceRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    const device = match
      ? await this.prisma.device.findUnique({
          where: { tokenHash: hashToken(match[1]!) },
          select: { id: true, profileId: true, revokedAt: true },
        })
      : null;
    if (!device || device.revokedAt) {
      throw new UnauthorizedException({
        error: 'revoked',
        message: 'This device is not paired with the hub (any more).',
      });
    }
    req.device = { id: device.id, profileId: device.profileId };
    return true;
  }
}
