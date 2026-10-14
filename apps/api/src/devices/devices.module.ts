import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DeviceConfigService } from './device-config.service.js';
import { DeviceGuard } from './device.guard.js';
import { DeviceConfigController, DevicesController, PairingCodesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';
import { PairRateLimiter } from './rate-limiter.js';

@Module({
  imports: [AuthModule],
  controllers: [PairingCodesController, DevicesController, DeviceConfigController],
  providers: [DevicesService, DeviceConfigService, DeviceGuard, PairRateLimiter],
})
export class DevicesModule {}
