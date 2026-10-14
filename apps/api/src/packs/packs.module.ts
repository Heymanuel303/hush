import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfileVersionService } from '../profiles/profile-version.service.js';
import { PacksController } from './packs.controller.js';
import { PacksService } from './packs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PacksController],
  providers: [PacksService, ProfileVersionService],
})
export class PacksModule {}
