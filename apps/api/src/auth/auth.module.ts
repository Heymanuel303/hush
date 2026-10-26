import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AuthController } from './auth.controller.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { AdminLinker } from './sso/admin-linker.service.js';
import { PrismaSessionStore } from './sso/prisma-session.store.js';

@Module({
  controllers: [AuthController],
  // AdminLinker and PrismaSessionStore are the idp client's ports; IdpClientModule is mounted later.
  providers: [AdminService, AdminGuard, LoginRateLimiter, AdminLinker, PrismaSessionStore],
  exports: [AdminService, AdminGuard, AdminLinker, PrismaSessionStore],
})
export class AuthModule {}
