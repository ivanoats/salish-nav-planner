"use client";

import { useCallback, useMemo, useState } from "react";
import { usePassCurrents, useWindField, type FetchStatus } from "./use-conditions";
import type { Composition } from "@/composition-root";
import { addDaysIso, todayIso, type IsoDate } from "@/domain/calendar";
import { DEFAULT_DEPARTURE_MINUTES, localTimeToMs } from "@/domain/clock";
import { clampMastHeight, DEFAULT_MAST_HEIGHT_FEET } from "@/domain/obstruction";
import { WIND_PENALTY_WEIGHT } from "@/domain/wind";
import {
  clampDayHours,
  clampTripDays,
  dayLengthRangeFor,
  DEFAULT_MAX_DAY_HOURS,
  DEFAULT_MIN_DAY_HOURS,
  DEFAULT_SPEED_KNOTS,
  type TripDay,
} from "@/domain/trip";
import type { DayConditions } from "@/application/day-conditions";
import type { Coordinates } from "@/domain/location";

/**
 * Realistic plans stay far below this; it mirrors the API route's own
 * cap so an unusually pass-heavy trip degrades to its earliest days
 * rather than failing the whole request.
 */
const MAX_PASSES_PER_REQUEST = 24;

export interface TripPlan {
  readonly days: number;
  readonly minHours: number;
  readonly maxHours: number;
  /** Derived from the hour window and speed — what the planner filters on. */
  readonly minNm: number;
  readonly maxNm: number;
  readonly speedKnots: number;
  readonly startSlug: string | null;
  readonly firstDestinationSlug: string | null;
  readonly roundTrip: boolean;
  readonly endSlug: string | null;
  readonly tripDays: readonly TripDay[];
  /** Every stop in order, including the start — for map markers. */
  readonly stopSlugs: readonly string[];
  readonly totalNm: number;

  readonly startDate: IsoDate;
  /** Minutes past local midnight the boat gets underway each day. */
  readonly departureMinutes: number;
  /** Mast height above the water, in feet. */
  readonly mastHeightFeet: number;
  /** Whether the forecast is allowed to shape which stops get picked. */
  readonly windAware: boolean;
  /** True once a forecast covering these dates has actually arrived. */
  readonly hasWind: boolean;
  readonly windStatus: FetchStatus;
  readonly currentsStatus: FetchStatus;
  readonly dayConditions: readonly DayConditions[];

  setDays(days: number): void;
  setMinHours(hours: number): void;
  setMaxHours(hours: number): void;
  setSpeedKnots(knots: number): void;
  setStartSlug(slug: string | null): void;
  setFirstDestinationSlug(slug: string | null): void;
  setRoundTrip(roundTrip: boolean): void;
  setCustomEndSlug(slug: string | null): void;
  setStartDate(date: IsoDate): void;
  setDepartureMinutes(minutes: number): void;
  setMastHeightFeet(feet: number): void;
  setWindAware(windAware: boolean): void;
  /** Pin a specific destination for a day (2..N). */
  setDayDestination(dayNumber: number, slug: string): void;
  /** Drop a pin so the day goes back to being auto-picked. */
  clearDayDestination(dayNumber: number): void;
  /** Swap an auto-picked day to the next-best candidate. */
  cycleDayDestination(dayNumber: number): void;
  isPinned(dayNumber: number): boolean;
}

export const useTripPlan = (composition: Composition): TripPlan => {
  const [days, setDaysState] = useState(1);
  const [minHours, setMinHoursState] = useState(DEFAULT_MIN_DAY_HOURS);
  const [maxHours, setMaxHoursState] = useState(DEFAULT_MAX_DAY_HOURS);
  const [speedKnots, setSpeedKnots] = useState(DEFAULT_SPEED_KNOTS);
  const [startSlug, setStartSlug] = useState<string | null>(null);
  const [firstDestinationSlug, setFirstDestinationSlug] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState(false);
  const [customEndSlug, setCustomEndSlug] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ReadonlyMap<number, string>>(new Map());
  const [startDate, setStartDate] = useState<IsoDate>(todayIso);
  const [departureMinutes, setDepartureMinutes] = useState(DEFAULT_DEPARTURE_MINUTES);
  const [windAware, setWindAware] = useState(true);
  const [mastHeightFeet, setMastHeightState] = useState(DEFAULT_MAST_HEIGHT_FEET);

  const setMastHeightFeet = useCallback((feet: number) => {
    setMastHeightState(clampMastHeight(feet));
  }, []);

  // Speed feeds the planner here: the hour window the user set converts
  // to a distance window, so a faster boat genuinely reaches further
  // stops in the same day rather than just reporting shorter times.
  const range = useMemo(
    () => dayLengthRangeFor({ minHours, maxHours }, speedKnots),
    [minHours, maxHours, speedKnots]
  );

  const setMinHours = useCallback((hours: number) => {
    setMinHoursState(clampDayHours(hours));
  }, []);
  const setMaxHours = useCallback((hours: number) => {
    setMaxHoursState(clampDayHours(hours));
  }, []);

  // The forecast is fetched from the dates alone, before any destination
  // is known, which is what lets it feed back into ranking below without
  // the plan and the weather each waiting on the other.
  const { windField, status: windStatus } = useWindField(
    composition.windZones,
    startDate,
    days,
    true
  );

  const coordinatesBySlug = useMemo(
    () =>
      new Map<string, Coordinates>(
        composition.locationRepository
          .list()
          .map((location) => [location.slug, { lat: location.lat, lon: location.lon }] as const)
      ),
    [composition]
  );

  const weather = useMemo(
    () =>
      windAware && windField.hasData
        ? { startDate, windField, coordinatesBySlug, weight: WIND_PENALTY_WEIGHT }
        : undefined,
    [windAware, windField, startDate, coordinatesBySlug]
  );

  // A round trip finishes where it started; otherwise the user may still
  // name an end point, and absent both the trip just wanders one-way.
  const endSlug = roundTrip ? startSlug : customEndSlug;

  const tripRequest = useMemo(
    () =>
      startSlug === null
        ? null
        : {
            startSlug,
            firstDestinationSlug,
            endSlug,
            days,
            range,
            overrides,
            weather,
            mastHeightFeet,
          },
    [startSlug, firstDestinationSlug, endSlug, days, range, overrides, weather, mastHeightFeet]
  );

  const tripDays = useMemo(
    () => (tripRequest === null ? [] : composition.planTrip(tripRequest)),
    [composition, tripRequest]
  );

  const scheduleRequest = useMemo(
    () => ({ tripDays, startDate, departureMinutes, speedKnots }),
    [tripDays, startDate, departureMinutes, speedKnots]
  );

  // Which passes the plan crosses has to be settled before predictions
  // can be asked for — there's no point fetching all 47 stations to show
  // the two a day actually goes through.
  const passIds = useMemo(() => {
    const ids = new Set<string>();
    for (const day of composition.passTransits(scheduleRequest)) {
      for (const transit of day.transits) ids.add(transit.pass.id);
    }
    return [...ids].slice(0, MAX_PASSES_PER_REQUEST);
  }, [composition, scheduleRequest]);

  // A day either side of the trip, so a pre-dawn start or an ETA that
  // slips past midnight still lands inside the predicted window.
  const currentsFromMs = useMemo(
    () => localTimeToMs(addDaysIso(startDate, -1), 0),
    [startDate]
  );
  const currentsToMs = useMemo(
    () => localTimeToMs(addDaysIso(startDate, days + 1), 0),
    [startDate, days]
  );

  const { currentsByPassId, status: currentsStatus } = usePassCurrents(
    passIds,
    currentsFromMs,
    currentsToMs
  );

  const dayConditions = useMemo(
    () => composition.dayConditions(scheduleRequest, windField, currentsByPassId),
    [composition, scheduleRequest, windField, currentsByPassId]
  );

  const setDays = useCallback((next: number) => {
    const clamped = clampTripDays(next);
    setDaysState(clamped);
    // Drop pins for days that no longer exist, so shortening then
    // re-lengthening a trip doesn't resurrect stale choices.
    setOverrides((prev) => {
      const kept = new Map<number, string>();
      for (const [day, slug] of prev) if (day <= clamped) kept.set(day, slug);
      return kept;
    });
  }, []);

  const setDayDestination = useCallback((dayNumber: number, slug: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(dayNumber, slug);
      // Later pins were chosen relative to a different upstream stop,
      // so they no longer reflect an intentional choice — reset them
      // to auto rather than silently keeping a now-arbitrary leg.
      for (const day of [...next.keys()]) if (day > dayNumber) next.delete(day);
      return next;
    });
  }, []);

  const clearDayDestination = useCallback((dayNumber: number) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(dayNumber);
      for (const day of [...next.keys()]) if (day > dayNumber) next.delete(day);
      return next;
    });
  }, []);

  const cycleDayDestination = useCallback(
    (dayNumber: number) => {
      if (tripRequest === null) return;
      const day = tripDays.find((d) => d.dayNumber === dayNumber);
      if (day === undefined) return;

      // Candidates come from the planner itself, so they carry the same
      // origin, exclusions, return-shaping and wind the day was picked with.
      const candidates = composition.candidatesForDay(tripRequest, dayNumber);
      if (candidates.length === 0) return;
      const currentIndex = candidates.findIndex((c) => c.slug === day.toSlug);
      const next = candidates[(currentIndex + 1) % candidates.length];
      if (next !== undefined) setDayDestination(dayNumber, next.slug);
    },
    [composition, tripRequest, tripDays, setDayDestination]
  );

  const stopSlugs = useMemo(() => {
    if (startSlug === null) return [];
    const stops = [startSlug];
    for (const day of tripDays) if (day.toSlug !== null) stops.push(day.toSlug);
    return stops;
  }, [startSlug, tripDays]);

  const totalNm = useMemo(
    () => tripDays.reduce((sum, day) => sum + (day.route?.totalNm ?? 0), 0),
    [tripDays]
  );

  const isPinned = useCallback((dayNumber: number) => overrides.has(dayNumber), [overrides]);

  return {
    days,
    minHours,
    maxHours,
    minNm: range.minNm,
    maxNm: range.maxNm,
    speedKnots,
    startSlug,
    firstDestinationSlug,
    roundTrip,
    endSlug,
    tripDays,
    stopSlugs,
    totalNm,
    startDate,
    departureMinutes,
    mastHeightFeet,
    windAware,
    hasWind: windField.hasData,
    windStatus,
    currentsStatus,
    dayConditions,
    setDays,
    setMinHours,
    setMaxHours,
    setSpeedKnots,
    setStartSlug,
    setFirstDestinationSlug,
    setRoundTrip,
    setCustomEndSlug,
    setStartDate,
    setDepartureMinutes,
    setMastHeightFeet,
    setWindAware,
    setDayDestination,
    clearDayDestination,
    cycleDayDestination,
    isPinned,
  };
};
