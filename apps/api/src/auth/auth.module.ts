import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AuthController } from './auth.controller.js';
import { LoginRateLimiter } from './login-rate-limiter.js';

@Module({
  controllers: [AuthController],
  providers: [AdminService, AdminGuard, LoginRateLimiter],
  exports: [AdminService, AdminGuard],
})
export class AuthModule {}
