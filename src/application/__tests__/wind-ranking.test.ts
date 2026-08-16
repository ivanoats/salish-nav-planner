import { describe, expect, it } from "vitest";
import { buildRouteGraph, rankNextDestinations, type WindRankingContext } from "../route-graph";
import { WIND_PENALTY_WEIGHT } from "@/domain/wind";
import type { Coordinates } from "@/domain/location";
import type { RouteEdge } from "@/domain/route";
import type { Wind } from "@/domain/wind";

const edge = (from: string, to: string, nm: number): RouteEdge => ({
  from,
  to,
  nm,
  hrMin: "0:00",
  via: [],
  routeUrl: "",
});

const ORIGIN: Coordinates = { lat: 48, lon: -123 };

/**
 * Two stops the same distance from the origin, in opposite directions:
 * one dead upwind in a southwesterly, one dead downwind.
 */
const coordinatesBySlug = new Map<string, Coordinates>([
  ["origin", ORIGIN],
  ["upwind", { lat: 47.65, lon: -123.52 }],
  ["downwind", { lat: 48.35, lon: -122.47 }],
]);

const graph = buildRouteGraph([edge("origin", "upwind", 30), edge("origin", "downwind", 30)]);

const range = { minNm: 10, maxNm: 50 };

const windContext = (wind: Wind): WindRankingContext => ({
  originCoordinates: ORIGIN,
  coordinatesBySlug,
  windAt: () => wind,
  weight: WIND_PENALTY_WEIGHT,
});

describe("rankNextDestinations with wind", () => {
  it("leaves the ranking alone when no wind context is given", () => {
    const ranked = rankNextDestinations(graph, "origin", { range });
    // Equal distance, so the alphabetical tiebreak decides.
    expect(ranked.map((c) => c.slug)).toEqual(["downwind", "upwind"]);
  });

  it("prefers the downwind stop over the upwind one in a blow", () => {
    const ranked = rankNextDestinations(graph, "origin", {
      range,
      wind: windContext({ speedKnots: 30, gustKnots: 38, fromDegrees: 225 }),
    });

    expect(ranked[0]?.slug).toBe("downwind");
  });

  it("does not care which way you go in light air", () => {
    const calm = rankNextDestinations(graph, "origin", {
      range,
      wind: windContext({ speedKnots: 6, gustKnots: 8, fromDegrees: 225 }),
    });
    const none = rankNextDestinations(graph, "origin", { range });

    expect(calm.map((c) => c.slug)).toEqual(none.map((c) => c.slug));
  });

  it("still refuses stops outside the day-length window, whatever the wind", () => {
    const ranked = rankNextDestinations(graph, "origin", {
      range: { minNm: 40, maxNm: 50 },
      wind: windContext({ speedKnots: 30, gustKnots: 38, fromDegrees: 225 }),
    });

    expect(ranked).toEqual([]);
  });

  it("ignores wind for a candidate whose position it doesn't know", () => {
    const ranked = rankNextDestinations(graph, "origin", {
      range,
      wind: {
        ...windContext({ speedKnots: 30, gustKnots: 38, fromDegrees: 225 }),
        coordinatesBySlug: new Map([["origin", ORIGIN]]),
      },
    });

    // With no coordinates to take a bearing from, both fall back to the
    // distance-only ordering rather than being arbitrarily penalised.
    expect(ranked.map((c) => c.slug)).toEqual(["downwind", "upwind"]);
  });

  it("falls back to distance alone past the forecast horizon", () => {
    const ranked = rankNextDestinations(graph, "origin", {
      range,
      wind: {
        originCoordinates: ORIGIN,
        coordinatesBySlug,
        windAt: () => null,
        weight: WIND_PENALTY_WEIGHT,
      },
    });

    expect(ranked.map((c) => c.slug)).toEqual(["downwind", "upwind"]);
  });

  it("will not send you somewhere absurd just to avoid a beat", () => {
    // A 2nm hop is a non-day. Even in a gale the length term has to keep
    // it out of the running against a proper 30nm passage.
    const withStub = buildRouteGraph([
      edge("origin", "upwind", 30),
      edge("origin", "downwind", 30),
      edge("origin", "stub", 2),
    ]);
    coordinatesBySlug.set("stub", { lat: 48.02, lon: -123.02 });

    const ranked = rankNextDestinations(withStub, "origin", {
      range: { minNm: 1, maxNm: 50 },
      wind: windContext({ speedKnots: 40, gustKnots: 50, fromDegrees: 225 }),
    });

    expect(ranked[0]?.slug).not.toBe("stub");
  });
});
