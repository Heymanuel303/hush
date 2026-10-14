import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { QuietHours } from 'contracts';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KidModeService } from './kid-mode.service.js';
import type { KidDesired } from './kid-mode.service.js';
import { isInsideWindows } from './schedule.js';

export const TICK_MS = 60_000;

/** Injectable so tests can drive the schedule; replace `now` to move time. */
export const KID_MODE_CLOCK = Symbol('KID_MODE_CLOCK');
export interface KidModeClock {
  now(): Date;
}

/**
 * Applies kid-mode schedules. Runs only where `WORKER_ENABLED=true` (the worker service), so
 * scaled api replicas never touch Pi-hole on a timer.
 */
@Injectable()
export class KidModeWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(KidModeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kidMode: KidModeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(KID_MODE_CLOCK) private readonly clock: KidModeClock,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.workerEnabled) return;
    this.log.log('Kid-mode worker started.');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** One pass over scheduled devices. Never throws; a pass still running is joined, not doubled. */
  tick(): Promise<void> {
    this.running ??= this.pass().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pass(): Promise<void> {
    try {
      const now = this.clock.now();
      const devices = await this.prisma.device.findMany({
        where: { revokedAt: null, tailscaleIp: { not: null } },
      });
      for (const d of devices) {
        if (!d.kidModeSchedule) continue;
        const desired: KidDesired = isInsideWindows(d.kidModeSchedule as unknown as QuietHours, now) ? 'kid' : 'default';
        if (desired === d.kidModeState) continue;
        try {
          await this.kidMode.apply(d.id, desired);
        } catch (e) {
          const message = errorText(e);
          this.log.warn(`Kid mode ${d.id} -> ${desired} failed: ${message}`);
          await this.kidMode.recordFailure(d.id, message).catch(() => undefined);
        }
      }
    } catch (e) {
      this.log.error(`Kid mode pass failed: ${errorText(e)}`);
    }
  }
}

function errorText(e: unknown): string {
  const body = (e as { response?: { message?: unknown } }).response;
  if (typeof body?.message === 'string') return body.message;
  return e instanceof Error ? e.message : 'unknown error';
}
