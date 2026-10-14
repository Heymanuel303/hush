import { Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PiholeConnectionPut } from 'contracts';
import type { PiholeConnection, PiholeSummary, PiholeTestResult } from 'contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody } from '../common/zod.pipe.js';
import { PiholeService } from './pihole.service.js';

const TestBody = z.union([PiholeConnectionPut, z.object({}).strict()]).optional();
type TestBody = z.infer<typeof TestBody>;

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

  /**
   * Checks the connection in the body (an omitted appPassword falls back to the stored one), so the
   * form can test before saving. An empty body checks the stored connection.
   */
  @Post('test')
  @HttpCode(200)
  test(@ZodBody(TestBody) body: TestBody): Promise<PiholeTestResult> {
    return this.pihole.test(PiholeConnectionPut.safeParse(body).data);
  }

  @Get('summary')
  summary(): Promise<PiholeSummary> {
    return this.pihole.summary();
  }
}
