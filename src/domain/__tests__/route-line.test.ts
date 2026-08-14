import { describe, expect, it } from "vitest";
import { buildRouteLineCoordinates } from "../route-line";
import type { Location, Waypoint } from "../location";
import type { PlannedRoute } from "../route";

const shilshole: Location = {
  slug: "shilshole",
  name: "Shilshole Bay, Seattle",
  region: "US",
  lat: 47.6775,
  lon: -122.4112,
};
const anacortes: Location = {
  slug: "anacortes",
  name: "Anacortes, Fidalgo Island",
  region: "US",
  lat: 48.5126,
  lon: -122.6127,
};
const friday: Location = {
  slug: "friday",
  name: "Friday Harbor, San Juan Is.",
  region: "US",
  lat: 48.5347,
  lon: -123.0128,
};

const locationsBySlug = new Map(
  [shilshole, anacortes, friday].map((l) => [l.slug, l] as const)
);

const deceptionPass: Waypoint = { name: "Deception Pass", lat: 48.4064, lon: -122.6428 };

describe("buildRouteLineCoordinates", () => {
  it("builds a straight 2-point line for a direct leg with no via", () => {
    const route: PlannedRoute = {
      legs: [{ from: "shilshole", to: "friday", nm: 60, hrMin: "8:34", via: [] }],
      totalNm: 60,
      totalHrMin: "8:34",
    };
    const coords = buildRouteLineCoordinates(route, locationsBySlug, []);
    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [friday.lon, friday.lat],
    ]);
  });

  it("bends through a resolved via-waypoint", () => {
    const route: PlannedRoute = {
      legs: [
        { from: "shilshole", to: "friday", nm: 72.2, hrMin: "10:19", via: ["Deception Pass"] },
      ],
      totalNm: 72.2,
      totalHrMin: "10:19",
    };
    const coords = buildRouteLineCoordinates(route, locationsBySlug, [deceptionPass]);
    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [deceptionPass.lon, deceptionPass.lat],
      [friday.lon, friday.lat],
    ]);
  });

  it("collapses the shared point between consecutive legs", () => {
    const route: PlannedRoute = {
      legs: [
        { from: "shilshole", to: "anacortes", nm: 59.1, hrMin: "8:32", via: [] },
        { from: "anacortes", to: "friday", nm: 20, hrMin: "2:52", via: [] },
      ],
      totalNm: 79.1,
      totalHrMin: "11:24",
    };
    const coords = buildRouteLineCoordinates(route, locationsBySlug, []);
    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [anacortes.lon, anacortes.lat],
      [friday.lon, friday.lat],
    ]);
  });

  it("skips a leg whose endpoints aren't in the location map", () => {
    const route: PlannedRoute = {
      legs: [{ from: "shilshole", to: "nowhere", nm: 10, hrMin: "1:00", via: [] }],
      totalNm: 10,
      totalHrMin: "1:00",
    };
    const coords = buildRouteLineCoordinates(route, locationsBySlug, []);
    expect(coords).toEqual([]);
  });
});
