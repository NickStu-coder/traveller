-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CarProvider" AS ENUM ('discovercars', 'autoeurope');

-- CreateEnum
CREATE TYPE "CarTrackingMode" AS ENUM ('best', 'contract');

-- CreateEnum
CREATE TYPE "CarRunStatus" AS ENUM ('queued', 'running', 'success', 'partial', 'unavailable', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TravelJobKind" AS ENUM ('flight_batch', 'flight_query', 'flight_preview', 'hotel_search', 'car_search');

-- CreateEnum
CREATE TYPE "TravelJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Query" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawInput" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationName" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "flexibility" INTEGER NOT NULL DEFAULT 0,
    "maxPrice" DOUBLE PRECISION,
    "maxStops" INTEGER,
    "maxDurationHours" INTEGER,
    "preferredAirlines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredAggregators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timePreference" TEXT NOT NULL DEFAULT 'any',
    "cabinClass" TEXT NOT NULL DEFAULT 'economy',
    "tripType" TEXT NOT NULL DEFAULT 'round_trip',
    "currency" TEXT,
    "groupId" TEXT,
    "deleteToken" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "lookAheadDays" INTEGER NOT NULL DEFAULT 14,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstViewedAt" TIMESTAMP(3),
    "vpnCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "label" TEXT,
    "scrapeInterval" INTEGER,
    "lastNotifiedLowPrice" DOUBLE PRECISION,
    "lastNotifiedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryEditEvent" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "QueryEditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "airline" TEXT NOT NULL,
    "bookingUrl" TEXT,
    "stops" INTEGER NOT NULL DEFAULT 0,
    "duration" TEXT,
    "layovers" JSONB,
    "flightId" TEXT,
    "flightNumber" TEXT,
    "departureTime" TEXT,
    "arrivalTime" TEXT,
    "seatsLeft" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'available',
    "airlineDirectPrice" DOUBLE PRECISION,
    "vpnCountry" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchRunId" TEXT,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchRun" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google_flights',
    "snapshotsCount" INTEGER NOT NULL DEFAULT 0,
    "extractionCost" DOUBLE PRECISION,
    "vpnCountry" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "travelJobId" TEXT,

    CONSTRAINT "FetchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionConfig" (
    "providerRevision" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "reasoningEffort" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scrapeInterval" INTEGER NOT NULL DEFAULT 3,
    "defaultSearchMethod" TEXT NOT NULL DEFAULT 'ai',
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "communitySharing" BOOLEAN NOT NULL DEFAULT false,
    "communityRegistrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "communityApiKey" TEXT,
    "lastCommunitySyncAt" TIMESTAMP(3),
    "defaultCurrency" TEXT,
    "defaultCountry" TEXT,
    "customBaseUrl" TEXT,
    "vpnProvider" TEXT,
    "vpnCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vpnActivationCode" TEXT,
    "multiUserMode" BOOLEAN NOT NULL DEFAULT false,
    "cabinAlertBaselineCutoff" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extractTimeoutSeconds" INTEGER NOT NULL DEFAULT 90,
    "maxFlightsPerDate" INTEGER NOT NULL DEFAULT 10,
    "maxTrackedPerRoute" INTEGER NOT NULL DEFAULT 10,
    "previewMaxCombos" INTEGER NOT NULL DEFAULT 24,
    "aggregatorsEnabled" TEXT[] DEFAULT ARRAY['google_flights', 'airline_direct']::TEXT[],
    "notifyMinDropAbs" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "notifyMinDropPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publicBaseUrl" TEXT,
    "anthropicRpm" INTEGER,
    "googleRpm" INTEGER,
    "openaiRpm" INTEGER,
    "groqRpm" INTEGER,
    "previewConcurrency" INTEGER,
    "previewAdmissionCap" INTEGER,

    CONSTRAINT "ExtractionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SidedoorState" (
    "id" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "SidedoorState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "theme" TEXT,
    "defaultCurrency" TEXT,
    "defaultCountry" TEXT,
    "preferredAirlines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredAggregators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cabinClass" TEXT,
    "preferredCarProviders" "CarProvider"[] DEFAULT ARRAY[]::"CarProvider"[],
    "carPreferencesRevision" INTEGER NOT NULL DEFAULT 0,
    "hotelMapPreferences" JSONB,
    "hotelMapPreferencesRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelMapConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelMapConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelTracker" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "hotelName" TEXT NOT NULL,
    "search" JSONB NOT NULL,
    "selection" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetArmed" BOOLEAN NOT NULL DEFAULT true,
    "historicalLow" DECIMAL(16,4),
    "latestPrice" DECIMAL(16,4),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "trackerId" TEXT,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "claimedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "HotelSearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSnapshot" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "offer" JSONB NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelAlert" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "deliveredIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelLease" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarTracker" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "search" JSONB NOT NULL,
    "selection" JSONB,
    "mode" "CarTrackingMode" NOT NULL DEFAULT 'best',
    "currency" VARCHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "scrapeInterval" INTEGER NOT NULL DEFAULT 3,
    "targetMinor" BIGINT,
    "notifyLows" BOOLEAN NOT NULL DEFAULT true,
    "targetArmed" BOOLEAN NOT NULL DEFAULT true,
    "historicalLowMinor" BIGINT,
    "latestPriceMinor" BIGINT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarTrackerCreation" (
    "id" CHAR(64) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "userId" TEXT,
    "trackerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarTrackerCreation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "trackerId" TEXT,
    "trackerRevision" INTEGER,
    "trackingClosed" BOOLEAN NOT NULL DEFAULT false,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "status" "CarRunStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CarSearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSearchCreation" (
    "id" CHAR(64) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "userId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarSearchCreation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarParseGate" (
    "id" CHAR(64) NOT NULL,
    "userId" TEXT,
    "token" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAllowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarParseGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarRefreshRequest" (
    "id" CHAR(64) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "trackerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "userId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarRefreshRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSnapshot" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" "CarProvider" NOT NULL,
    "offer" JSONB NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "totalMinor" BIGINT,
    "eligible" BOOLEAN NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contractHash" CHAR(64) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelJob" (
    "id" TEXT NOT NULL,
    "kind" "TravelJobKind" NOT NULL,
    "status" "TravelJobStatus" NOT NULL DEFAULT 'queued',
    "userId" TEXT,
    "queryId" TEXT,
    "hotelRunId" TEXT,
    "carRunId" TEXT,
    "activeKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseResource" TEXT,
    "leaseOwner" TEXT,
    "leaseGeneration" INTEGER,
    "request" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "TravelJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelLease" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "topologyVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TravelLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAdmission" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "topologyHash" TEXT,
    "topologyVersion" INTEGER NOT NULL DEFAULT 0,
    "vpnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "systemWide" BOOLEAN NOT NULL DEFAULT false,
    "quarantinedAt" TIMESTAMP(3),
    "quarantineReason" TEXT,
    "cleanupRecoveryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "recoveryGeneration" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),
    "recoveredBy" TEXT,

    CONSTRAINT "TravelAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAlertDelivery" (
    "id" TEXT NOT NULL,
    "queryId" TEXT,
    "hotelAlertId" TEXT,
    "carTrackerId" TEXT,
    "eventKey" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "deliveredIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" UUID,
    "claimExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "operation" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewRun" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestPayload" JSONB NOT NULL,
    "resultPayload" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientIp" TEXT,

    CONSTRAINT "PreviewRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityApiKey" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "snapshotCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySnapshot" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "airline" TEXT NOT NULL,
    "stops" INTEGER NOT NULL DEFAULT 0,
    "cabinClass" TEXT NOT NULL DEFAULT 'economy',
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiKeyId" TEXT NOT NULL,

    CONSTRAINT "CommunitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Query_active_idx" ON "Query"("active");

-- CreateIndex
CREATE INDEX "Query_expiresAt_idx" ON "Query"("expiresAt");

-- CreateIndex
CREATE INDEX "Query_isSeed_idx" ON "Query"("isSeed");

-- CreateIndex
CREATE INDEX "Query_groupId_idx" ON "Query"("groupId");

-- CreateIndex
CREATE INDEX "Query_userId_idx" ON "Query"("userId");

-- CreateIndex
CREATE INDEX "QueryEditEvent_queryId_editedAt_idx" ON "QueryEditEvent"("queryId", "editedAt");

-- CreateIndex
CREATE INDEX "QueryEditEvent_userId_idx" ON "QueryEditEvent"("userId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_queryId_scrapedAt_idx" ON "PriceSnapshot"("queryId", "scrapedAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_queryId_airline_idx" ON "PriceSnapshot"("queryId", "airline");

-- CreateIndex
CREATE INDEX "PriceSnapshot_queryId_flightId_idx" ON "PriceSnapshot"("queryId", "flightId");

-- CreateIndex
CREATE INDEX "FetchRun_queryId_startedAt_idx" ON "FetchRun"("queryId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_isAdmin_idx" ON "User"("isAdmin");

-- CreateIndex
CREATE INDEX "HotelTracker_userId_idx" ON "HotelTracker"("userId");

-- CreateIndex
CREATE INDEX "HotelTracker_active_nextCheckAt_idx" ON "HotelTracker"("active", "nextCheckAt");

-- CreateIndex
CREATE INDEX "HotelSearchRun_status_createdAt_idx" ON "HotelSearchRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HotelSearchRun_userId_createdAt_idx" ON "HotelSearchRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HotelSearchRun_trackerId_createdAt_idx" ON "HotelSearchRun"("trackerId", "createdAt");

-- CreateIndex
CREATE INDEX "HotelSnapshot_trackerId_scrapedAt_idx" ON "HotelSnapshot"("trackerId", "scrapedAt");

-- CreateIndex
CREATE INDEX "HotelAlert_pending_createdAt_idx" ON "HotelAlert"("pending", "createdAt");

-- CreateIndex
CREATE INDEX "HotelAlert_pending_nextAttemptAt_idx" ON "HotelAlert"("pending", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CarTracker_userId_idx" ON "CarTracker"("userId");

-- CreateIndex
CREATE INDEX "CarTracker_active_nextCheckAt_idx" ON "CarTracker"("active", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarTrackerCreation_trackerId_key" ON "CarTrackerCreation"("trackerId");

-- CreateIndex
CREATE INDEX "CarTrackerCreation_userId_idx" ON "CarTrackerCreation"("userId");

-- CreateIndex
CREATE INDEX "CarSearchRun_status_createdAt_idx" ON "CarSearchRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CarSearchRun_userId_createdAt_idx" ON "CarSearchRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CarSearchRun_trackerId_createdAt_idx" ON "CarSearchRun"("trackerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarSearchRun_id_trackerId_key" ON "CarSearchRun"("id", "trackerId");

-- CreateIndex
CREATE UNIQUE INDEX "CarSearchCreation_runId_key" ON "CarSearchCreation"("runId");

-- CreateIndex
CREATE INDEX "CarSearchCreation_userId_idx" ON "CarSearchCreation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CarParseGate_userId_key" ON "CarParseGate"("userId");

-- CreateIndex
CREATE INDEX "CarRefreshRequest_userId_idx" ON "CarRefreshRequest"("userId");

-- CreateIndex
CREATE INDEX "CarRefreshRequest_runId_idx" ON "CarRefreshRequest"("runId");

-- CreateIndex
CREATE INDEX "CarSnapshot_trackerId_observedAt_idx" ON "CarSnapshot"("trackerId", "observedAt");

-- CreateIndex
CREATE INDEX "CarSnapshot_trackerId_contractHash_observedAt_idx" ON "CarSnapshot"("trackerId", "contractHash", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelJob_hotelRunId_key" ON "TravelJob"("hotelRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelJob_carRunId_key" ON "TravelJob"("carRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelJob_activeKey_key" ON "TravelJob"("activeKey");

-- CreateIndex
CREATE INDEX "TravelJob_status_priority_createdAt_idx" ON "TravelJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "TravelJob_queryId_createdAt_idx" ON "TravelJob"("queryId", "createdAt");

-- CreateIndex
CREATE INDEX "TravelJob_userId_createdAt_idx" ON "TravelJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelAlertDelivery_hotelAlertId_key" ON "TravelAlertDelivery"("hotelAlertId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelAlertDelivery_eventKey_key" ON "TravelAlertDelivery"("eventKey");

-- CreateIndex
CREATE INDEX "TravelAlertDelivery_pending_nextAttemptAt_idx" ON "TravelAlertDelivery"("pending", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationChannel_userId_idx" ON "NotificationChannel"("userId");

-- CreateIndex
CREATE INDEX "NotificationChannel_enabled_idx" ON "NotificationChannel"("enabled");

-- CreateIndex
CREATE INDEX "ApiUsageLog_createdAt_idx" ON "ApiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiUsageLog_provider_idx" ON "ApiUsageLog"("provider");

-- CreateIndex
CREATE INDEX "PreviewRun_status_createdAt_idx" ON "PreviewRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewRun_expiresAt_idx" ON "PreviewRun"("expiresAt");

-- CreateIndex
CREATE INDEX "PreviewRun_requestHash_status_expiresAt_idx" ON "PreviewRun"("requestHash", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PreviewRun_clientIp_status_updatedAt_idx" ON "PreviewRun"("clientIp", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityApiKey_apiKey_key" ON "CommunityApiKey"("apiKey");

-- CreateIndex
CREATE INDEX "CommunityApiKey_active_idx" ON "CommunityApiKey"("active");

-- CreateIndex
CREATE INDEX "CommunitySnapshot_origin_destination_idx" ON "CommunitySnapshot"("origin", "destination");

-- CreateIndex
CREATE INDEX "CommunitySnapshot_travelDate_idx" ON "CommunitySnapshot"("travelDate");

-- CreateIndex
CREATE INDEX "CommunitySnapshot_airline_idx" ON "CommunitySnapshot"("airline");

-- CreateIndex
CREATE INDEX "CommunitySnapshot_apiKeyId_idx" ON "CommunitySnapshot"("apiKeyId");

-- AddForeignKey
ALTER TABLE "Query" ADD CONSTRAINT "Query_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryEditEvent" ADD CONSTRAINT "QueryEditEvent_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_fetchRunId_fkey" FOREIGN KEY ("fetchRunId") REFERENCES "FetchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchRun" ADD CONSTRAINT "FetchRun_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchRun" ADD CONSTRAINT "FetchRun_travelJobId_fkey" FOREIGN KEY ("travelJobId") REFERENCES "TravelJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelTracker" ADD CONSTRAINT "HotelTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSearchRun" ADD CONSTRAINT "HotelSearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSearchRun" ADD CONSTRAINT "HotelSearchRun_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "HotelTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSnapshot" ADD CONSTRAINT "HotelSnapshot_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "HotelTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSnapshot" ADD CONSTRAINT "HotelSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HotelSearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelAlert" ADD CONSTRAINT "HotelAlert_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "HotelTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarTracker" ADD CONSTRAINT "CarTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarTrackerCreation" ADD CONSTRAINT "CarTrackerCreation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarTrackerCreation" ADD CONSTRAINT "CarTrackerCreation_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CarTracker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSearchRun" ADD CONSTRAINT "CarSearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSearchRun" ADD CONSTRAINT "CarSearchRun_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CarTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSearchCreation" ADD CONSTRAINT "CarSearchCreation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSearchCreation" ADD CONSTRAINT "CarSearchCreation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CarSearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarParseGate" ADD CONSTRAINT "CarParseGate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRefreshRequest" ADD CONSTRAINT "CarRefreshRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRefreshRequest" ADD CONSTRAINT "CarRefreshRequest_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CarSearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSnapshot" ADD CONSTRAINT "CarSnapshot_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CarTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSnapshot" ADD CONSTRAINT "CarSnapshot_runId_trackerId_fkey" FOREIGN KEY ("runId", "trackerId") REFERENCES "CarSearchRun"("id", "trackerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_hotelRunId_fkey" FOREIGN KEY ("hotelRunId") REFERENCES "HotelSearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_carRunId_fkey" FOREIGN KEY ("carRunId") REFERENCES "CarSearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_leaseResource_fkey" FOREIGN KEY ("leaseResource") REFERENCES "TravelLease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_hotelAlertId_fkey" FOREIGN KEY ("hotelAlertId") REFERENCES "HotelAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_carTrackerId_fkey" FOREIGN KEY ("carTrackerId") REFERENCES "CarTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySnapshot" ADD CONSTRAINT "CommunitySnapshot_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "CommunityApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
BEGIN;
-- Serializes startup by multiple application replicas. No historical records
-- are rewritten: an incompatible database fails visibly before serving traffic.
SELECT pg_advisory_xact_lock(761932104);
-- Replace the original checks atomically to admit process-owned previews while
-- retaining strict references and lifecycle rules for every persisted job.
ALTER TABLE "TravelJob" DROP CONSTRAINT IF EXISTS "TravelJob_reference_check";
ALTER TABLE "TravelJob" DROP CONSTRAINT IF EXISTS "TravelJob_lifecycle_check";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelLease_state_check' AND conrelid = '"TravelLease"'::regclass) THEN
    ALTER TABLE "TravelLease" ADD CONSTRAINT "TravelLease_state_check" CHECK (
      state IN ('idle', 'held', 'quarantined') AND generation >= 0 AND "topologyVersion" >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelAdmission_state_check' AND conrelid = '"TravelAdmission"'::regclass) THEN
    ALTER TABLE "TravelAdmission" ADD CONSTRAINT "TravelAdmission_state_check" CHECK (
      id = 'singleton' AND "topologyVersion" >= 0 AND "recoveryGeneration" >= 0 AND
      (NOT "systemWide" OR "vpnEnabled") AND
      (("quarantinedAt" IS NULL AND "quarantineReason" IS NULL) OR
       ("quarantinedAt" IS NOT NULL AND "quarantineReason" IS NOT NULL))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelJob_reference_check' AND conrelid = '"TravelJob"'::regclass) THEN
    ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_reference_check" CHECK (
      (kind IN ('flight_batch', 'flight_preview') AND "queryId" IS NULL AND "hotelRunId" IS NULL AND "carRunId" IS NULL) OR
      (kind = 'flight_query' AND "queryId" IS NOT NULL AND "hotelRunId" IS NULL AND "carRunId" IS NULL) OR
      (kind = 'hotel_search' AND "queryId" IS NULL AND "hotelRunId" IS NOT NULL AND "carRunId" IS NULL) OR
      (kind = 'car_search' AND "queryId" IS NULL AND "hotelRunId" IS NULL AND "carRunId" IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelJob_lifecycle_check' AND conrelid = '"TravelJob"'::regclass) THEN
    ALTER TABLE "TravelJob" ADD CONSTRAINT "TravelJob_lifecycle_check" CHECK (
      attempts >= 0 AND
      ((status IN ('queued', 'running') AND "activeKey" = CASE kind
        WHEN 'flight_batch' THEN 'flight_batch'
        WHEN 'flight_preview' THEN 'flight_preview:' || id
        WHEN 'flight_query' THEN 'flight_query:' || "queryId"
        WHEN 'hotel_search' THEN 'hotel_search:' || "hotelRunId"
        WHEN 'car_search' THEN 'car_search:' || "carRunId" END AND "activeKey" IS NOT NULL AND "completedAt" IS NULL)
        OR (status IN ('succeeded', 'failed', 'cancelled') AND "activeKey" IS NULL AND "completedAt" IS NOT NULL)) AND
      ((status = 'running' AND "leaseResource" IS NOT NULL AND "leaseOwner" IS NOT NULL AND "leaseGeneration" IS NOT NULL AND "claimedAt" IS NOT NULL AND attempts > 0)
        OR (status <> 'running' AND "leaseResource" IS NULL AND "leaseOwner" IS NULL AND "leaseGeneration" IS NULL)) AND
      ((status = 'cancelled' AND "cancelledAt" IS NOT NULL) OR (status <> 'cancelled' AND "cancelledAt" IS NULL))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelAlertDelivery_reference_check' AND conrelid = '"TravelAlertDelivery"'::regclass) THEN
    ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_reference_check"
      CHECK (num_nonnulls("queryId", "hotelAlertId", "carTrackerId") = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CarTracker_amounts_check' AND conrelid = '"CarTracker"'::regclass) THEN
    ALTER TABLE "CarTracker" ADD CONSTRAINT "CarTracker_amounts_check" CHECK (
      "targetMinor" BETWEEN 0 AND 9007199254740991 AND
      "historicalLowMinor" BETWEEN 0 AND 9007199254740991 AND
      "latestPriceMinor" BETWEEN 0 AND 9007199254740991 AND
      "scrapeInterval" BETWEEN 1 AND 24 AND revision >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CarSnapshot_amount_check' AND conrelid = '"CarSnapshot"'::regclass) THEN
    ALTER TABLE "CarSnapshot" ADD CONSTRAINT "CarSnapshot_amount_check"
      CHECK ("totalMinor" BETWEEN 0 AND 9007199254740991 AND (NOT eligible OR "totalMinor" IS NOT NULL));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "CarSearchRun_active_tracker_key"
  ON "CarSearchRun" ("trackerId") WHERE "trackerId" IS NOT NULL AND status IN ('queued', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS "HotelSearchRun_active_tracker_key"
  ON "HotelSearchRun" ("trackerId") WHERE "trackerId" IS NOT NULL AND status IN ('queued', 'running');
COMMIT;

