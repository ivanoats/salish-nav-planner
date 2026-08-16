import { describe, expect, it } from "vitest";
import { passTransitsForDay } from "../pass-transit";
import type { Location, Waypoint } from "../location";
import type { TidalPass } from "../pass";
import type { PlannedRoute } from "../route";

const location = (slug: string, lat: number, lon: number): Location => ({
  slug,
  name: slug,
  region: "US",
  lat,
  lon,
});

// A due-north run of exactly one degree of latitude: 60nm, so distances
// along it are easy to reason about.
const locationsBySlug = new Map([
  ["south", location("south", 48, -123)],
  ["north", location("north", 49, -123)],
]);

const pass = (id: string, lat: number, lon: number, extra: Partial<TidalPass> = {}): TidalPass => ({
  id,
  name: id,
  lat,
  lon,
  station: { source: "noaa", id: `station-${id}` },
  stationName: `${id} station`,
  floodDirectionDegrees: 0,
  maxKnots: 5,
  ...extra,
});

const route = (via: string[] = []): PlannedRoute => ({
  legs: [{ from: "south", to: "north", nm: 60, hrMin: "10:00", via }],
  totalNm: 60,
  totalHrMin: "10:00",
});

const baseInput = {
  locationsBySlug,
  waypoints: [] as Waypoint[],
  departureMinutes: 8 * 60,
  speedKnots: 6,
};

describe("passTransitsForDay", () => {
  it("finds passes that sit on the track and times the arrival at each", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(),
      passes: [pass("quarter", 48.25, -123), pass("three-quarter", 48.75, -123)],
    });

    expect(transits.map((t) => t.pass.id)).toEqual(["quarter", "three-quarter"]);

    // A quarter of the way along 60nm is 15nm; at 6 knots that is 2h30
    // after an 08:00 departure.
    expect(transits[0]?.alongRouteNm).toBeCloseTo(15, 1);
    expect(transits[0]?.etaMinutes).toBeCloseTo(10 * 60 + 30, 0);

    expect(transits[1]?.alongRouteNm).toBeCloseTo(45, 1);
    expect(transits[1]?.etaMinutes).toBeCloseTo(15 * 60 + 30, 0);
  });

  it("orders passes by where they fall along the route, not by input order", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(),
      passes: [pass("late", 48.9, -123), pass("early", 48.1, -123)],
    });

    expect(transits.map((t) => t.pass.id)).toEqual(["early", "late"]);
  });

  it("ignores passes well off the track", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(),
      passes: [pass("elsewhere", 48.5, -124)],
    });

    expect(transits).toEqual([]);
  });

  it("trusts the route table's own via names over mere proximity", () => {
    // Sits 8nm off the drawn line, so proximity alone would miss it —
    // but the scraped route says the day goes through it.
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(["Narrow Gut"]),
      passes: [pass("narrow-gut", 48.5, -123.2, { name: "Narrow Gut" })],
    });

    expect(transits).toHaveLength(1);
    expect(transits[0]?.detection).toBe("named");
  });

  it("matches a via name through the pass's aliases", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(["Agate Pass"]),
      passes: [pass("agate", 48.5, -123.2, { name: "Agate Passage", aliases: ["Agate Pass"] })],
    });

    expect(transits).toHaveLength(1);
  });

  it("does not match a namesake on the other side of the cruising ground", () => {
    // There is a Hale Passage in the south Sound and another by Lummi.
    // A shared name is not enough to put one on a route near the other.
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(["Hale Passage"]),
      passes: [pass("hale-far", 47.3, -122.66, { name: "Hale Passage" })],
    });

    expect(transits).toEqual([]);
  });

  it("marks a pass found only by proximity as the weaker signal it is", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(),
      passes: [pass("on-the-way", 48.5, -123)],
    });

    expect(transits[0]?.detection).toBe("nearby");
  });

  it("reads the heading through the pass off the track", () => {
    const transits = passTransitsForDay({
      ...baseInput,
      route: route(),
      passes: [pass("quarter", 48.25, -123)],
    });

    expect(transits[0]?.courseDegrees).toBeCloseTo(0, 1);
  });

  it("has nothing to say about a day with no route", () => {
    expect(
      passTransitsForDay({
        ...baseInput,
        route: { legs: [], totalNm: 0, totalHrMin: "0:00" },
        passes: [pass("quarter", 48.25, -123)],
      })
    ).toEqual([]);
  });
});
