import { describe, expect, it } from "vitest";
import { buildRouteGraph, findRoute, rankNextDestinations } from "../route-graph";
import type { Location, Waypoint } from "@/domain/location";
import { AIR_DRAFT_MARGIN_FEET, type Obstruction } from "@/domain/obstruction";
import type { RouteEdge } from "@/domain/route";

const edge = (from: string, to: string, nm: number, via: string[] = []): RouteEdge => ({
  from,
  to,
  nm,
  hrMin: "0:00",
  via,
  routeUrl: "",
});

const location = (slug: string, lat: number, lon: number): Location => ({
  slug,
  name: slug,
  region: "US",
  lat,
  lon,
});

/**
 * The Port Townsend Canal problem in miniature, with coherent geometry:
 * a 9 nm channel due north with a bridge across the middle of it, and a
 * 24 nm way round through open water to the east.
 */
const locations: Location[] = [
  location("south", 48.0, -122.75),
  location("north", 48.15, -122.75),
  location("around", 48.075, -122.5),
  location("bayhead", 48.14, -122.74),
];

const BRIDGE_AT = { lat: 48.075, lon: -122.75 };

const edges: RouteEdge[] = [
  edge("south", "north", 9),
  edge("south", "around", 12),
  edge("around", "north", 12),
];

const lowBridge: Obstruction = {
  id: "low-bridge",
  name: "Low Bridge",
  ...BRIDGE_AT,
  clearanceFeet: 58,
  opens: false,
};

const openingBridge: Obstruction = { ...lowBridge, id: "opening-bridge", opens: true };

const waypoints: Waypoint[] = [{ name: "Low Bridge", ...BRIDGE_AT }];

const graphWith = (obstructions: Obstruction[], extra: RouteEdge[] = []) =>
  buildRouteGraph([...edges, ...extra], { locations, waypoints, obstructions });

const obstructionsOn = (
  graph: ReturnType<typeof buildRouteGraph>,
  from: string,
  to: string
): readonly string[] =>
  (graph.adjacency.get(from) ?? []).find((e) => e.to === to)?.obstructionIds ?? [];

describe("air draft and fixed spans", () => {
  it("takes the short way under the bridge when the rig fits", () => {
    expect(findRoute(graphWith([lowBridge]), "south", "north", 40)?.totalNm).toBe(9);
  });

  it("goes the long way round when it does not", () => {
    const route = findRoute(graphWith([lowBridge]), "south", "north", 60);
    expect(route?.totalNm).toBe(24);
    expect(route?.legs.map((l) => l.to)).toEqual(["around", "north"]);
  });

  it("counts masthead gear against the clearance", () => {
    // Bare mast height alone would send both of these under the span. The
    // taller one clears the stated 58ft and is still turned back, because
    // the margin for antenna and windvane goes on top of it.
    const tallestThatFits = lowBridge.clearanceFeet - AIR_DRAFT_MARGIN_FEET;
    expect(
      findRoute(graphWith([lowBridge]), "south", "north", tallestThatFits + 1)?.totalNm
    ).toBe(24);
    expect(findRoute(graphWith([lowBridge]), "south", "north", tallestThatFits)?.totalNm).toBe(9);
  });

  it("ignores clearance entirely when no mast height is given", () => {
    expect(findRoute(graphWith([lowBridge]), "south", "north")?.totalNm).toBe(9);
  });

  it("still goes under an opening bridge, however tall the rig", () => {
    // You wait and call on the radio; you don't sail 15 extra miles.
    expect(findRoute(graphWith([openingBridge]), "south", "north", 90)?.totalNm).toBe(9);
  });

  it("records the bridges a leg passes under", () => {
    const route = findRoute(graphWith([lowBridge]), "south", "north", 40);
    expect(route?.legs[0]?.obstructionIds).toEqual(["low-bridge"]);
  });

  it("leaves hops nowhere near a bridge alone", () => {
    expect(obstructionsOn(graphWith([lowBridge]), "south", "around")).toEqual([]);
  });
});

describe("deciding whether a hop really goes under a bridge", () => {
  it("trusts the route table naming it, whatever the geometry says", () => {
    const faraway: Obstruction = { ...lowBridge, lat: 47.0, lon: -122.0 };
    const graph = graphWith([faraway], [edge("south", "bayhead", 9, ["Low Bridge"])]);
    expect(obstructionsOn(graph, "south", "bayhead")).toEqual(["low-bridge"]);
  });

  it("accepts a hop whose mileage matches a path through the bridge", () => {
    // 9nm published against 9nm through the span — it went that way.
    expect(obstructionsOn(graphWith([lowBridge]), "south", "north")).toEqual(["low-bridge"]);
  });

  it("rejects a hop far too long to have used the bridge", () => {
    // Passes right by it on the drawn line, but 30nm of water says the
    // boat went round something instead — the Port Townsend to Poulsbo
    // case, which really runs the long way via Agate Passage.
    const graph = graphWith([lowBridge], [edge("south", "bayhead", 30)]);
    expect(obstructionsOn(graph, "south", "bayhead")).toEqual([]);
  });

  it("rejects a hop shorter than going through the bridge would take", () => {
    // Under the great-circle lower bound, so it cannot have gone that
    // way — Port Hadlock to Port Townsend, which runs up the bay.
    const graph = graphWith([lowBridge], [edge("south", "bayhead", 4)]);
    expect(obstructionsOn(graph, "south", "bayhead")).toEqual([]);
  });
});

describe("ranking with a fixed span in the way", () => {
  const range = { minNm: 1, maxNm: 15 };

  it("drops a destination only reachable under a bridge you cannot clear", () => {
    const ranked = rankNextDestinations(graphWith([lowBridge]), "south", {
      range,
      mastHeightFeet: 60,
    });
    expect(ranked.map((c) => c.slug)).not.toContain("north");
  });

  it("keeps it when the rig fits", () => {
    const ranked = rankNextDestinations(graphWith([lowBridge]), "south", {
      range,
      mastHeightFeet: 40,
    });
    expect(ranked.map((c) => c.slug)).toContain("north");
  });

  it("measures the detour, not the shortcut, when ranking a taller rig", () => {
    const ranked = rankNextDestinations(graphWith([lowBridge]), "south", {
      range: { minNm: 1, maxNm: 40 },
      mastHeightFeet: 60,
    });
    // Reaching "north" now costs the whole way round, and the ranking
    // has to see that distance rather than the blocked 9nm hop.
    expect(ranked.find((c) => c.slug === "north")?.nm).toBe(24);
  });
});
