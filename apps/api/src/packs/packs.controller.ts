import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IdParam, PackCreate, PackUpdate } from 'contracts';
import type { Pack } from 'contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody, ZodPipe } from '../common/zod.pipe.js';
import { PacksService } from './packs.service.js';

@Controller('packs')
@UseGuards(AdminGuard)
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  @Get()
  list(): Promise<Pack[]> {
    return this.packs.list();
  }

  @Post()
  create(@ZodBody(PackCreate) body: PackCreate): Promise<Pack> {
    return this.packs.create(body);
  }

  @Patch(':id')
  update(@Param(new ZodPipe(IdParam)) params: IdParam, @ZodBody(PackUpdate) body: PackUpdate): Promise<Pack> {
    return this.packs.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param(new ZodPipe(IdParam)) params: IdParam): Promise<void> {
    return this.packs.remove(params.id);
  }
}
