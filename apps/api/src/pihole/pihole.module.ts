import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SecretsService } from '../common/secrets.service.js';
import { PiholeController } from './pihole.controller.js';
import { PiholeService } from './pihole.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PiholeController],
  providers: [PiholeService, SecretsService],
  exports: [PiholeService, SecretsService],
})
export class PiholeModule {}
