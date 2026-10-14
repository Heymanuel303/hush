import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { DevicePatch, IdParam, PairRequest } from 'contracts';
import type { Device, DeviceConfig, PairResponse, PairingCode } from 'contracts';
import type { Request, Response } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody, ZodPipe } from '../common/zod.pipe.js';
import { DeviceConfigService } from './device-config.service.js';
import { DeviceGuard } from './device.guard.js';
import type { DeviceRequest } from './device.guard.js';
import { DevicesService, tooManyAttempts } from './devices.service.js';
import { PairRateLimiter } from './rate-limiter.js';

@Controller('profiles/:id/pairing-codes')
@UseGuards(AdminGuard)
export class PairingCodesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  create(@Param(new ZodPipe(IdParam)) params: IdParam): Promise<PairingCode> {
    return this.devices.createCode(params.id);
  }
}

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly limiter: PairRateLimiter,
  ) {}

  /** Public. Every attempt counts toward the per-IP limit, valid or not. */
  @Post('pair')
  pair(@Req() req: Request, @Body() raw: unknown): Promise<PairResponse> {
    if (!this.limiter.allow(req.ip ?? 'unknown')) throw tooManyAttempts();
    // Hand-typed codes may be lowercase; the contract's alphabet is uppercase.
    const body =
      typeof raw === 'object' && raw !== null && typeof (raw as { code?: unknown }).code === 'string'
        ? { ...raw, code: (raw as { code: string }).code.trim().toUpperCase() }
        : raw;
    return this.devices.pair(new ZodPipe(PairRequest).transform(body));
  }

  @Get()
  @UseGuards(AdminGuard)
  list(): Promise<Device[]> {
    return this.devices.list();
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  patch(@Param(new ZodPipe(IdParam)) params: IdParam, @ZodBody(DevicePatch) body: DevicePatch): Promise<Device> {
    return this.devices.patch(params.id, body);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  revoke(@Param(new ZodPipe(IdParam)) params: IdParam): Promise<void> {
    return this.devices.revoke(params.id);
  }
}

@Controller('device/config')
@UseGuards(DeviceGuard)
export class DeviceConfigController {
  constructor(
    private readonly configs: DeviceConfigService,
    private readonly devices: DevicesService,
  ) {}

  @Get()
  async get(@Req() req: DeviceRequest, @Res({ passthrough: true }) res: Response): Promise<DeviceConfig | undefined> {
    const device = req.device!;
    const { etag, config } = await this.configs.forProfile(device.profileId);
    await this.devices.touch(device.id);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    const sent = (req.headers['if-none-match'] ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
    if (sent.includes(etag)) {
      res.status(304);
      return undefined;
    }
    return config;
  }
}
