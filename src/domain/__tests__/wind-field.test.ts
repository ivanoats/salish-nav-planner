import { describe, expect, it } from "vitest";
import { createWindField, EMPTY_WIND_FIELD, type ZoneWindForecast } from "../wind-field";
import type { WindZone } from "../wind-zone";

const zones: WindZone[] = [
  { id: "sound", name: "Puget Sound", lat: 47.58, lon: -122.45 },
  { id: "juans", name: "San Juan Islands", lat: 48.6, lon: -122.95 },
];

const day = (date: string, speedKnots: number, fromDegrees: number) => ({
  date,
  speedKnots,
  gustKnots: speedKnots + 5,
  fromDegrees,
  weatherCode: null,
  precipitationChance: null,
});

const forecasts: ZoneWindForecast[] = [
  { zoneId: "sound", days: [day("2026-08-15", 10, 180), day("2026-08-16", 20, 225)] },
  { zoneId: "juans", days: [day("2026-08-15", 15, 90)] },
];

describe("createWindField", () => {
  const field = createWindField(zones, forecasts);

  it("answers with the wind for the zone a point falls in", () => {
    expect(field.windAt({ lat: 47.6775, lon: -122.4112 }, "2026-08-15")?.speedKnots).toBe(10);
    expect(field.windAt({ lat: 48.5344, lon: -123.0139 }, "2026-08-15")?.speedKnots).toBe(15);
  });

  it("keeps the days apart", () => {
    expect(field.windAt({ lat: 47.6775, lon: -122.4112 }, "2026-08-16")?.fromDegrees).toBe(225);
  });

  it("returns null past the end of a zone's forecast", () => {
    // The San Juans only have one day; the second is beyond the horizon.
    expect(field.windAt({ lat: 48.5344, lon: -123.0139 }, "2026-08-16")).toBeNull();
  });

  it("returns null for a date nobody forecast", () => {
    expect(field.windAt({ lat: 47.6775, lon: -122.4112 }, "2026-09-30")).toBeNull();
  });

  it("reports whether it holds anything at all", () => {
    expect(field.hasData).toBe(true);
    expect(createWindField(zones, []).hasData).toBe(false);
    expect(createWindField(zones, [{ zoneId: "sound", days: [] }]).hasData).toBe(false);
  });

  it("returns null for a zone that came back empty", () => {
    const sparse = createWindField(zones, [{ zoneId: "juans", days: [day("2026-08-15", 15, 90)] }]);
    expect(sparse.windAt({ lat: 47.6775, lon: -122.4112 }, "2026-08-15")).toBeNull();
  });

  it("has nowhere to look when there are no zones", () => {
    expect(createWindField([], forecasts).windAt({ lat: 47.6, lon: -122.4 }, "2026-08-15")).toBeNull();
  });
});

describe("EMPTY_WIND_FIELD", () => {
  it("knows nothing and says so", () => {
    expect(EMPTY_WIND_FIELD.hasData).toBe(false);
    expect(EMPTY_WIND_FIELD.windAt({ lat: 47.6, lon: -122.4 }, "2026-08-15")).toBeNull();
  });
});
