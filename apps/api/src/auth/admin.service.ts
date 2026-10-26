import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly log = new Logger(AdminService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Makes the single Admin row match the environment. */
  async onApplicationBootstrap(): Promise<void> {
    const { adminEmail } = this.config;
    const existing = await this.prisma.admin.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!existing) {
      try {
        await this.prisma.admin.create({
          data: { email: adminEmail },
        });
        this.log.log('Admin account created from the environment.');
      } catch (error) {
        // The api and the worker start together on a fresh database: the other process created
        // the same row from the same environment between our read and our write.
        if ((error as { code?: string }).code !== 'P2002') throw error;
        this.log.log('Admin account created by another process from the same environment.');
      }
      return;
    }
    // The sub linked on first sign-in stays; only the email follows the environment.
    if (existing.email !== adminEmail) {
      await this.prisma.admin.update({ where: { id: existing.id }, data: { email: adminEmail } });
      this.log.log('Admin account updated from the environment (email).');
    }
  }

  findByIdpSub(sub: string): Promise<{ id: string; email: string } | null> {
    return this.prisma.admin.findUnique({ where: { idpSub: sub }, select: { id: true, email: true } });
  }

  async isConfigured(): Promise<boolean> {
    return (await this.prisma.admin.count()) > 0;
  }
}
