import { Injectable } from '@nestjs/common';
import { DeviceConfig } from 'contracts';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ConfigResult {
  etag: string;
  config: DeviceConfig;
}

export const etagOf = (profileId: string, version: number): string => `"${profileId}:${version}"`;

@Injectable()
export class DeviceConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Derives the device config of a profile; validated against the contract before it leaves. */
  async forProfile(profileId: string): Promise<ConfigResult> {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      include: { rules: true },
    });
    const rules = profile.rules;
    const names = rules?.enabledPacks ?? [];
    const rows = names.length
      ? await this.prisma.pack.findMany({ where: { name: { in: names } } })
      : [];
    const byName = new Map(rows.map((r) => [r.name, r]));
    const present = names.filter((n) => byName.has(n));
    const config = DeviceConfig.parse({
      version: profile.version,
      profileName: profile.name,
      locked: profile.locked,
      blockWords: rules?.blockWords ?? [],
      enabledPacks: present,
      packs: present.map((n) => ({ name: n, words: byName.get(n)!.words })),
      siteWords: rules?.siteWords ?? {},
      siteOptions: rules?.siteOptions ?? {},
      quietHours: rules?.quietHours ?? null,
    });
    return { etag: etagOf(profile.id, profile.version), config };
  }
}
