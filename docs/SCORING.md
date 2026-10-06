# Deal scoring

Scores are deterministic explanations, not AI-generated claims. Use only observations with matching route, cabin, trip type, passenger count, currency basis and seasonal/stay context. Hotel comparison groups additionally include property, room/occupancy, meal and cancellation terms. Missing evidence stays missing.

Use robust median and empirical percentile; ignore nonfinite/nonpositive samples and reject mismatched comparison groups. Require enough distinct observations across time before statistical alerts. One implausibly low outlier must not suppress every future deal. Weight historical discount, percentile, quality and verification with configurable nonnegative weights. Scores are bounded 0–100. Default bands: 90 extreme, 80 excellent, 70 good; profile thresholds control alerts.

Money: retain original amount/currency, base amount/currency, positive conversion rate, quote source and timestamp. No cross-currency comparison without a valid quote. Do not silently use today's conversion for historical observations. Positioning must be included when departing away from home; missing positioning is unavailable, never zero.

Hotel ratings retain provider and native scale. Google uses 5 points; Booking uses 10. Normalize to 0–1, then shrink toward a conservative prior according to review count. An excellent rating with eight reviews is less certain than one with thousands. Unknown review count cannot imply high confidence. Cheap low-quality hotels are penalized by a quality gate before price scoring.

Trip total includes the complete party's return fare, complete room stay and positioning for the party. Match hotel nights to actual local flight arrival and departure dates; flight outbound date alone is insufficient. Trip scoring considers total baseline, both component scores and minimum verification confidence. A high-priced hotel can remove an otherwise excellent flight's trip value.

Never assign a historical baseline or verification confidence from a guessed example. Store factor values, sample count, weights and algorithm version so users can inspect the explanation.
