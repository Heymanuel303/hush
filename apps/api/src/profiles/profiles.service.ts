import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProfileCreate, ProfilePatch, ProfileWithRules, RuleSet, SiteWords } from 'contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEMPLATES } from '../templates/templates.js';
import { ProfileVersionService } from './profile-version.service.js';

type Row = Prisma.ProfileGetPayload<{ include: { rules: true } }>;

const EMPTY_RULES: RuleSet = { blockWords: [], enabledPacks: [], siteWords: {}, siteOptions: {}, quietHours: null };

const toProfile = (row: Row): ProfileWithRules => {
  const r = row.rules;
  return {
    id: row.id,
    name: row.name,
    locked: row.locked,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    rules: r
      ? {
          blockWords: r.blockWords,
          enabledPacks: r.enabledPacks,
          siteWords: r.siteWords as SiteWords,
          siteOptions: r.siteOptions as RuleSet['siteOptions'],
          quietHours: r.quietHours as RuleSet['quietHours'],
        }
      : EMPTY_RULES,
  };
};

const nameTaken = () =>
  new ConflictException({ error: 'name_taken', message: 'A profile with that name already exists.' });

const duplicate = (w: string, where: string) =>
  new BadRequestException({ error: 'duplicate_word', message: `The word "${w}" appears more than once in ${where}.` });

function assertNoDuplicates(words: string[], where: string): void {
  const seen = new Set<string>();
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) throw duplicate(w, where);
    seen.add(key);
  }
}

/** Thrown inside the transaction callback to abort it with a 412. */
const stale = (current: number) =>
  new HttpException(
    { error: 'stale_version', message: 'The profile changed since you loaded it.', details: { current } },
    412,
  );

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: ProfileVersionService,
  ) {}

  async list(): Promise<ProfileWithRules[]> {
    const rows = await this.prisma.profile.findMany({ include: { rules: true }, orderBy: { name: 'asc' } });
    return rows.map(toProfile);
  }

  async get(id: string): Promise<ProfileWithRules> {
    return toProfile(await this.find(this.prisma, id));
  }

  async create(input: ProfileCreate): Promise<ProfileWithRules> {
    const template = input.templateId ? TEMPLATES.find((t) => t.id === input.templateId) : undefined;
    const rules = template?.rules ?? EMPTY_RULES;
    const locked = input.locked ?? template?.locked ?? false;
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameFree(tx, input.name);
      const row = await tx.profile.create({
        data: {
          name: input.name,
          locked,
          rules: {
            create: {
              blockWords: rules.blockWords,
              enabledPacks: rules.enabledPacks,
              siteWords: rules.siteWords,
              siteOptions: rules.siteOptions,
              quietHours: rules.quietHours ?? undefined,
            },
          },
        },
        include: { rules: true },
      });
      return toProfile(row);
    });
  }

  async patch(id: string, input: ProfilePatch): Promise<ProfileWithRules> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
        await this.assertNameFree(tx, input.name, id);
      }
      await tx.profile.update({ where: { id }, data: { name: input.name, locked: input.locked } });
      if (input.locked !== undefined && input.locked !== current.locked) await this.versions.bump(tx, [id]);
      return toProfile(await this.find(tx, id));
    });
  }

  async putRules(id: string, ifMatch: string | undefined, input: RuleSet): Promise<ProfileWithRules> {
    if (ifMatch === undefined || ifMatch.trim() === '') {
      throw new HttpException(
        { error: 'if_match_required', message: 'Send the profile version in an If-Match header.' },
        428,
      );
    }
    const expected = /^(?:W\/)?"?(\d+)"?$/.exec(ifMatch.trim())?.[1];
    const words = input.blockWords.map((w) => w.trim());
    assertNoDuplicates(words, 'the blocked words');
    for (const [site, list] of Object.entries(input.siteWords)) assertNoDuplicates(list ?? [], `the ${site} words`);

    const known = new Set(
      (await this.prisma.pack.findMany({ where: { name: { in: input.enabledPacks } }, select: { name: true } })).map(
        (p) => p.name,
      ),
    );
    for (const name of input.enabledPacks) {
      if (!known.has(name)) {
        throw new HttpException(
          { error: 'unknown_pack', message: `No pack named "${name}".`, details: { name } },
          422,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      if (expected === undefined || Number(expected) !== current.version) throw stale(current.version);
      // Compare-and-set on the version: of two concurrent writers holding the same
      // If-Match, only one matches this row once the other has committed.
      const { count } = await tx.profile.updateMany({
        where: { id, version: current.version },
        data: { updatedAt: new Date() },
      });
      if (count === 0) throw stale((await this.find(tx, id)).version);
      await tx.ruleSet.upsert({
        where: { profileId: id },
        create: {
          profileId: id,
          blockWords: words,
          enabledPacks: input.enabledPacks,
          siteWords: input.siteWords,
          siteOptions: input.siteOptions,
          quietHours: input.quietHours ?? undefined,
        },
        update: {
          blockWords: words,
          enabledPacks: input.enabledPacks,
          siteWords: input.siteWords,
          siteOptions: input.siteOptions,
          quietHours: input.quietHours ?? Prisma.DbNull,
        },
      });
      await this.versions.bump(tx, [id]);
      return toProfile(await this.find(tx, id));
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.find(tx, id);
      const deviceCount = await tx.device.count({ where: { profileId: id, revokedAt: null } });
      if (deviceCount > 0) {
        throw new ConflictException({
          error: 'profile_in_use',
          message: 'Revoke the devices on this profile first.',
          details: { deviceCount },
        });
      }
      await tx.device.deleteMany({ where: { profileId: id } });
      await tx.pairingCode.deleteMany({ where: { profileId: id } });
      await tx.profile.delete({ where: { id } });
    });
  }

  private async find(db: Prisma.TransactionClient | PrismaService, id: string): Promise<Row> {
    const row = await db.profile.findUnique({ where: { id }, include: { rules: true } });
    if (!row) throw new NotFoundException({ error: 'not_found', message: 'No such profile.' });
    return row;
  }

  private async assertNameFree(db: Prisma.TransactionClient, name: string, exceptId?: string): Promise<void> {
    const hit = await db.profile.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (hit) throw nameTaken();
  }
}
