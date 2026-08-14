import type { PlannedRoute } from "./route";

export const MIN_TRIP_DAYS = 1;
export const MAX_TRIP_DAYS = 7;

/**
 * A cruising day is bounded by daylight, not distance — you want to
 * leave after breakfast and be anchored before dark. So the user sets
 * *hours* underway and the planner converts to the nautical miles the
 * graph is measured in, which is what makes boat speed change which
 * stops are reachable rather than merely relabelling the times.
 */
export const DEFAULT_MIN_DAY_HOURS = 3;
export const DEFAULT_MAX_DAY_HOURS = 8;
export const MIN_DAY_HOURS = 1;
export const MAX_DAY_HOURS = 24;

export interface DayLengthHours {
  readonly minHours: number;
  readonly maxHours: number;
}

export const clampDayHours = (hours: number): number =>
  Math.min(MAX_DAY_HOURS, Math.max(MIN_DAY_HOURS, hours));

/**
 * nwcruising.net publishes every Hr:Min at 7.0 kt, but that's just
 * nm/speed — so times are recomputed from this setting rather than
 * trusting the scraped value.
 */
export const DEFAULT_SPEED_KNOTS = 6;
export const MIN_SPEED_KNOTS = 3;
export const MAX_SPEED_KNOTS = 30;

export const clampSpeed = (knots: number): number =>
  Math.min(MAX_SPEED_KNOTS, Math.max(MIN_SPEED_KNOTS, knots));

/**
 * How a day's destination was chosen. "endpoint" means the trip shape
 * fixed it (the last day of a trip with a declared end point), so it
 * isn't the planner's to re-pick or the user's to re-pin.
 */
export type DestinationSource = "manual" | "auto" | "endpoint";

/**
 * Where a day should ideally leave you, measured as distance from the
 * trip's end point.
 *
 * A round trip traces a tent: out for the first half, back for the
 * second, ending at zero. Over 5 days at 25nm/day that's
 * 25 → 50 → 50 → 25 → 0. Capped by `min(day, daysRemaining)` because
 * you can be no further out than the days already sailed, and no
 * further than the days left can bring you home.
 *
 * This is what actually produces the out-and-back *shape* — the
 * return-feasibility check alone only prevents stranding, it never
 * pulls the route outbound early or homeward late.
 */
export const idealDistanceToEnd = (
  dayNumber: number,
  totalDays: number,
  targetNm: number
): number => Math.min(dayNumber, totalDays - dayNumber) * targetNm;

/**
 * Relative weight of "is this the right distance from the end point"
 * against "is this the right length of day" when ranking. Both terms
 * are in nautical miles, so 1 weighs them equally.
 */
export const RETURN_SHAPE_WEIGHT = 1;

export interface TripDay {
  readonly dayNumber: number;
  readonly fromSlug: string;
  /** null when no candidate satisfies the day-length range. */
  readonly toSlug: string | null;
  readonly source: DestinationSource;
  /** null when toSlug is null, or no route could be found. */
  readonly route: PlannedRoute | null;
}

/**
 * The day-length window in the unit the route graph is measured in.
 * Always derived from hours and speed via `dayLengthRangeFor` rather
 * than set directly, so the two can't drift apart.
 */
export interface DayLengthRange {
  readonly minNm: number;
  readonly maxNm: number;
}

/** How far the boat covers in the given hours at the given speed. */
export const dayLengthRangeFor = (
  { minHours, maxHours }: DayLengthHours,
  speedKnots: number
): DayLengthRange => ({
  minNm: minHours * speedKnots,
  maxNm: maxHours * speedKnots,
});

export const clampTripDays = (days: number): number =>
  Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, Math.round(days)));
