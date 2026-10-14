import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfileVersionService } from './profile-version.service.js';
import { ProfilesController, TemplatesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProfilesController, TemplatesController],
  providers: [ProfilesService, ProfileVersionService],
})
export class ProfilesModule {}
