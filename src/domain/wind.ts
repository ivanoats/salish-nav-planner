import { angleBetweenDegrees } from "./geo";
import type { IsoDate } from "./calendar";

export interface Wind {
  readonly speedKnots: number;
  readonly gustKnots: number;
  /**
   * The direction the wind blows *from*, degrees true — meteorological
   * convention, so a "southwesterly" reads 225. Every comparison against
   * a course below assumes this sense.
   */
  readonly fromDegrees: number;
}

export interface DailyWind extends Wind {
  readonly date: IsoDate;
  /** WMO code from the forecast model; null when not supplied. */
  readonly weatherCode: number | null;
  /** Percent chance of precipitation, or null. */
  readonly precipitationChance: number | null;
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

/** 16-point compass name for a bearing, e.g. 225 -> "SW". */
export const compassPoint = (degrees: number): string => {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index] ?? "N";
};

const BEAUFORT_UPPER_KNOTS = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];

/** Beaufort force for a sustained wind speed in knots. */
export const beaufortForce = (knots: number): number => {
  const index = BEAUFORT_UPPER_KNOTS.findIndex((upper) => knots <= upper);
  return index === -1 ? 12 : index;
};

/** The NWS thresholds a Salish Sea forecast is actually issued against. */
export const SMALL_CRAFT_ADVISORY_KNOTS = 21;
export const GALE_KNOTS = 34;

export type WindSeverity = "light" | "moderate" | "fresh" | "strong" | "gale";

/**
 * The wind rounded to the whole knots the interface prints.
 *
 * Labels are derived from this rather than from the raw model output, so
 * a day shown as "8–11 kt" can't be called light while another shown as
 * the same numbers is called moderate. The ranking maths below stays on
 * the unrounded values, where the extra precision costs nothing.
 */
const asDisplayed = (wind: Wind): Wind => ({
  speedKnots: Math.round(wind.speedKnots),
  gustKnots: Math.round(wind.gustKnots),
  fromDegrees: wind.fromDegrees,
});

export const windSeverity = (wind: Wind): WindSeverity => {
  const knots = effectiveWindKnots(asDisplayed(wind));
  if (knots >= GALE_KNOTS) return "gale";
  if (knots >= SMALL_CRAFT_ADVISORY_KNOTS) return "strong";
  if (knots >= 15) return "fresh";
  if (knots >= 8) return "moderate";
  return "light";
};

/** Beaufort force as printed, from the same rounded speed shown alongside. */
export const displayedBeaufortForce = (wind: Wind): number =>
  beaufortForce(Math.round(wind.speedKnots));

/**
 * What the boat actually has to handle. Gusts are what knock a boat down
 * and what build the chop, so they carry real weight here rather than
 * being reported and then ignored — but they're brief, so they count for
 * less than the sustained wind they punctuate.
 */
export const effectiveWindKnots = ({ speedKnots, gustKnots }: Wind): number =>
  Math.max(speedKnots, gustKnots * 0.75);

export type PointOfSail = "beat" | "close reach" | "beam reach" | "broad reach" | "run";

/**
 * Where the wind sits relative to where you're going. `courseDegrees` is
 * the direction of travel; `fromDegrees` is where the wind comes from,
 * so a course of 225 in a southwesterly is dead upwind.
 */
export const pointOfSail = (courseDegrees: number, wind: Wind): PointOfSail => {
  const relative = angleBetweenDegrees(courseDegrees, wind.fromDegrees);
  if (relative < 45) return "beat";
  if (relative < 80) return "close reach";
  if (relative < 110) return "beam reach";
  if (relative < 150) return "broad reach";
  return "run";
};

/**
 * How much of a day's misery each point of sail carries, given the same
 * wind. Punching into head seas is the thing that turns a pleasant
 * forecast into a long day; the same breeze from behind barely rates.
 */
const POINT_OF_SAIL_EXPOSURE: Record<PointOfSail, number> = {
  beat: 1,
  "close reach": 0.8,
  "beam reach": 0.55,
  "broad reach": 0.35,
  run: 0.3,
};

/** Below this the wind is a non-event; above the upper bound it dominates. */
const PLEASANT_WIND_KNOTS = 12;
const ROUGH_WIND_KNOTS = 30;

/**
 * How unpleasant a day in this wind on this heading would be, 0 to 1.
 *
 * Two things multiply: how hard it's blowing, and whether you're going
 * into it. A gale astern scores well under half of the same gale on the
 * nose, which is the whole point — the planner should reroute around a
 * beat, not around weather in general.
 */
export const discomfortFactor = (wind: Wind, courseDegrees: number): number => {
  const knots = effectiveWindKnots(wind);
  const strength = Math.min(
    1,
    Math.max(0, (knots - PLEASANT_WIND_KNOTS) / (ROUGH_WIND_KNOTS - PLEASANT_WIND_KNOTS))
  );
  if (strength === 0) return 0;
  return strength * POINT_OF_SAIL_EXPOSURE[pointOfSail(courseDegrees, wind)];
};

/**
 * The wind cost of a day, expressed in nautical miles so it can be added
 * to the planner's other ranking terms, which are all distances.
 *
 * It scales with the length of the leg because exposure is a matter of
 * *time* spent in the conditions: thirty miles to windward in a gale is
 * twice the ordeal of fifteen.
 */
export const windPenaltyNm = (wind: Wind, courseDegrees: number, legNm: number): number =>
  legNm * discomfortFactor(wind, courseDegrees);

/**
 * Relative weight of the wind term against day-length fit and
 * return-shape fit when ranking. At 0.6 a full-gale beat adds 60% of the
 * leg's distance to its score — enough to reliably lose to a shorter or
 * more sheltered day, without letting weather override the trip's shape
 * entirely.
 */
export const WIND_PENALTY_WEIGHT = 0.6;

/** Plain-language summary for a day's forecast, e.g. "SW 18–26 kt". */
export const describeWind = (wind: Wind): string => {
  const sustained = Math.round(wind.speedKnots);
  const gust = Math.round(wind.gustKnots);
  const direction = compassPoint(wind.fromDegrees);
  return gust > sustained ? `${direction} ${sustained}–${gust} kt` : `${direction} ${sustained} kt`;
};
