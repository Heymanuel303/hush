import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BUILT_IN_PACKS } from 'contracts';
import type { Pack, PackCreate, PackUpdate } from 'contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileVersionService } from '../profiles/profile-version.service.js';

type PackRow = { id: string; name: string; words: string[]; builtIn: boolean };

const toPack = (row: PackRow): Pack => ({
  id: row.id,
  name: row.name,
  words: row.words,
  builtIn: row.builtIn,
});

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

const nameTaken = () =>
  new ConflictException({ error: 'name_taken', message: 'A pack with that name already exists.' });

function assertNoDuplicateWords(words: string[]): void {
  const seen = new Set<string>();
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException({
        error: 'duplicate_word',
        message: `The word "${w}" appears more than once in this pack.`,
      });
    }
    seen.add(key);
  }
}

@Injectable()
export class PacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: ProfileVersionService,
  ) {}

  /** Built-in packs in BUILT_IN_PACKS order, then household packs by name. */
  async list(): Promise<Pack[]> {
    const rows = await this.prisma.pack.findMany();
    const order = new Map(BUILT_IN_PACKS.map((p, i) => [p.name, i]));
    const builtIn = rows
      .filter((r) => r.builtIn)
      .sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
    const household = rows
      .filter((r) => !r.builtIn)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return [...builtIn, ...household].map(toPack);
  }

  async create(input: PackCreate): Promise<Pack> {
    assertNoDuplicateWords(input.words);
    if (await this.nameInUse(input.name)) throw nameTaken();
    try {
      const row = await this.prisma.pack.create({
        data: { name: input.name, words: input.words, builtIn: false },
      });
      return toPack(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw nameTaken();
      throw e;
    }
  }

  async update(id: string, input: PackUpdate): Promise<Pack> {
    const current = await this.editable(id);
    if (input.words) assertNoDuplicateWords(input.words);
    const renamed = input.name !== undefined && input.name !== current.name;
    if (renamed && (await this.nameInUse(input.name!, id))) throw nameTaken();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.pack.update({
          where: { id },
          data: { name: input.name, words: input.words },
        });
        if (renamed) {
          const sets = await tx.ruleSet.findMany({
            where: { enabledPacks: { has: current.name } },
            select: { profileId: true, enabledPacks: true },
          });
          for (const set of sets) {
            // Replace in place; drop a duplicate if the new name was somehow already listed.
            const next = [...new Set(set.enabledPacks.map((n) => (n === current.name ? row.name : n)))];
            await tx.ruleSet.update({ where: { profileId: set.profileId }, data: { enabledPacks: next } });
          }
          await this.versions.bump(tx, sets.map((s) => s.profileId));
        } else if (input.words) {
          await this.versions.bumpForPack(tx, row.name);
        }
        return toPack(row);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw nameTaken();
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const current = await this.editable(id);
    await this.prisma.$transaction(async (tx) => {
      const sets = await tx.ruleSet.findMany({
        where: { enabledPacks: { has: current.name } },
        select: { profileId: true, enabledPacks: true },
      });
      for (const set of sets) {
        await tx.ruleSet.update({
          where: { profileId: set.profileId },
          data: { enabledPacks: set.enabledPacks.filter((n) => n !== current.name) },
        });
      }
      await this.versions.bump(tx, sets.map((s) => s.profileId));
      await tx.pack.deleteMany({ where: { id } });
    });
  }

  private async nameInUse(name: string, exceptId?: string): Promise<boolean> {
    const hit = await this.prisma.pack.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return hit !== null;
  }

  private async editable(id: string): Promise<PackRow> {
    const row = await this.prisma.pack.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'not_found', message: 'No such pack.' });
    if (row.builtIn) {
      throw new ForbiddenException({ error: 'built_in_pack', message: 'Built-in packs are read-only.' });
    }
    return row;
  }
}
