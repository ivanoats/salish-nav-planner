import { describe, expect, it } from "vitest";
import { resolveViaCoordinates } from "../via-resolution";
import type { Location, Waypoint } from "../location";

const locations: Location[] = [
  { slug: "shilshole", name: "Shilshole Bay, Seattle", region: "US", lat: 47.6775, lon: -122.4112 },
];

const waypoints: Waypoint[] = [
  { name: "Deception Pass", lat: 48.4064, lon: -122.6428 },
  { name: "Admiralty Inlet", lat: 48.15, lon: -122.75, aliases: ["Admiralty Inlet "] },
];

describe("resolveViaCoordinates", () => {
  it("resolves via names against curated waypoints", () => {
    const result = resolveViaCoordinates(["Deception Pass"], locations, waypoints);
    expect(result).toEqual([{ lat: 48.4064, lon: -122.6428 }]);
  });

  it("resolves via names against known locations when no waypoint matches", () => {
    const result = resolveViaCoordinates(
      ["Shilshole Bay, Seattle"],
      locations,
      waypoints
    );
    expect(result).toEqual([{ lat: 47.6775, lon: -122.4112 }]);
  });

  it("silently skips names that don't resolve to anything known", () => {
    const result = resolveViaCoordinates(["Some Unknown Cove"], locations, waypoints);
    expect(result).toEqual([]);
  });

  it("preserves listed order across mixed matches", () => {
    const result = resolveViaCoordinates(
      ["Admiralty Inlet", "Deception Pass"],
      locations,
      waypoints
    );
    expect(result).toEqual([
      { lat: 48.15, lon: -122.75 },
      { lat: 48.4064, lon: -122.6428 },
    ]);
  });
});
