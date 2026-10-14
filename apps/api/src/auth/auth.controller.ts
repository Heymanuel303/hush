import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LoginRequest } from 'contracts';
import type { AdminInfo, HubStatus, SetupStatus } from 'contracts';
import type { Request, Response } from 'express';
import { ZodBody } from '../common/zod.pipe.js';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard, CurrentAdmin } from './admin.guard.js';
import type { CurrentAdminInfo } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from './session.js';

/**
 * Client IP behind the web container's nginx. nginx appends the address it saw
 * (`$proxy_add_x_forwarded_for`), so only the last entry, written by that one trusted hop, is
 * believed; earlier entries are client-supplied.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const last = header?.split(',').pop()?.trim();
  return last || req.socket.remoteAddress || 'unknown';
}

@Controller()
export class AuthController {
  constructor(
    private readonly admins: AdminService,
    private readonly limiter: LoginRateLimiter,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @ZodBody(LoginRequest) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminInfo> {
    if (!this.limiter.allow(clientIp(req))) {
      throw new HttpException(
        { error: 'too_many_attempts', message: 'Too many sign-in attempts. Try again in a minute.' },
        429,
      );
    }
    const admin = await this.admins.authenticate(body.email, body.password);
    if (!admin) {
      throw new UnauthorizedException({
        error: 'invalid_credentials',
        message: 'The email or password is wrong.',
      });
    }
    res.cookie(SESSION_COOKIE, signSession(admin.id, this.config.sessionSecret), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.cookieSecure,
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return { email: admin.email };
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.cookieSecure,
    });
  }

  @Get('auth/me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: CurrentAdminInfo): AdminInfo {
    return { email: admin.email };
  }

  @Get('setup/status')
  async setupStatus(): Promise<SetupStatus> {
    return { adminConfigured: await this.admins.isConfigured() };
  }

  @Get('hub/status')
  @UseGuards(AdminGuard)
  async hubStatus(): Promise<HubStatus> {
    const [pihole, profileCount, deviceCount] = await Promise.all([
      this.prisma.piholeConnection.count(),
      this.prisma.profile.count(),
      this.prisma.device.count(),
    ]);
    return { piholeConnected: pihole > 0, profileCount, deviceCount };
  }
}
