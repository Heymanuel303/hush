import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AuthController } from './auth.controller.js';
import { AdminLinker } from './sso/admin-linker.service.js';
import { PrismaSessionStore } from './sso/prisma-session.store.js';
import { SsoModule } from './sso/sso.module.js';

@Module({
  imports: [SsoModule],
  controllers: [AuthController],
  providers: [AdminService, AdminGuard, AdminLinker, PrismaSessionStore],
  exports: [SsoModule, AdminService, AdminGuard, AdminLinker, PrismaSessionStore],
})
export class AuthModule {}
