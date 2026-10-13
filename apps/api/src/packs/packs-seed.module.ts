import { Module } from '@nestjs/common';
import { PacksSeed } from './packs.seed.js';

@Module({ providers: [PacksSeed] })
export class PacksSeedModule {}
