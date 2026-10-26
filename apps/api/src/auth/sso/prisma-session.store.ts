import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NewSession, SessionStore, StoredSession } from '@heymanuel303/idp-client';
import { PrismaService } from '../../prisma/prisma.service.js';

export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The idp client's session port over `AdminSession`. The stored sub is the owning Admin's `idpSub`. */
@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewSession): Promise<StoredSession> {
    // The linker stored the sub on the Admin row before the session is created.
    const admin = await this.prisma.admin.findUnique({ where: { idpSub: input.sub }, select: { id: true } });
    if (!admin) throw new Error('No admin is linked to this idp subject.');
    const row = await this.prisma.adminSession.create({
      data: {
        id: randomBytes(32).toString('base64url'),
        adminId: admin.id,
        idpSid: input.idpSid,
        refreshTokenSealed: input.refreshTokenSealed,
        accessExpiresAt: input.accessExpiresAt,
        expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
      },
    });
    return { ...toStored(row), sub: input.sub };
  }

  async find(id: string): Promise<StoredSession | null> {
    const row = await this.prisma.adminSession.findFirst({
      where: { id, expiresAt: { gt: new Date() }, admin: { idpSub: { not: null } } },
      include: { admin: { select: { idpSub: true } } },
    });
    if (!row?.admin.idpSub) return null;
    return { ...toStored(row), sub: row.admin.idpSub };
  }

  async lockRefresh(id: string, now: Date, lockMs: number): Promise<boolean> {
    // One conditional UPDATE: only the caller that sees an expired access token and no live lock wins.
    const { count } = await this.prisma.adminSession.updateMany({
      where: {
        id,
        expiresAt: { gt: now },
        accessExpiresAt: { lte: now },
        OR: [{ refreshLockedUntil: null }, { refreshLockedUntil: { lte: now } }],
      },
      data: { refreshLockedUntil: new Date(now.getTime() + lockMs) },
    });
    return count === 1;
  }

  async completeRefresh(id: string, update: { refreshTokenSealed: string; accessExpiresAt: Date }): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id },
      data: { ...update, refreshLockedUntil: null },
    });
  }

  async end(id: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { id } });
  }

  async endByIdpSid(sid: string): Promise<number> {
    return (await this.prisma.adminSession.deleteMany({ where: { idpSid: sid } })).count;
  }

  async endAllForSub(sub: string): Promise<number> {
    return (await this.prisma.adminSession.deleteMany({ where: { admin: { idpSub: sub } } })).count;
  }
}

function toStored(row: {
  id: string;
  idpSid: string | null;
  accessExpiresAt: Date | null;
  refreshTokenSealed: string | null;
}): Omit<StoredSession, 'sub'> {
  return {
    id: row.id,
    idpSid: row.idpSid,
    accessExpiresAt: row.accessExpiresAt,
    refreshTokenSealed: row.refreshTokenSealed,
  };
}
