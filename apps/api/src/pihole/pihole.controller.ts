import { Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { PiholeConnectionPut } from 'contracts';
import type { PiholeConnection, PiholeSummary, PiholeTestResult } from 'contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody } from '../common/zod.pipe.js';
import { PiholeService } from './pihole.service.js';

@Controller('pihole')
@UseGuards(AdminGuard)
export class PiholeController {
  constructor(private readonly pihole: PiholeService) {}

  @Get()
  get(): Promise<PiholeConnection> {
    return this.pihole.get();
  }

  @Put()
  put(@ZodBody(PiholeConnectionPut) body: PiholeConnectionPut): Promise<PiholeConnection> {
    return this.pihole.put(body);
  }

  @Delete()
  @HttpCode(204)
  remove(): Promise<void> {
    return this.pihole.remove();
  }

  /** Checks the stored connection (the body, if any, is ignored: save first, then test). */
  @Post('test')
  @HttpCode(200)
  test(): Promise<PiholeTestResult> {
    return this.pihole.test();
  }

  @Get('summary')
  summary(): Promise<PiholeSummary> {
    return this.pihole.summary();
  }
}
