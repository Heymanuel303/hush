import { Injectable } from '@nestjs/common';
import { LinkError } from '@heymanuel303/idp-client/nest';
import type { IdpClaims, UserLinker } from '@heymanuel303/idp-client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface LinkedAdmin {
  id: string;
  email: string;
}

/** Links an idp identity to the single Admin row. It never creates an Admin. */
@Injectable()
export class AdminLinker implements UserLinker<LinkedAdmin> {
  constructor(private readonly prisma: PrismaService) {}

  async linkOrCreate(claims: IdpClaims): Promise<LinkedAdmin> {
    const bySub = await this.prisma.admin.findUnique({
      where: { idpSub: claims.sub },
      select: { id: true, email: true },
    });
    if (bySub) return bySub;

    if (!claims.emailVerified || !claims.email) throw new LinkError('not_an_admin', 403);
    const admin = await this.prisma.admin.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!admin || admin.idpSub !== null || admin.email.toLowerCase() !== claims.email.toLowerCase()) {
      throw new LinkError('not_an_admin', 403);
    }
    // Conditional on idpSub still being null, so two first sign-ins cannot both claim the row.
    const { count } = await this.prisma.admin.updateMany({
      where: { id: admin.id, idpSub: null },
      data: { idpSub: claims.sub },
    });
    if (count !== 1) throw new LinkError('not_an_admin', 403);
    return { id: admin.id, email: admin.email };
  }
}
