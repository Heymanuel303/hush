import { Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IdParam, ProfileCreate, ProfilePatch, RuleSetPut } from 'contracts';
import type { ProfileWithRules, Template } from 'contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodBody, ZodPipe } from '../common/zod.pipe.js';
import { TEMPLATES } from '../templates/templates.js';
import { ProfilesService } from './profiles.service.js';

@Controller('templates')
@UseGuards(AdminGuard)
export class TemplatesController {
  @Get()
  list(): Template[] {
    return TEMPLATES;
  }
}

@Controller('profiles')
@UseGuards(AdminGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  list(): Promise<ProfileWithRules[]> {
    return this.profiles.list();
  }

  @Post()
  create(@ZodBody(ProfileCreate) body: ProfileCreate): Promise<ProfileWithRules> {
    return this.profiles.create(body);
  }

  @Get(':id')
  get(@Param(new ZodPipe(IdParam)) params: IdParam): Promise<ProfileWithRules> {
    return this.profiles.get(params.id);
  }

  @Patch(':id')
  patch(@Param(new ZodPipe(IdParam)) params: IdParam, @ZodBody(ProfilePatch) body: ProfilePatch): Promise<ProfileWithRules> {
    return this.profiles.patch(params.id, body);
  }

  @Put(':id/rules')
  putRules(
    @Param(new ZodPipe(IdParam)) params: IdParam,
    @Headers('if-match') ifMatch: string | undefined,
    @ZodBody(RuleSetPut) body: RuleSetPut,
  ): Promise<ProfileWithRules> {
    return this.profiles.putRules(params.id, ifMatch, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param(new ZodPipe(IdParam)) params: IdParam): Promise<void> {
    return this.profiles.remove(params.id);
  }
}
