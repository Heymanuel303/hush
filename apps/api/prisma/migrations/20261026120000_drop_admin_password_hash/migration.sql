-- AlterTable
ALTER TABLE "Admin" DROP COLUMN "passwordHash";

-- Rollback (manual): ALTER TABLE "Admin" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
