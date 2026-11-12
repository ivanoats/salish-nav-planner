import { describe, expect, it } from "vitest";
import { createComposition } from "@/composition-root";
import { buildMeshGraph } from "@/domain/mesh-route";
import type { Location } from "@/domain/location";
import type { TidalPass } from "@/domain/pass";
import type { RouteEdge } from "@/domain/route";
import type { LonLat } from "@/domain/route-line";

const harbour = (slug: string, [lon, lat]: LonLat): Location =>
  ({ slug, name: slug, region: "US", lat, lon });

const edge = (from: string, to: string, nm: number, via: string[] = []): RouteEdge =>
  ({ from, to, nm, via, hrMin: "1:00", routeUrl: "" });

const mesh = (...paths: LonLat[][]) => buildMeshGraph({
  features: paths.map((coordinates) => ({
    properties: {},
    geometry: { type: "LineString", coordinates },
  })),
});

const input = {
  startSlug: "a",
  firstDestinationSlug: "b",
  endSlug: null,
  days: 1,
  range: { minNm: 0, maxNm: 100 },
  overrides: new Map<number, string>(),
};

const departurePoint: LonLat = [-123, 48];
const destinationPoint: LonLat = [-123, 48.4];
const passPoint: LonLat = [-123.16, 48.1];
const namedPass: TidalPass = {
  id: "narrows",
  name: "Test Narrows",
  lon: passPoint[0],
  lat: passPoint[1],
  station: { source: "noaa", id: "test" },
  stationName: "Test station",
  floodDirectionDegrees: 0,
  maxKnots: 4,
};

describe("route geometry and planning agree", () => {
  const composition = createComposition({
    locations: [harbour("a", departurePoint), harbour("b", destinationPoint)],
    edges: [edge("a", "b", 24, [namedPass.name])],
    waypoints: [namedPass],
    passes: [namedPass],
    windZones: [],
    obstructions: [],
  });

  it("times a named pass on the mesh line shown for the same leg", () => {
    const approach: LonLat = [-123.16, 48.05];
    const tripDays = composition.planTrip(
      input,
      mesh([departurePoint, approach, passPoint, destinationPoint])
    );
    const [day] = tripDays;

    expect(day?.route?.legs[0]?.track).toEqual({
      source: "mesh",
      coordinates: [departurePoint, approach, passPoint, destinationPoint],
    });
    const [timing] = composition.passTransits({
      tripDays, startDate: "2026-11-11", departureMinutes: 480, speedKnots: 6,
    });
    expect(timing?.transits[0]).toMatchObject({ detection: "named", offRouteNm: 0 });
    expect(timing?.transits[0]?.courseDegrees).toBeCloseTo(0, 0);
    expect(timing?.transits[0]?.etaMinutes).toBeCloseTo(563, 0);
  });

  it("marks the waypoint fallback when the mesh misses a named pass", () => {
    const [day] = composition.planTrip(input, mesh([departurePoint, destinationPoint]));
    expect(day?.route?.legs[0]?.track).toEqual({
      source: "approximate",
      coordinates: [departurePoint, passPoint, destinationPoint],
    });
  });

  it("keeps the waypoint track when the destination is outside the mesh", () => {
    const [day] = composition.planTrip(input, mesh([departurePoint, passPoint]));
    expect(day?.route?.legs[0]?.track).toEqual({
      source: "approximate",
      coordinates: [departurePoint, passPoint, destinationPoint],
    });
  });

  it("accepts a Swinomish Channel corridor mesh track instead of checking its distant anchor", () => {
    const corridor: LonLat[] = [
      [-122.4955, 48.3925],
      [-122.5015, 48.4056],
      [-122.506, 48.4198],
      [-122.5088, 48.4338],
    ];
    const start: LonLat = [-122.49, 48.39];
    const end: LonLat = [-122.51, 48.44];
    const channel = {
      name: "Swinomish Channel",
      lat: 48.42,
      lon: -122.5378,
      corridor: corridor.map(([lon, lat]) => ({ lon, lat })),
    };
    const planner = createComposition({
      locations: [harbour("start", start), harbour("end", end)],
      edges: [edge("start", "end", 24, [channel.name])],
      waypoints: [channel],
      passes: [],
      windZones: [],
      obstructions: [],
    });

    const [day] = planner.planTrip(
      { ...input, startSlug: "start", firstDestinationSlug: "end" },
      mesh([start, ...corridor, end])
    );

    expect(day?.route?.legs[0]?.track).toEqual({
      source: "mesh",
      coordinates: [start, ...corridor, end],
    });
  });

  it("keeps a tall rig's plotted detour away from a bridge excluded by the graph", () => {
    const detour: LonLat = [-123.2, 48.3];
    const bridgePoint: LonLat = [-123, 48.2];
    const bridge = {
      id: "fixed-span", name: "Fixed Span", lon: bridgePoint[0], lat: bridgePoint[1],
      clearanceFeet: 50, opens: false,
    };
    const planner = createComposition({
      locations: [
        harbour("a", departurePoint),
        harbour("b", destinationPoint),
        harbour("detour", detour),
      ],
      edges: [edge("a", "b", 24, [bridge.name]), edge("a", "detour", 24), edge("detour", "b", 12)],
      waypoints: [],
      passes: [],
      windZones: [],
      obstructions: [bridge],
    });
    const water = mesh(
      [departurePoint, bridgePoint, destinationPoint],
      [bridgePoint, detour],
      [detour, destinationPoint]
    );
    const [day] = planner.planTrip({ ...input, mastHeightFeet: 55 }, water);

    expect(day?.route?.totalNm).toBe(36);
    expect(day?.route?.legs.map((leg) => leg.track)).toEqual([
      { source: "approximate", coordinates: [departurePoint, detour] },
      { source: "mesh", coordinates: [detour, destinationPoint] },
    ]);
  });
});
