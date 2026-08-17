import { InMemoryLocationRepository } from "@/adapters/outbound/in-memory-location-repository";
import {
  buildDayConditions,
  passTransitsForTrip,
  type DayConditions,
  type DayPassTransits,
} from "@/application/day-conditions";
import { candidatesForDay, planTrip, type PlanTripInput } from "@/application/plan-trip";
import {
  buildRouteGraph,
  findRoute,
  type DestinationCandidate,
  type RouteGraph,
} from "@/application/route-graph";
import type { LocationRepository } from "@/application/ports/location-repository";
import type { IsoDate } from "@/domain/calendar";
import type { Location, Waypoint } from "@/domain/location";
import type { Obstruction } from "@/domain/obstruction";
import type { TidalPass } from "@/domain/pass";
import type { PlannedRoute, RouteEdge } from "@/domain/route";
import type { CurrentEvent } from "@/domain/tidal";
import type { TripDay } from "@/domain/trip";
import type { WindField } from "@/domain/wind-field";
import type { WindZone } from "@/domain/wind-zone";

export type TripRequest = Omit<PlanTripInput, "graph">;

/** What both conditions calls need to place a plan in time and space. */
export interface TripScheduleRequest {
  readonly tripDays: readonly TripDay[];
  readonly startDate: IsoDate;
  readonly departureMinutes: number;
  readonly speedKnots: number;
}

export interface Composition {
  readonly locationRepository: LocationRepository;
  readonly waypoints: readonly Waypoint[];
  readonly passes: readonly TidalPass[];
  readonly windZones: readonly WindZone[];
  readonly obstructions: readonly Obstruction[];
  /** Bridges on a planned leg, resolved from the ids it carries. */
  obstructionsFor(ids: readonly string[]): Obstruction[];
  planRoute(fromSlug: string, toSlug: string): PlannedRoute | null;
  planTrip(input: TripRequest): TripDay[];
  candidatesForDay(input: TripRequest, dayNumber: number): DestinationCandidate[];
  /** Which passes a plan crosses — ask this before fetching predictions. */
  passTransits(request: TripScheduleRequest): DayPassTransits[];
  dayConditions(
    request: TripScheduleRequest,
    windField: WindField,
    currentsByPassId: ReadonlyMap<string, readonly CurrentEvent[]>
  ): DayConditions[];
}

export interface CompositionDataset {
  readonly locations: readonly Location[];
  readonly edges: readonly RouteEdge[];
  readonly waypoints: readonly Waypoint[];
  readonly passes: readonly TidalPass[];
  readonly windZones: readonly WindZone[];
  readonly obstructions: readonly Obstruction[];
}

/**
 * Pure factory — no globals, no fs access, no network. Client components
 * build this once from the dataset a server component read via
 * `loadDataset()`. Live wind and current data arrive separately, as
 * arguments to `dayConditions`, so this stays synchronous and testable.
 */
export const createComposition = ({
  locations,
  edges,
  waypoints,
  passes,
  windZones,
  obstructions,
}: CompositionDataset): Composition => {
  const locationRepository = new InMemoryLocationRepository(locations);
  // Bridge geometry is measured once here, not per plan: the result is a
  // clearance number on each hop, so changing the mast height re-filters
  // the graph instead of re-measuring it.
  const graph: RouteGraph = buildRouteGraph(edges, { locations, waypoints, obstructions });
  const locationsBySlug = new Map(locations.map((location) => [location.slug, location] as const));

  const scheduleInput = ({
    tripDays,
    startDate,
    departureMinutes,
    speedKnots,
  }: TripScheduleRequest) => ({
    tripDays,
    startDate,
    departureMinutes,
    speedKnots,
    locationsBySlug,
    waypoints,
    passes,
  });

  return {
    locationRepository,
    waypoints,
    passes,
    windZones,
    obstructions,
    obstructionsFor: (ids) =>
      ids
        .map((id) => graph.obstructionsById.get(id))
        .filter((o): o is Obstruction => o !== undefined),
    planRoute: (fromSlug, toSlug) => findRoute(graph, fromSlug, toSlug),
    planTrip: (input) => planTrip({ ...input, graph }),
    candidatesForDay: (input, dayNumber) => candidatesForDay({ ...input, graph }, dayNumber),
    passTransits: (request) => passTransitsForTrip(scheduleInput(request)),
    dayConditions: (request, windField, currentsByPassId) =>
      buildDayConditions({ ...scheduleInput(request), windField, currentsByPassId }),
  };
};
