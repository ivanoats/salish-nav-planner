import { describe, expect, it } from "vitest";
import {
  decodeSharedTrip,
  encodeSharedTrip,
  searchParamsFromRecord,
  type SharedTripState,
} from "../shareable-trip-url";

const knownSlugs = new Set(["home", "first-stop", "auto-stop", "pinned-stop", "custom-end"]);

const sharedTrip: SharedTripState = {
  version: 1,
  days: 3,
  minHours: 3,
  maxHours: 8,
  speedKnots: 6.5,
  startSlug: "home",
  firstDestinationSlug: "first-stop",
  startDate: "2026-08-24",
  departureMinutes: 510,
  mastHeightFeet: 50,
  windAware: true,
  roundTrip: false,
  customEndSlug: "custom-end",
  stopSlugs: ["home", "first-stop", "pinned-stop", "custom-end"],
  pinnedDays: [2],
};

describe("shareable trip URL codec", () => {
  it("round-trips every planner setting in one stable readable order", () => {
    const query = encodeSharedTrip(sharedTrip);

    expect(query.toString()).toBe(
      "v=1&days=3&min-hours=3&max-hours=8&speed=6.5&start=home&first=first-stop" +
        "&date=2026-08-24&depart=08%3A30&mast=50&wind=1&round=0&end=custom-end" +
        "&stops=home%2Cfirst-stop%2Cpinned-stop%2Ccustom-end&pins=2"
    );
    expect(decodeSharedTrip(query, knownSlugs)).toEqual({
      state: sharedTrip,
      issues: [],
      hasSharedTrip: true,
    });
  });

  it("distinguishes a normal URL from a malformed shared URL", () => {
    for (const query of ["utm_source=friend", "date=2026-08-24&start=home&days=3"]) {
      expect(decodeSharedTrip(new URLSearchParams(query), knownSlugs)).toEqual({
        state: null,
        issues: [],
        hasSharedTrip: false,
      });
    }

    const malformed = decodeSharedTrip(
      new URLSearchParams("v=99&days=3&start=missing"),
      knownSlugs
    );
    expect(malformed.state).toBeNull();
    expect(malformed.hasSharedTrip).toBe(true);
    expect(malformed.issues.map((item) => item.code)).toContain("unsupported-version");
    expect(malformed.issues.map((item) => item.code)).toContain("unknown-location");
    expect(malformed.issues.map((item) => item.code)).toContain("missing-parameter");
  });

  it("rejects duplicate parameters and inconsistent or duplicate stops", () => {
    const duplicateParameter = encodeSharedTrip(sharedTrip);
    duplicateParameter.append("days", "3");
    expect(decodeSharedTrip(duplicateParameter, knownSlugs).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-parameter", parameter: "days" }),
      ])
    );

    const inconsistentStops = encodeSharedTrip(sharedTrip);
    inconsistentStops.set("stops", "home,first-stop,first-stop,custom-end");
    expect(decodeSharedTrip(inconsistentStops, knownSlugs).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "inconsistent-stops", parameter: "stops" }),
      ])
    );
  });

  it("accepts the start only as the final repeated stop of a round trip", () => {
    const roundTrip: SharedTripState = {
      ...sharedTrip,
      roundTrip: true,
      customEndSlug: null,
      stopSlugs: ["home", "first-stop", "auto-stop", "home"],
      pinnedDays: [],
    };

    expect(decodeSharedTrip(encodeSharedTrip(roundTrip), knownSlugs)).toEqual({
      state: roundTrip,
      issues: [],
      hasSharedTrip: true,
    });
  });

  it("preserves repeated server search parameters so duplicates are visible", () => {
    const query = searchParamsFromRecord({ v: ["1", "2"], days: "3" });
    expect(query.getAll("v")).toEqual(["1", "2"]);
  });
});
