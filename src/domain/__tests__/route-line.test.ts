import { describe, expect, it } from "vitest";
import { buildDisplayedRouteLineCoordinates, buildRouteLineCoordinates } from "../route-line";
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
const deceptionPassWithCorridor: Waypoint = {
  ...deceptionPass,
  corridor: [
    { lat: 48.3995, lon: -122.6468 },
    { lat: 48.4042, lon: -122.6442 },
    { lat: 48.4099, lon: -122.6371 },
  ],
};

/** South of Deception Pass, so the two have a clear north-south order. */
const admiraltyInlet: Waypoint = { name: "Admiralty Inlet", lat: 48.16, lon: -122.72 };

describe("via ordering", () => {
  // The route tables name a passage the same way whichever way you transit
  // it, so one direction of a pair arrives listed backwards. Drawing that
  // order sends the line up past both passages and back down again — and
  // pass ETAs scale distance along this polyline, so the doubled length
  // halves every distance read off it.
  const northbound: PlannedRoute = {
    legs: [
      {
        from: "shilshole",
        to: "friday",
        nm: 72.2,
        hrMin: "10:19",
        via: ["Deception Pass", "Admiralty Inlet"],
      },
    ],
    totalNm: 72.2,
    totalHrMin: "10:19",
  };

  it("sorts via notes into travel order rather than trusting how they're listed", () => {
    const coords = buildRouteLineCoordinates(northbound, locationsBySlug, [
      deceptionPass,
      admiraltyInlet,
    ]);

    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [admiraltyInlet.lon, admiraltyInlet.lat],
      [deceptionPass.lon, deceptionPass.lat],
      [friday.lon, friday.lat],
    ]);
  });

  it("orders them the other way round on the return leg", () => {
    const southbound: PlannedRoute = {
      legs: [
        {
          from: "friday",
          to: "shilshole",
          nm: 72.2,
          hrMin: "10:19",
          via: ["Admiralty Inlet", "Deception Pass"],
        },
      ],
      totalNm: 72.2,
      totalHrMin: "10:19",
    };

    const coords = buildRouteLineCoordinates(southbound, locationsBySlug, [
      deceptionPass,
      admiraltyInlet,
    ]);

    expect(coords).toEqual([
      [friday.lon, friday.lat],
      [deceptionPass.lon, deceptionPass.lat],
      [admiraltyInlet.lon, admiraltyInlet.lat],
      [shilshole.lon, shilshole.lat],
    ]);
  });

  it("keeps the drawn line from doubling back past the far passage", () => {
    // The failure this guards: listed order drew Shilshole up to Deception
    // Pass, back south to Admiralty, then north again to Friday Harbor.
    const lats = buildRouteLineCoordinates(northbound, locationsBySlug, [
      deceptionPass,
      admiraltyInlet,
    ]).map(([, lat]) => lat);

    expect(lats).toEqual([...lats].sort((a, b) => a - b));
  });
});

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

  it("keeps the anchor-only polyline when a waypoint also has a corridor", () => {
    const route: PlannedRoute = {
      legs: [
        { from: "shilshole", to: "friday", nm: 72.2, hrMin: "10:19", via: ["Deception Pass"] },
      ],
      totalNm: 72.2,
      totalHrMin: "10:19",
    };
    const coords = buildRouteLineCoordinates(route, locationsBySlug, [deceptionPassWithCorridor]);
    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [deceptionPass.lon, deceptionPass.lat],
      [friday.lon, friday.lat],
    ]);
  });

  it("expands a waypoint corridor when one is available for display", () => {
    const route: PlannedRoute = {
      legs: [
        { from: "shilshole", to: "friday", nm: 72.2, hrMin: "10:19", via: ["Deception Pass"] },
      ],
      totalNm: 72.2,
      totalHrMin: "10:19",
    };
    const coords = buildDisplayedRouteLineCoordinates(
      route,
      locationsBySlug,
      [deceptionPassWithCorridor]
    );
    expect(coords).toEqual([
      [shilshole.lon, shilshole.lat],
      [-122.6468, 48.3995],
      [-122.6442, 48.4042],
      [-122.6371, 48.4099],
      [friday.lon, friday.lat],
    ]);
  });

  it("reverses a corridor when the leg traverses it the opposite way for display", () => {
    const route: PlannedRoute = {
      legs: [
        { from: "friday", to: "shilshole", nm: 72.2, hrMin: "10:19", via: ["Deception Pass"] },
      ],
      totalNm: 72.2,
      totalHrMin: "10:19",
    };
    const coords = buildDisplayedRouteLineCoordinates(
      route,
      locationsBySlug,
      [deceptionPassWithCorridor]
    );
    expect(coords).toEqual([
      [friday.lon, friday.lat],
      [-122.6371, 48.4099],
      [-122.6442, 48.4042],
      [-122.6468, 48.3995],
      [shilshole.lon, shilshole.lat],
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

  it("falls back to a single representative point when a waypoint has no corridor", () => {
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
});
