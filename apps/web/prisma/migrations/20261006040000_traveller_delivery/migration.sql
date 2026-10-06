-- Extend the existing exactly-one-owner invariant to the Traveller outbox.
ALTER TABLE "TravelAlertDelivery" DROP CONSTRAINT IF EXISTS "TravelAlertDelivery_reference_check";
ALTER TABLE "TravelAlertDelivery" ADD CONSTRAINT "TravelAlertDelivery_reference_check"
  CHECK (num_nonnulls("queryId", "hotelAlertId", "carTrackerId", "travellerAlertId") = 1);
