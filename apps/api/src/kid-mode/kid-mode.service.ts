import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Device, KidModePut } from 'contracts';
import { Prisma } from '../generated/prisma/client.js';
import { toDevice } from '../devices/devices.service.js';
import type { PiholeClient } from '../pihole/pihole-client.js';
import { PiholeService } from '../pihole/pihole.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type KidDesired = 'kid' | 'default';
type DeviceRow = Awaited<ReturnType<PrismaService['device']['findUniqueOrThrow']>>;
interface Resolved {
  client: PiholeClient;
  ip: string;
  groupId: number;
  defaultGroupId: number;
}

/** Pi-hole's Default group. */
const DEFAULT_GROUP = 0;

const conflict = (error: string, message: string, details?: unknown) =>
  new ConflictException({ error, message, ...(details === undefined ? {} : { details }) });

@Injectable()
export class KidModeService {
  private readonly log = new Logger(KidModeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pihole: PiholeService,
  ) {}

  /** Route handler: stores the switch and schedule, applies at once when there is no schedule. */
  async put(deviceId: string, input: KidModePut): Promise<Device> {
    const device = await this.active(deviceId);
    const data = { kidModeEnabled: input.enabled, kidModeSchedule: input.schedule ?? Prisma.DbNull };
    if (input.schedule) {
      // The worker owns the state while a schedule exists; `enabled` is ignored.
      return toDevice(await this.prisma.device.update({ where: { id: deviceId }, data }));
    }
    const desired: KidDesired = input.enabled ? 'kid' : 'default';
    const resolved = device.kidModeState === desired ? null : await this.resolve(device);
    await this.prisma.device.update({ where: { id: deviceId }, data });
    return toDevice(await this.apply(deviceId, desired, resolved));
  }

  /**
   * Moves the device's Tailscale IP into the Kid group (`kid`) or Default (`default`) and records
   * the outcome. Applying the state the device is already in makes no Pi-hole call.
   */
  async apply(deviceId: string, desired: KidDesired, resolved: Resolved | null = null): Promise<DeviceRow> {
    const device = await this.active(deviceId);
    if (device.kidModeState === desired) return device;
    const ctx = resolved ?? (await this.resolve(device));
    try {
      const existing = (await ctx.client.clients()).find((c) => c.client === ctx.ip);
      const groups = [desired === 'kid' ? ctx.groupId : ctx.defaultGroupId];
      if (existing) {
        await ctx.client.setClientGroups(ctx.ip, existing.comment ?? `Hush: ${device.label}`, groups);
      } else {
        await ctx.client.createClient(ctx.ip, `Hush: ${device.label}`, groups);
      }
    } catch (e) {
      throw await this.fail(deviceId, e);
    }
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { kidModeState: desired, kidModeLastAppliedAt: new Date(), kidModeLastError: null },
    });
  }

  /** Stores a failure the worker hit (any cause) on the device. */
  async recordFailure(deviceId: string, message: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { id: deviceId, revokedAt: null },
      data: { kidModeState: 'error', kidModeLastError: message },
    });
  }

  private async active(deviceId: string): Promise<DeviceRow> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) throw new NotFoundException({ error: 'not_found', message: 'No such device.' });
    return device;
  }

  /** Checks the preconditions and looks up the group ids; 409 for a setup problem, 502 for Pi-hole. */
  private async resolve(device: DeviceRow): Promise<Resolved> {
    let conn: Awaited<ReturnType<PiholeService['getClient']>>;
    try {
      conn = await this.pihole.getClient();
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw conflict('pihole_not_configured', 'Connect Pi-hole before using kid mode.');
      }
      throw e;
    }
    if (!device.tailscaleIp) {
      throw conflict('no_tailscale_ip', 'Set the device\'s Tailscale IP before using kid mode.');
    }
    let groups: { id: number; name: string }[];
    try {
      groups = await conn.client.groups();
    } catch (e) {
      throw await this.fail(device.id, e);
    }
    const kid = groups.find((g) => g.name === conn.kidGroupName);
    if (!kid) {
      throw conflict('kid_group_missing', `Pi-hole has no group named "${conn.kidGroupName}". Create it in Pi-hole first.`, {
        groups: groups.map((g) => g.name),
      });
    }
    return { client: conn.client, ip: device.tailscaleIp, groupId: kid.id, defaultGroupId: DEFAULT_GROUP };
  }

  private async fail(deviceId: string, e: unknown): Promise<BadGatewayException> {
    const message = e instanceof Error ? e.message : 'Pi-hole call failed.';
    this.log.warn(`Kid mode apply failed for ${deviceId}: ${message}`);
    await this.recordFailure(deviceId, message);
    return new BadGatewayException({ error: 'pihole_unreachable', message });
  }
}
