import { Module } from '@nestjs/common';
import { OidcService } from '@heymanuel303/idp-client';
import { IdpClientModule, SESSION_STORE, USER_LINKER } from '@heymanuel303/idp-client/nest';
import { APP_CONFIG } from '../../config/config.js';
import type { AppConfig } from '../../config/config.js';
import { AdminLinker } from './admin-linker.service.js';
import { PrismaSessionStore } from './prisma-session.store.js';

/** The sign-in routes live at /api/auth/sso/{login,callback,logout,backchannel-logout}. */
export const SSO_ROUTE_PREFIX = '/auth/sso';

@Module({
  providers: [
    {
      // The adapter keeps its own OidcService private, so POST /api/auth/logout builds the
      // end-session URL from the core (same issuer, same registered post-logout URI).
      provide: OidcService,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new OidcService({
          issuerUrl: config.issuerUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: `${config.publicUrl}/api${SSO_ROUTE_PREFIX}/callback`,
          postLogoutRedirectUri: `${config.publicUrl}/signin`,
          requireHttpsIssuer: config.production,
        }),
    },
  ],
  imports: [
    IdpClientModule.forRootAsync({
      routePrefix: SSO_ROUTE_PREFIX,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        issuerUrl: config.issuerUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        publicUrl: config.publicUrl,
        secret: config.sessionSecret,
        // The global prefix `/api` is not known to the module, so the callback is explicit.
        redirectUri: `${config.publicUrl}/api${SSO_ROUTE_PREFIX}/callback`,
        postLogoutRedirectUri: `${config.publicUrl}/signin`,
        sessionCookie: 'hush_session',
        loginCookie: 'hush_sso_login',
        loginCookieLabel: 'hush/sso-login',
        refreshTokenLabel: 'hush/refresh-token',
        errorPath: '/signin',
        requireHttpsIssuer: config.production,
      }),
      providers: [
        { provide: SESSION_STORE, useClass: PrismaSessionStore },
        { provide: USER_LINKER, useClass: AdminLinker },
      ],
    }),
  ],
  // AdminGuard delegates to the adapter's IdpAuthGuard (find, refresh when due, 401).
  exports: [IdpClientModule, OidcService],
})
export class SsoModule {}
