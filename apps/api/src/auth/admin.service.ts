import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly log = new Logger(AdminService.name);
  // Verified against when the email is unknown, so a wrong email costs as much as a wrong password.
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Makes the single Admin row match the environment. */
  async onApplicationBootstrap(): Promise<void> {
    const { adminEmail, adminPassword } = this.config;
    const existing = await this.prisma.admin.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!existing) {
      try {
        await this.prisma.admin.create({
          data: { email: adminEmail, passwordHash: await hashPassword(adminPassword) },
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
    const data: { email?: string; passwordHash?: string } = {};
    if (existing.email !== adminEmail) data.email = adminEmail;
    if (!(await verifyPassword(adminPassword, existing.passwordHash))) {
      data.passwordHash = await hashPassword(adminPassword);
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.admin.update({ where: { id: existing.id }, data });
      this.log.log(`Admin account updated from the environment (${Object.keys(data).join(', ')}).`);
    }
  }

  /** The admin for these credentials, or null. Always runs one scrypt verification. */
  async authenticate(email: string, password: string): Promise<{ id: string; email: string } | null> {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    this.dummyHash ??= hashPassword('hush-dummy-password');
    const ok = await verifyPassword(password, admin?.passwordHash ?? (await this.dummyHash));
    return admin && ok ? { id: admin.id, email: admin.email } : null;
  }

  findById(id: string): Promise<{ id: string; email: string } | null> {
    return this.prisma.admin.findUnique({ where: { id }, select: { id: true, email: true } });
  }

  async isConfigured(): Promise<boolean> {
    return (await this.prisma.admin.count()) > 0;
  }
}
