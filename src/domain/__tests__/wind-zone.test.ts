import { describe, expect, it } from "vitest";
import { nearestZone, type WindZone } from "../wind-zone";

const zones: WindZone[] = [
  { id: "central-sound", name: "Central Puget Sound", lat: 47.58, lon: -122.45 },
  { id: "san-juans", name: "San Juan Islands", lat: 48.6, lon: -122.95 },
  { id: "georgia-south", name: "Southern Strait of Georgia", lat: 49.1, lon: -123.5 },
];

describe("nearestZone", () => {
  it("puts a stop in the zone whose sample point is closest", () => {
    // Shilshole.
    expect(nearestZone({ lat: 47.6775, lon: -122.4112 }, zones)?.id).toBe("central-sound");
    // Friday Harbor.
    expect(nearestZone({ lat: 48.5344, lon: -123.0139 }, zones)?.id).toBe("san-juans");
    // Nanaimo.
    expect(nearestZone({ lat: 49.1667, lon: -123.9333 }, zones)?.id).toBe("georgia-south");
  });

  it("measures in real distance, not raw degrees", () => {
    // A degree of longitude is only ~40nm up here, so comparing lat and
    // lon deltas directly would pick the wrong zone for this point.
    expect(nearestZone({ lat: 48.55, lon: -123.6 }, zones)?.id).toBe("san-juans");
  });

  it("has nothing to return when there are no zones", () => {
    expect(nearestZone({ lat: 48, lon: -123 }, [])).toBeNull();
  });

  it("returns the only zone regardless of how far off it is", () => {
    expect(nearestZone({ lat: 20, lon: -100 }, [zones[0]!])?.id).toBe("central-sound");
  });
});
