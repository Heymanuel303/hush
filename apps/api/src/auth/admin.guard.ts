import { UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { IdpAuthGuard } from '@heymanuel303/idp-client/nest';
import type { Request } from 'express';
import { AdminService } from './admin.service.js';

export interface CurrentAdminInfo {
  id: string;
  email: string;
}
type AdminRequest = Request & { admin?: CurrentAdminInfo; user?: { sub: string } };

/**
 * Protects a controller or route: `@UseGuards(AdminGuard)`. The `hush_session` cookie carries an
 * `AdminSession` id; the idp client's guard finds the unexpired session (and refreshes it when due,
 * which is how an ended idp session is noticed) and the Admin that owns it is attached.
 * 401 `unauthenticated` otherwise.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly idp: IdpAuthGuard,
    private readonly admins: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const admin = (await this.idp.canActivate(context).catch(() => false))
      ? await this.admins.findByIdpSub(req.user!.sub)
      : null;
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
