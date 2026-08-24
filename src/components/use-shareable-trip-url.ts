"use client";

import { useEffect, useRef } from "react";
import {
  encodeSharedTrip,
  SHARED_TRIP_VERSION,
  SHARED_TRIP_QUERY_KEYS,
  type SharedTripState,
} from "@/application/shareable-trip-url";
import type { TripPlan } from "@/components/use-trip-plan";

export const sharedTripStateFromPlan = (trip: TripPlan): SharedTripState | null => {
  if (
    trip.startSlug === null ||
    trip.firstDestinationSlug === null ||
    trip.tripDays.length !== trip.days ||
    trip.tripDays.some((day) => day.toSlug === null || day.route === null) ||
    trip.stopSlugs.length !== trip.days + 1
  ) {
    return null;
  }

  return {
    version: SHARED_TRIP_VERSION,
    days: trip.days,
    minHours: trip.minHours,
    maxHours: trip.maxHours,
    speedKnots: trip.speedKnots,
    startSlug: trip.startSlug,
    firstDestinationSlug: trip.firstDestinationSlug,
    startDate: trip.startDate,
    departureMinutes: trip.departureMinutes,
    mastHeightFeet: trip.mastHeightFeet,
    windAware: trip.windAware,
    roundTrip: trip.roundTrip,
    customEndSlug: trip.customEndSlug,
    stopSlugs: trip.stopSlugs,
    pinnedDays: trip.pinnedDays,
  };
};

export const canonicalSharedTripUrl = (
  currentHref: string,
  state: SharedTripState
): string => {
  const url = new URL(currentHref);
  url.search = encodeSharedTrip(state).toString();
  url.hash = "";
  return url.toString();
};

const removeSharedTripParameters = (currentHref: string): string => {
  const url = new URL(currentHref);
  for (const key of SHARED_TRIP_QUERY_KEYS) url.searchParams.delete(key);
  return url.toString();
};

export const useShareableTripUrl = (
  state: SharedTripState | null,
  hasIncomingSharedTrip: boolean
): void => {
  const hadSharedTrip = useRef(hasIncomingSharedTrip);
  const encodedState = state === null ? null : encodeSharedTrip(state).toString();

  useEffect(() => {
    const currentHref = window.location.href;
    let nextHref: string | null = null;

    if (encodedState !== null) {
      hadSharedTrip.current = true;
      const canonicalUrl = new URL(currentHref);
      canonicalUrl.search = encodedState;
      canonicalUrl.hash = "";
      nextHref = canonicalUrl.toString();
    } else if (hadSharedTrip.current) {
      nextHref = removeSharedTripParameters(currentHref);
    }

    if (nextHref !== null && nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  }, [encodedState]);
};
