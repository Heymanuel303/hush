import { BadRequestException, BadGatewayException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { PiholeConnection, PiholeConnectionPut, PiholeSummary, PiholeTestResult } from 'contracts';
import { SecretsService } from '../common/secrets.service.js';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PiholeClient, PiholeError } from './pihole-client.js';

/** Summary cache lifetime, per replica (in memory). */
export const SUMMARY_TTL_MS = 30_000;
const TOP_CLIENTS = 50;

type Row = {
  url: string;
  secretEnc: string;
  kidGroupName: string;
  lastCheckedAt: Date | null;
  lastError: string | null;
};

const toConnection = (r: Row): PiholeConnection => ({
  url: r.url,
  kidGroupName: r.kidGroupName,
  hasSecret: r.secretEnc.length > 0,
  lastCheckedAt: r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null,
  lastError: r.lastError,
});

/** Origin plus an optional path prefix, no trailing slash, no query or fragment. */
export function normalizeUrl(input: string): string {
  const u = new URL(input);
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

@Injectable()
export class PiholeService implements OnApplicationShutdown {
  private client: { key: string; client: PiholeClient } | null = null;
  private cache: { at: number; value: PiholeSummary } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get(): Promise<PiholeConnection> {
    return toConnection(await this.row());
  }

  async put(input: PiholeConnectionPut): Promise<PiholeConnection> {
    const existing = await this.prisma.piholeConnection.findUnique({ where: { id: 1 } });
    if (!input.appPassword && !existing) {
      throw new BadRequestException({
        error: 'secret_required',
        message: 'An app password is required for the first connection.',
      });
    }
    const url = normalizeUrl(input.url);
    const secretEnc = input.appPassword ? this.secrets.encrypt(input.appPassword) : existing!.secretEnc;
    const data = { url, secretEnc, kidGroupName: input.kidGroupName, lastCheckedAt: null, lastError: null };
    const row = await this.prisma.piholeConnection.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await this.drop();
    return toConnection(row);
  }

  async remove(): Promise<void> {
    await this.prisma.piholeConnection.deleteMany({ where: { id: 1 } });
    await this.drop();
  }

  /** With `input` that differs from the saved connection, checks those values with a throwaway client and records nothing. */
  async test(input?: PiholeConnectionPut): Promise<PiholeTestResult> {
    const stored = input ? await this.prisma.piholeConnection.findUnique({ where: { id: 1 } }) : null;
    // The body describes the saved connection (same address and group, no new password): that is a
    // check of the stored connection, so its outcome is recorded for the status card.
    const sameAsStored =
      !!input &&
      !!stored &&
      !input.appPassword &&
      normalizeUrl(input.url) === stored.url &&
      input.kidGroupName === stored.kidGroupName;
    if (input && !sameAsStored) return this.testUnsaved(input, stored);
    const row = await this.row();
    try {
      const client = this.clientFor(row);
      const version = await client.version();
      const groups = await client.groups();
      await this.record(null);
      return { ok: true, version, groups };
    } catch (e) {
      const message = errorMessage(e);
      await this.record(message);
      return { ok: false, error: message };
    }
  }

  private async testUnsaved(input: PiholeConnectionPut, existing: Row | null): Promise<PiholeTestResult> {
    const url = normalizeUrl(input.url);
    // The stored password is only ever sent to the stored address.
    const secretEnc = input.appPassword || existing?.url !== url ? null : existing.secretEnc;
    if (!input.appPassword && !secretEnc) return { ok: false, error: 'An app password is required.' };
    const client = new PiholeClient({
      url,
      password: input.appPassword ?? this.secrets.decrypt(secretEnc!),
      tlsInsecure: this.config.piholeTlsInsecure,
    });
    try {
      const version = await client.version();
      const groups = await client.groups();
      return { ok: true, version, groups };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    } finally {
      await client.close();
    }
  }

  async summary(): Promise<PiholeSummary> {
    const row = await this.row();
    if (this.cache && Date.now() - this.cache.at < SUMMARY_TTL_MS) return this.cache.value;
    try {
      const client = this.clientFor(row);
      const [stats, top] = await Promise.all([client.summary(), client.topClientsBlocked(TOP_CLIENTS)]);
      const value: PiholeSummary = {
        queries: {
          total: stats.queries.total,
          blocked: stats.queries.blocked,
          percentBlocked: stats.queries.percent_blocked,
        },
        topClients: top.map((c) => ({ ip: c.ip, name: c.name || null, blocked: c.count })),
      };
      this.cache = { at: Date.now(), value };
      return value;
    } catch (e) {
      throw new BadGatewayException({
        error: e instanceof PiholeError && e.code === 'pihole_no_seats' ? 'pihole_no_seats' : 'pihole_unreachable',
        message: errorMessage(e),
      });
    }
  }

  /**
   * The shared, authenticated client for the stored connection (kid mode uses it too). One per
   * process, so one Pi-hole session; rebuilt (old session logged out) when the connection changes.
   */
  async getClient(): Promise<{ client: PiholeClient; kidGroupName: string }> {
    const row = await this.row();
    return { client: this.clientFor(row), kidGroupName: row.kidGroupName };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drop();
  }

  private async row(): Promise<Row> {
    const row = await this.prisma.piholeConnection.findUnique({ where: { id: 1 } });
    if (!row) {
      throw new NotFoundException({ error: 'not_configured', message: 'No Pi-hole connection is configured.' });
    }
    return row;
  }

  private clientFor(row: Row): PiholeClient {
    const key = `${row.url}\n${row.secretEnc}`;
    if (this.client?.key !== key) {
      const old = this.client?.client;
      void old?.close();
      this.cache = null;
      this.client = {
        key,
        client: new PiholeClient({
          url: row.url,
          password: this.secrets.decrypt(row.secretEnc),
          tlsInsecure: this.config.piholeTlsInsecure,
        }),
      };
    }
    return this.client.client;
  }

  private async drop(): Promise<void> {
    const old = this.client?.client;
    this.client = null;
    this.cache = null;
    await old?.close();
  }

  private async record(error: string | null): Promise<void> {
    await this.prisma.piholeConnection.updateMany({
      where: { id: 1 },
      data: { lastCheckedAt: new Date(), lastError: error },
    });
  }
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Pi-hole check failed.');
