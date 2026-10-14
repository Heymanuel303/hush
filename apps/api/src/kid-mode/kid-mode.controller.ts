import { Controller, Param, Put, UseGuards } from '@nestjs/common';
import { IdParam, KidModePut } from 'contracts';
import type { Device } from 'contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody, ZodPipe } from '../common/zod.pipe.js';
import { KidModeService } from './kid-mode.service.js';

@Controller('devices')
@UseGuards(AdminGuard)
export class KidModeController {
  constructor(private readonly kidMode: KidModeService) {}

  @Put(':id/kid-mode')
  put(@Param(new ZodPipe(IdParam)) params: IdParam, @ZodBody(KidModePut) body: KidModePut): Promise<Device> {
    return this.kidMode.put(params.id, body);
  }
}
