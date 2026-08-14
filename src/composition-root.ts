import { InMemoryLocationRepository } from "@/adapters/outbound/in-memory-location-repository";
import { candidatesForDay, planTrip, type PlanTripInput } from "@/application/plan-trip";
import {
  buildRouteGraph,
  findRoute,
  type DestinationCandidate,
  type RouteGraph,
} from "@/application/route-graph";
import type { LocationRepository } from "@/application/ports/location-repository";
import type { Location, Waypoint } from "@/domain/location";
import type { PlannedRoute, RouteEdge } from "@/domain/route";
import type { TripDay } from "@/domain/trip";

export type TripRequest = Omit<PlanTripInput, "graph">;

export interface Composition {
  readonly locationRepository: LocationRepository;
  readonly waypoints: readonly Waypoint[];
  planRoute(fromSlug: string, toSlug: string): PlannedRoute | null;
  planTrip(input: TripRequest): TripDay[];
  candidatesForDay(input: TripRequest, dayNumber: number): DestinationCandidate[];
}

/**
 * Pure factory — no globals, no fs access. Client components build this
 * once from the `Location[]` / `RouteEdge[]` / `Waypoint[]` handed down
 * from a server component that read them via `loadDataset()`.
 */
export const createComposition = (
  locations: readonly Location[],
  edges: readonly RouteEdge[],
  waypoints: readonly Waypoint[]
): Composition => {
  const locationRepository = new InMemoryLocationRepository(locations);
  const graph: RouteGraph = buildRouteGraph(edges);

  return {
    locationRepository,
    waypoints,
    planRoute: (fromSlug, toSlug) => findRoute(graph, fromSlug, toSlug),
    planTrip: (input) => planTrip({ ...input, graph }),
    candidatesForDay: (input, dayNumber) => candidatesForDay({ ...input, graph }, dayNumber),
  };
};
