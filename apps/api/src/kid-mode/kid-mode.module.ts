import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PiholeModule } from '../pihole/pihole.module.js';
import { KidModeController } from './kid-mode.controller.js';
import { KidModeService } from './kid-mode.service.js';
import { KID_MODE_CLOCK, KidModeWorker } from './kid-mode.worker.js';

@Module({
  imports: [AuthModule, PiholeModule],
  controllers: [KidModeController],
  providers: [KidModeService, KidModeWorker, { provide: KID_MODE_CLOCK, useValue: { now: () => new Date() } }],
})
export class KidModeModule {}
