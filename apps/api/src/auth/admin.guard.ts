import { UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { AdminService } from './admin.service.js';
import { SESSION_COOKIE, readCookie, verifySession } from './session.js';

export interface CurrentAdminInfo {
  id: string;
  email: string;
}
type AdminRequest = Request & { admin?: CurrentAdminInfo };

/** Protects a controller or route: `@UseGuards(AdminGuard)`. 401 `unauthenticated` otherwise. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly admins: AdminService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = token ? verifySession(token, this.config.sessionSecret) : null;
    const admin = session ? await this.admins.findById(session.sub) : null;
    if (!admin) {
      throw new UnauthorizedException({
        error: 'unauthenticated',
        message: 'Sign in to continue.',
      });
    }
    req.admin = admin;
    return true;
  }
}

/** `@CurrentAdmin() admin: CurrentAdminInfo` inside a guarded route. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentAdminInfo =>
    context.switchToHttp().getRequest<AdminRequest>().admin!,
);
