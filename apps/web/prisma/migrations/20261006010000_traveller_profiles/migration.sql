-- Removed accounts retain private ownership/history; credentials are revoked separately.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WatchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchProfileRevision" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchProfileRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerObservation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "comparisonKey" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "baseAmount" DECIMAL(18,4),
    "baseCurrency" TEXT,
    "fxRate" DECIMAL(18,8),
    "fxSource" TEXT,
    "fxAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "bookingUrl" TEXT,
    "details" JSONB NOT NULL,
    "score" JSONB,

    CONSTRAINT "TravellerObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerVerification" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "independentGroup" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "direct" BOOLEAN NOT NULL DEFAULT false,
    "contextConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TravellerVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerSourceState" (
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "capabilities" JSONB NOT NULL,
    "budgetPerDay" INTEGER NOT NULL DEFAULT 100,
    "usedToday" INTEGER NOT NULL DEFAULT 0,
    "budgetDate" TEXT NOT NULL DEFAULT '',
    "nextAllowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravellerSourceState_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "TravellerJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "lane" TEXT NOT NULL DEFAULT 'DISCOVERY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TravellerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchProfile_userId_archivedAt_idx" ON "WatchProfile"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "WatchProfile_active_nextCheckAt_idx" ON "WatchProfile"("active", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchProfileRevision_profileId_revision_key" ON "WatchProfileRevision"("profileId", "revision");

-- CreateIndex
CREATE INDEX "TravellerObservation_profileId_observedAt_idx" ON "TravellerObservation"("profileId", "observedAt");

-- CreateIndex
CREATE INDEX "TravellerObservation_comparisonKey_observedAt_idx" ON "TravellerObservation"("comparisonKey", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerObservation_profileId_source_identity_observedAt_key" ON "TravellerObservation"("profileId", "source", "identity", "observedAt");

-- CreateIndex
CREATE INDEX "TravellerVerification_observationId_verifiedAt_idx" ON "TravellerVerification"("observationId", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerJob_dedupKey_key" ON "TravellerJob"("dedupKey");

-- CreateIndex
CREATE INDEX "TravellerJob_state_runAt_priority_idx" ON "TravellerJob"("state", "runAt", "priority");

-- CreateIndex
CREATE INDEX "TravellerJob_profileId_state_idx" ON "TravellerJob"("profileId", "state");

-- AddForeignKey
ALTER TABLE "WatchProfile" ADD CONSTRAINT "WatchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchProfileRevision" ADD CONSTRAINT "WatchProfileRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WatchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerObservation" ADD CONSTRAINT "TravellerObservation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WatchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerVerification" ADD CONSTRAINT "TravellerVerification_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "TravellerObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerJob" ADD CONSTRAINT "TravellerJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WatchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WatchProfile" ADD CONSTRAINT "WatchProfile_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "WatchProfile" ADD CONSTRAINT "WatchProfile_archived_inactive" CHECK ("archivedAt" IS NULL OR "active" = false);
ALTER TABLE "TravellerObservation" ADD CONSTRAINT "TravellerObservation_price_positive" CHECK ("amount" > 0 AND "amount" <> 'NaN'::numeric AND ("baseAmount" IS NULL OR ("baseAmount" > 0 AND "baseAmount" <> 'NaN'::numeric)));
ALTER TABLE "TravellerObservation" ADD CONSTRAINT "TravellerObservation_fx_complete" CHECK (
  ("baseAmount" IS NULL AND "baseCurrency" IS NULL AND "fxRate" IS NULL AND "fxSource" IS NULL AND "fxAt" IS NULL)
  OR ("baseAmount" IS NOT NULL AND "baseCurrency" IS NOT NULL AND "fxRate" IS NOT NULL AND "fxRate" > 0 AND "fxRate" <> 'NaN'::numeric AND "fxSource" IS NOT NULL AND "fxAt" IS NOT NULL)
);
ALTER TABLE "TravellerObservation" ADD CONSTRAINT "TravellerObservation_kind_valid" CHECK ("kind" IN ('flight', 'hotel', 'trip'));
ALTER TABLE "TravellerObservation" ADD CONSTRAINT "TravellerObservation_provenance_valid" CHECK ("provenance" IN ('live', 'cached', 'historical', 'estimated'));
ALTER TABLE "TravellerVerification" ADD CONSTRAINT "TravellerVerification_price_positive" CHECK ("amount" > 0);
ALTER TABLE "TravellerJob" ADD CONSTRAINT "TravellerJob_state_valid" CHECK ("state" IN ('queued', 'running', 'completed', 'failed', 'cancelled'));
ALTER TABLE "TravellerJob" ADD CONSTRAINT "TravellerJob_lane_valid" CHECK ("lane" IN ('DISCOVERY', 'WATCH', 'HOT', 'COLD'));
ALTER TABLE "TravellerJob" ADD CONSTRAINT "TravellerJob_lease_complete" CHECK (("state" = 'running') = ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL));
ALTER TABLE "TravellerSourceState" ADD CONSTRAINT "TravellerSourceState_budget_valid" CHECK ("budgetPerDay" > 0 AND "usedToday" >= 0);
