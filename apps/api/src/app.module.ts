import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { PacksSeedModule } from './packs/packs-seed.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, PacksSeedModule, HealthModule],
})
export class AppModule {}
