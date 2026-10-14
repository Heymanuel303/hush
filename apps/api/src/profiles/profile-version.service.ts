import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * The one implementation of "Profile.version bumps in the same transaction as every RuleSet
 * write": callers pass their transaction client, so the write and the bump commit together.
 */
@Injectable()
export class ProfileVersionService {
  /** Bumps the version of each listed profile by exactly one. Returns how many it bumped. */
  async bump(tx: Prisma.TransactionClient, profileIds: string[]): Promise<number> {
    if (profileIds.length === 0) return 0;
    const { count } = await tx.profile.updateMany({
      where: { id: { in: profileIds } },
      data: { version: { increment: 1 } },
    });
    return count;
  }

  /** Bumps every profile whose rule set enables the pack `name`. */
  async bumpForPack(tx: Prisma.TransactionClient, name: string): Promise<string[]> {
    const rows = await tx.ruleSet.findMany({
      where: { enabledPacks: { has: name } },
      select: { profileId: true },
    });
    const ids = rows.map((r) => r.profileId);
    await this.bump(tx, ids);
    return ids;
  }
}
