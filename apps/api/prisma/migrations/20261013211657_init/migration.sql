-- CreateTable
CREATE TABLE "Admin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "profileId" UUID NOT NULL,
    "blockWords" TEXT[],
    "enabledPacks" TEXT[],
    "siteWords" JSONB NOT NULL,
    "siteOptions" JSONB NOT NULL,
    "quietHours" JSONB,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "words" TEXT[],
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "browser" TEXT,
    "tokenHash" TEXT NOT NULL,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "tailscaleIp" TEXT,
    "kidModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "kidModeSchedule" JSONB,
    "kidModeState" TEXT NOT NULL DEFAULT 'unknown',
    "kidModeLastAppliedAt" TIMESTAMP(3),
    "kidModeLastError" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairingCode" (
    "code" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairingCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PiholeConnection" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "kidGroupName" TEXT NOT NULL DEFAULT 'Kid',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PiholeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pack_name_key" ON "Pack"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_profileId_idx" ON "Device"("profileId");

-- CreateIndex
CREATE INDEX "Device_revokedAt_idx" ON "Device"("revokedAt");

-- CreateIndex
CREATE INDEX "PairingCode_expiresAt_idx" ON "PairingCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
