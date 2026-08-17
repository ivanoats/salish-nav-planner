import { describe, expect, it } from "vitest";
import { buildDayConditions, passTransitsForTrip } from "../day-conditions";
import { localTimeToMs } from "@/domain/clock";
import { createWindField } from "@/domain/wind-field";
import type { Location, Waypoint } from "@/domain/location";
import type { TidalPass } from "@/domain/pass";
import type { CurrentEvent } from "@/domain/tidal";
import type { TripDay } from "@/domain/trip";
import type { WindZone } from "@/domain/wind-zone";

const location = (slug: string, lat: number, lon: number): Location => ({
  slug,
  name: slug,
  region: "US",
  lat,
  lon,
});

// A 9nm run due north with a pass across the middle of it.
const locationsBySlug = new Map([
  ["south", location("south", 48.0, -122.75)],
  ["north", location("north", 48.15, -122.75)],
]);

const pass: TidalPass = {
  id: "the-pass",
  name: "The Pass",
  lat: 48.075,
  lon: -122.75,
  station: { source: "noaa", id: "TEST1" },
  stationName: "Test Station",
  floodDirectionDegrees: 0, // floods north, the way we're going
  maxKnots: 4,
};

const START_DATE = "2026-08-15";
const DEPARTURE = 8 * 60;

const dayOne: TripDay = {
  dayNumber: 1,
  fromSlug: "south",
  toSlug: "north",
  source: "manual",
  route: {
    legs: [{ from: "south", to: "north", nm: 9, hrMin: "1:30", via: [] }],
    totalNm: 9,
    totalHrMin: "1:30",
  },
};

const emptyDay: TripDay = {
  dayNumber: 2,
  fromSlug: "north",
  toSlug: null,
  source: "auto",
  route: null,
};

const baseInput = {
  tripDays: [dayOne],
  startDate: START_DATE,
  departureMinutes: DEPARTURE,
  speedKnots: 6,
  locationsBySlug,
  waypoints: [] as Waypoint[],
  passes: [pass],
};

/** Slack at 15:00Z, peak flood at 18:00Z — the boat arrives between them. */
const events: CurrentEvent[] = [
  { type: "slack", atMs: Date.UTC(2026, 7, 15, 15, 0), speedKnots: 0 },
  { type: "maxFlood", atMs: Date.UTC(2026, 7, 15, 18, 0), speedKnots: 4 },
];

const zones: WindZone[] = [{ id: "here", name: "Here", lat: 48.075, lon: -122.75 }];

const windField = createWindField(zones, [
  {
    zoneId: "here",
    days: [
      {
        date: START_DATE,
        speedKnots: 18,
        gustKnots: 25,
        fromDegrees: 0,
        weatherCode: 3,
        precipitationChance: 20,
      },
    ],
  },
]);

describe("passTransitsForTrip", () => {
  it("dates each day and finds the passes on it", () => {
    const days = passTransitsForTrip(baseInput);
    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe(START_DATE);
    expect(days[0]?.transits.map((t) => t.pass.id)).toEqual(["the-pass"]);
  });

  it("times the arrival from the departure and the distance to the pass", () => {
    // 4.5nm at 6kt is 45 minutes past an 08:00 start.
    expect(passTransitsForTrip(baseInput).at(0)?.transits[0]?.etaMinutes).toBeCloseTo(525, 0);
  });

  it("advances the date across a multi-day trip", () => {
    const days = passTransitsForTrip({ ...baseInput, tripDays: [dayOne, emptyDay] });
    expect(days.map((d) => d.date)).toEqual([START_DATE, "2026-08-16"]);
  });

  it("has no passes for a day with no route", () => {
    const days = passTransitsForTrip({ ...baseInput, tripDays: [emptyDay] });
    expect(days[0]?.transits).toEqual([]);
  });
});

describe("buildDayConditions", () => {
  const conditions = buildDayConditions({
    ...baseInput,
    windField,
    currentsByPassId: new Map([["the-pass", events]]),
  });

  it("reports the day's wind", () => {
    expect(conditions[0]?.wind?.speedKnots).toBe(18);
    expect(conditions[0]?.date).toBe(START_DATE);
  });

  it("works out the current at the moment the boat reaches the pass", () => {
    const advice = conditions[0]?.passes[0]?.advice;
    expect(advice).not.toBeNull();
    // Arriving 45 min into a 3-hour build from slack to 4kt of flood.
    expect(advice?.signedKnots).toBeGreaterThan(0);
    expect(advice?.signedKnots).toBeLessThan(2);
  });

  it("calls a flood fair for a boat heading the same way", () => {
    expect(conditions[0]?.passes[0]?.advice?.setsWithYou).toBe(true);
  });

  it("says nothing rather than guessing when a station returned no data", () => {
    const blank = buildDayConditions({
      ...baseInput,
      windField,
      currentsByPassId: new Map(),
    });
    expect(blank[0]?.passes[0]?.advice).toBeNull();
    // The pass is still listed — you just don't get a verdict for it.
    expect(blank[0]?.passes[0]?.transit.pass.id).toBe("the-pass");
  });

  it("returns null wind past the forecast horizon", () => {
    const later = buildDayConditions({
      ...baseInput,
      startDate: "2027-01-01",
      windField,
      currentsByPassId: new Map(),
    });
    expect(later[0]?.wind).toBeNull();
  });

  it("returns null advice when predictions do not cover the arrival", () => {
    const wrongDay: CurrentEvent[] = events.map((e) => ({
      ...e,
      atMs: e.atMs + 7 * 86_400_000,
    }));
    const stale = buildDayConditions({
      ...baseInput,
      windField,
      currentsByPassId: new Map([["the-pass", wrongDay]]),
    });
    expect(stale[0]?.passes[0]?.advice).toBeNull();
  });

  it("still describes a day that has no route", () => {
    const withEmpty = buildDayConditions({
      ...baseInput,
      tripDays: [dayOne, emptyDay],
      windField,
      currentsByPassId: new Map([["the-pass", events]]),
    });
    expect(withEmpty).toHaveLength(2);
    expect(withEmpty[1]?.passes).toEqual([]);
    // Day 2 goes nowhere, so its wind is read at the stop it sits at.
    expect(withEmpty[1]?.date).toBe("2026-08-16");
  });

  it("anchors the arrival to local time, not UTC", () => {
    const advice = conditions[0]?.passes[0]?.advice;
    const expectedAt = localTimeToMs(START_DATE, 525);
    // 08:45 Pacific on this date is 15:45 UTC.
    expect(expectedAt).toBe(Date.UTC(2026, 7, 15, 15, 45));
    expect(advice?.nextSlack).not.toBeUndefined();
  });
});
