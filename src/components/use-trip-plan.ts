"use client";

import { useCallback, useMemo, useState } from "react";
import type { Composition } from "@/composition-root";
import {
  clampDayHours,
  clampTripDays,
  dayLengthRangeFor,
  DEFAULT_MAX_DAY_HOURS,
  DEFAULT_MIN_DAY_HOURS,
  DEFAULT_SPEED_KNOTS,
  type TripDay,
} from "@/domain/trip";

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
  setDays(days: number): void;
  setMinHours(hours: number): void;
  setMaxHours(hours: number): void;
  setSpeedKnots(knots: number): void;
  setStartSlug(slug: string | null): void;
  setFirstDestinationSlug(slug: string | null): void;
  setRoundTrip(roundTrip: boolean): void;
  setCustomEndSlug(slug: string | null): void;
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

  // A round trip finishes where it started; otherwise the user may still
  // name an end point, and absent both the trip just wanders one-way.
  const endSlug = roundTrip ? startSlug : customEndSlug;

  const tripRequest = useMemo(
    () =>
      startSlug === null
        ? null
        : { startSlug, firstDestinationSlug, endSlug, days, range, overrides },
    [startSlug, firstDestinationSlug, endSlug, days, range, overrides]
  );

  const tripDays = useMemo(
    () => (tripRequest === null ? [] : composition.planTrip(tripRequest)),
    [composition, tripRequest]
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
      // origin, exclusions and return-shaping the day was picked with.
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
    setDays,
    setMinHours,
    setMaxHours,
    setSpeedKnots,
    setStartSlug,
    setFirstDestinationSlug,
    setRoundTrip,
    setCustomEndSlug,
    setDayDestination,
    clearDayDestination,
    cycleDayDestination,
    isPinned,
  };
};
