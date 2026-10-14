import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { HealthModule } from './health/health.module.js';
import { KidModeModule } from './kid-mode/kid-mode.module.js';
import { PiholeModule } from './pihole/pihole.module.js';
import { PacksModule } from './packs/packs.module.js';
import { PacksSeedModule } from './packs/packs-seed.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, PacksSeedModule, PacksModule, ProfilesModule, DevicesModule, PiholeModule, KidModeModule, HealthModule],
})
export class AppModule {}
