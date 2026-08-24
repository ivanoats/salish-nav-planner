"use client";

import { useMemo } from "react";
import { css } from "styled-system/css";
import { createComposition } from "@/composition-root";
import { LocationPicker } from "@/components/panels/location-picker";
import { RouteSummaryPanel } from "@/components/panels/route-summary-panel";
import { TripControls } from "@/components/panels/trip-controls";
import { DayItinerary } from "@/components/panels/day-itinerary";
import { MapApp } from "@/components/map/map-app";
import { PrintButton } from "@/components/panels/print-button";
import {
  SharedTripWarning,
  ShareRouteControls,
} from "@/components/panels/share-route-controls";
import { useTripPlan } from "@/components/use-trip-plan";
import {
  sharedTripStateFromPlan,
  useShareableTripUrl,
} from "@/components/use-shareable-trip-url";
import type {
  SharedTripIssue,
  SharedTripState,
} from "@/application/shareable-trip-url";
import type { Location, Waypoint } from "@/domain/location";
import type { Obstruction } from "@/domain/obstruction";
import type { TidalPass } from "@/domain/pass";
import type { RouteEdge } from "@/domain/route";
import type { WindZone } from "@/domain/wind-zone";

interface PlannerShellProps {
  readonly locations: readonly Location[];
  readonly edges: readonly RouteEdge[];
  readonly waypoints: readonly Waypoint[];
  readonly passes: readonly TidalPass[];
  readonly windZones: readonly WindZone[];
  readonly obstructions: readonly Obstruction[];
  readonly chartPmtilesUrl?: string;
  readonly initialTripState: SharedTripState | null;
  readonly sharedTripIssues: readonly SharedTripIssue[];
  readonly hasIncomingSharedTrip: boolean;
}

export function PlannerShell({
  locations,
  edges,
  waypoints,
  passes,
  windZones,
  obstructions,
  chartPmtilesUrl,
  initialTripState,
  sharedTripIssues,
  hasIncomingSharedTrip,
}: PlannerShellProps) {
  const composition = useMemo(
    () => createComposition({ locations, edges, waypoints, passes, windZones, obstructions }),
    [locations, edges, waypoints, passes, windZones, obstructions]
  );

  const trip = useTripPlan(composition, initialTripState);
  const sharedTripState = sharedTripStateFromPlan(trip);
  useShareableTripUrl(sharedTripState, hasIncomingSharedTrip);

  const locationsBySlug = useMemo(
    () => new Map(locations.map((l) => [l.slug, l] as const)),
    [locations]
  );

  const stopLocations = useMemo(
    () =>
      trip.stopSlugs
        .map((slug) => locationsBySlug.get(slug))
        .filter((l): l is Location => l !== undefined),
    [trip.stopSlugs, locationsBySlug]
  );

  const dayRoutes = useMemo(
    () => trip.tripDays.map((day) => day.route).filter((r) => r !== null),
    [trip.tripDays]
  );

  const hasStartAndFirstStop =
    trip.startSlug !== null && trip.firstDestinationSlug !== null;

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: { base: "column", md: "row" },
        height: "100dvh",
      })}
    >
      <aside
        aria-label="Trip planner controls"
        data-print-sidebar
        className={css({
          width: { base: "full", md: "96" },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4",
          padding: "4",
          overflowY: "auto",
          borderRightWidth: { md: "1px" },
          borderColor: "border.default",
        })}
      >
        <div>
          <h1 className={css({ fontSize: "xl", fontWeight: "bold" })}>Salish Sea Nav Planner</h1>
          <p className={css({ fontSize: "xs", color: "fg.muted" })}>
            Trip-planning aid, sourced from nwcruising.net distance tables. Not for navigation.
          </p>
        </div>

        <SharedTripWarning issues={sharedTripIssues} />

        <div data-print-hide>
          <TripControls
          days={trip.days}
          minHours={trip.minHours}
          maxHours={trip.maxHours}
          minNm={trip.minNm}
          maxNm={trip.maxNm}
          speedKnots={trip.speedKnots}
          roundTrip={trip.roundTrip}
          startDate={trip.startDate}
          departureMinutes={trip.departureMinutes}
          mastHeightFeet={trip.mastHeightFeet}
          windAware={trip.windAware}
          hasWind={trip.hasWind}
          windStatus={trip.windStatus}
          onDaysChange={trip.setDays}
          onMinHoursChange={trip.setMinHours}
          onMaxHoursChange={trip.setMaxHours}
          onSpeedChange={trip.setSpeedKnots}
          onRoundTripChange={trip.setRoundTrip}
          onStartDateChange={trip.setStartDate}
          onDepartureChange={trip.setDepartureMinutes}
          onMastHeightChange={trip.setMastHeightFeet}
          onWindAwareChange={trip.setWindAware}
        />

        <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
          <LocationPicker
            label="Start"
            locations={locations}
            value={trip.startSlug}
            onChange={trip.setStartSlug}
          />
          <LocationPicker
            label={trip.days > 1 ? "Day 1 destination" : "Destination"}
            locations={locations}
            value={trip.firstDestinationSlug}
            onChange={trip.setFirstDestinationSlug}
          />

          {trip.days > 1 && !trip.roundTrip ? (
            <LocationPicker
              label="End at (optional)"
              locations={locations}
              value={trip.endSlug}
              onChange={trip.setCustomEndSlug}
            />
          ) : null}

          {hasStartAndFirstStop && trip.tripDays[0]?.route === null ? (
            <p className={css({ fontSize: "sm", color: "fg.muted" })}>
              No known route between these locations yet.
            </p>
          ) : null}
        </div>
        </div>

        <DayItinerary
          tripDays={trip.tripDays}
          locations={locations}
          locationsBySlug={locationsBySlug}
          dayConditions={trip.dayConditions}
          minNm={trip.minNm}
          maxNm={trip.maxNm}
          speedKnots={trip.speedKnots}
          onPin={trip.setDayDestination}
          onClearPin={trip.clearDayDestination}
          onCycle={trip.cycleDayDestination}
          isPinned={trip.isPinned}
        />

        {dayRoutes.length > 0 ? (
          <RouteSummaryPanel
            tripDays={trip.tripDays}
            totalNm={trip.totalNm}
            speedKnots={trip.speedKnots}
            departureMinutes={trip.departureMinutes}
            mastHeightFeet={trip.mastHeightFeet}
            locationsBySlug={locationsBySlug}
            dayConditions={trip.dayConditions}
            currentsLoading={trip.currentsStatus === "loading"}
            obstructionsFor={composition.obstructionsFor}
          />
        ) : null}

        {sharedTripState !== null ? <ShareRouteControls state={sharedTripState} /> : null}
        {dayRoutes.length > 0 ? <PrintButton /> : null}
      </aside>

      <div data-print-map className={css({ flex: "1", minHeight: { base: "80", md: "auto" } })}>
        <MapApp
          locations={locations}
          waypoints={waypoints}
          stopLocations={stopLocations}
          routes={dayRoutes}
          chartPmtilesUrl={chartPmtilesUrl}
        />
      </div>
    </div>
  );
}
