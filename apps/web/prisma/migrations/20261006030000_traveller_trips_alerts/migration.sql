-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "TravelAlertDelivery" ADD COLUMN     "travellerAlertId" TEXT;

-- CreateTable
CREATE TABLE "TravellerTrip" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "flightObservationId" TEXT NOT NULL,
    "hotelObservationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravellerTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerAlert" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "observationId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravellerAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravellerTrip_profileId_createdAt_idx" ON "TravellerTrip"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerTrip_profileId_flightObservationId_hotelObservatio_key" ON "TravellerTrip"("profileId", "flightObservationId", "hotelObservationId");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerTrip_observationId_profileId_key" ON "TravellerTrip"("observationId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerAlert_eventKey_key" ON "TravellerAlert"("eventKey");

-- CreateIndex
CREATE INDEX "TravellerAlert_profileId_identity_createdAt_idx" ON "TravellerAlert"("profileId", "identity", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerObservation_id_profileId_key" ON "TravellerObservation"("id", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelAlertDelivery_travellerAlertId_key" ON "TravelAlertDelivery"("travellerAlertId");

-- AddForeignKey
ALTER TABLE "TravellerTrip" ADD CONSTRAINT "TravellerTrip_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WatchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerTrip" ADD CONSTRAINT "TravellerTrip_observationId_profileId_fkey" FOREIGN KEY ("observationId", "profileId") REFERENCES "TravellerObservation"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerTrip" ADD CONSTRAINT "TravellerTrip_flightObservationId_profileId_fkey" FOREIGN KEY ("flightObservationId", "profileId") REFERENCES "TravellerObservation"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerTrip" ADD CONSTRAINT "TravellerTrip_hotelObservationId_profileId_fkey" FOREIGN KEY ("hotelObservationId", "profileId") REFERENCES "TravellerObservation"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerAlert" ADD CONSTRAINT "TravellerAlert_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WatchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerAlert" ADD CONSTRAINT "TravellerAlert_observationId_profileId_fkey" FOREIGN KEY ("observationId", "profileId") REFERENCES "TravellerObservation"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_travellerAlertId_fkey" FOREIGN KEY ("travellerAlertId") REFERENCES "TravellerAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TravellerAlert" ADD CONSTRAINT "TravellerAlert_values_check"
  CHECK ("amount" > 0 AND "score" BETWEEN 0 AND 100 AND "profileRevision" > 0
    AND "currency" ~ '^[A-Z]{3}$' AND "confidence" IN ('low', 'medium', 'high'));

ALTER TABLE "TravellerTrip" ADD CONSTRAINT "TravellerTrip_distinct_components_check"
  CHECK ("observationId" <> "flightObservationId" AND "observationId" <> "hotelObservationId"
    AND "flightObservationId" <> "hotelObservationId");
