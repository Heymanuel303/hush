import { Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { BUILT_IN_PACKS } from 'contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Upserts the built-in packs by their unique name, so repeated boots and replicas booting at
 * once converge. Household packs (builtIn false) are never touched.
 */
@Injectable()
export class PacksSeed implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const pack of BUILT_IN_PACKS) {
      const words = [...pack.words];
      await this.prisma.pack.upsert({
        where: { name: pack.name },
        create: { name: pack.name, words, builtIn: true },
        update: { words, builtIn: true },
      });
    }
  }
}
