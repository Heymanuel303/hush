-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "idpSub" TEXT;

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" UUID NOT NULL,
    "idpSid" TEXT,
    "refreshTokenSealed" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshLockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSession_idpSid_idx" ON "AdminSession"("idpSid");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_idpSub_key" ON "Admin"("idpSub");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "AdminSession"; ALTER TABLE "Admin" DROP COLUMN "idpSub";
