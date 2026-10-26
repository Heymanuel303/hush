import { Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { OidcService } from '@heymanuel303/idp-client';
import type { AdminInfo, HubStatus, LogoutResponse, SetupStatus } from 'contracts';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard, CurrentAdmin } from './admin.guard.js';
import type { CurrentAdminInfo } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { PrismaSessionStore } from './sso/prisma-session.store.js';
import { SESSION_COOKIE, readCookie } from './session.js';

@Controller()
export class AuthController {
  constructor(
    private readonly admins: AdminService,
    private readonly prisma: PrismaService,
    private readonly sessions: PrismaSessionStore,
    private readonly oidc: OidcService,
  ) {}

  /** Ends the local session first, then hands back the idp end-session URL for the browser to visit. */
  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponse> {
    const id = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (id) await this.sessions.end(id);
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
    return { location: await this.oidc.endSessionUrl() };
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
