import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { PacksModule } from './packs/packs.module.js';
import { PacksSeedModule } from './packs/packs-seed.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, PacksSeedModule, PacksModule, HealthModule],
})
export class AppModule {}
