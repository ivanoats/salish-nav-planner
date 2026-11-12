import { describe, expect, it } from "vitest";
import { formatClock } from "@/domain/clock";
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

// Freeze the original wire format as a compatibility and size baseline.
const legacyQuery = (state: SharedTripState) => new URLSearchParams({
  v: "1",
  days: String(state.days),
  "min-hours": String(state.minHours),
  "max-hours": String(state.maxHours),
  speed: String(state.speedKnots),
  start: state.startSlug,
  first: state.firstDestinationSlug,
  date: state.startDate,
  depart: formatClock(state.departureMinutes),
  mast: String(state.mastHeightFeet),
  wind: state.windAware ? "1" : "0",
  round: state.roundTrip ? "1" : "0",
  end: state.customEndSlug ?? "-",
  stops: state.stopSlugs.join(","),
  pins: state.pinnedDays.join(",") || "-",
});

const sizeFixtures = [
  {
    name: "one day",
    stops: ["anacortes", "deer_harbor"],
    pins: [],
    end: null,
    roundTrip: false,
  },
  {
    name: "three days with a pin and custom end",
    stops: ["anacortes", "deer_harbor", "port_townsend", "port_ludlow"],
    pins: [2],
    end: "port_ludlow",
    roundTrip: false,
  },
  {
    name: "seven-day round trip with pins",
    stops: ["anacortes", "deer_harbor", "bellingham", "la_conner", "oak_harbor",
      "port_townsend", "port_ludlow", "anacortes"],
    pins: [2, 4, 6],
    end: null,
    roundTrip: true,
  },
] as const;

describe("shareable trip URL codec", () => {
  it("round-trips every planner setting in a stable compact format", () => {
    const query = encodeSharedTrip(sharedTrip);

    expect(query.toString()).toBe(
      "v=2&s=home.first-stop.pinned-stop.custom-end&d=2026-08-24&t=510" +
        "&a=3&b=8&k=6.5&m=50&w=1&e=custom-end&p=2"
    );
    expect(decodeSharedTrip(query, knownSlugs)).toEqual({
      state: sharedTrip,
      issues: [],
      hasSharedTrip: true,
    });
  });

  it.each(sizeFixtures)("preserves $name with a query at least 40% shorter", (fixture) => {
    const [startSlug, firstDestinationSlug] = fixture.stops;
    const state: SharedTripState = {
      ...sharedTrip,
      days: fixture.stops.length - 1,
      startSlug,
      firstDestinationSlug,
      roundTrip: fixture.roundTrip,
      customEndSlug: fixture.end,
      stopSlugs: fixture.stops,
      pinnedDays: fixture.pins,
    };
    const locations = new Set<string>(fixture.stops);
    const legacy = legacyQuery(state);
    const compact = encodeSharedTrip(state);

    expect(decodeSharedTrip(legacy, locations).state).toEqual(state);
    expect(decodeSharedTrip(compact, locations).state).toEqual(state);
    expect(compact.toString().length).toBeLessThanOrEqual(legacy.toString().length * 0.6);
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
    const duplicateParameter = legacyQuery(sharedTrip);
    duplicateParameter.append("days", "3");
    expect(decodeSharedTrip(duplicateParameter, knownSlugs).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-parameter", parameter: "days" }),
      ])
    );

    const inconsistentStops = legacyQuery(sharedTrip);
    inconsistentStops.set("stops", "home,first-stop,first-stop,custom-end");
    expect(decodeSharedTrip(inconsistentStops, knownSlugs).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "inconsistent-stops", parameter: "stops" }),
      ])
    );
  });

  it.each([
    ["s", "home.first-stop.unknown.custom-end", "unknown-location"],
    ["s", "home.first-stop.first-stop.custom-end", "inconsistent-stops"],
    ["t", "1440", "invalid-value"],
    ["d", "2026-02-30", "invalid-value"],
    ["p", "3", "invalid-value"],
  ])("rejects malformed compact field %s=%s", (field, value, code) => {
    const query = encodeSharedTrip(sharedTrip);
    query.set(field, value);
    expect(decodeSharedTrip(query, knownSlugs)).toMatchObject({
      state: null,
      issues: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it("rejects missing fields and duplicate optional compact fields", () => {
    const query = encodeSharedTrip(sharedTrip);
    query.delete("d");
    query.append("p", "2");
    expect(decodeSharedTrip(query, knownSlugs)).toMatchObject({
      state: null,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "missing-parameter", parameter: "d" }),
        expect.objectContaining({ code: "duplicate-parameter", parameter: "p" }),
      ]),
    });
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
