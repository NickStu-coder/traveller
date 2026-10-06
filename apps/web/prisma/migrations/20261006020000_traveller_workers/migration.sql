-- AlterTable
ALTER TABLE "TravellerJob" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "request" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "resultCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TravellerConfig" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravellerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerConfigRevision" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravellerConfigRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravellerConfigRevision_configId_revision_key" ON "TravellerConfigRevision"("configId", "revision");

-- AddForeignKey
ALTER TABLE "TravellerConfigRevision" ADD CONSTRAINT "TravellerConfigRevision_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TravellerConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TravellerJob" ADD CONSTRAINT "TravellerJob_result_bounds" CHECK ("resultCount" >= 0 AND ("durationMs" IS NULL OR "durationMs" >= 0));
ALTER TABLE "TravellerConfig" ADD CONSTRAINT "TravellerConfig_revision_positive" CHECK (revision > 0);
ALTER TABLE "TravellerConfigRevision" ADD CONSTRAINT "TravellerConfigRevision_revision_positive" CHECK (revision > 0);
