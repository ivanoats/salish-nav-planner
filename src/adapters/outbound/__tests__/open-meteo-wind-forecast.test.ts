import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoWindForecast } from "../open-meteo-wind-forecast";
import type { WindZone } from "@/domain/wind-zone";

const TODAY = "2026-08-15";

const zones: WindZone[] = [
  { id: "san-juans", name: "San Juan Islands", lat: 48.6, lon: -122.95 },
  { id: "georgia-south", name: "Southern Strait of Georgia", lat: 49.1, lon: -123.5 },
];

const daily = (dates: string[], overrides: Record<string, unknown> = {}) => ({
  daily: {
    time: dates,
    wind_speed_10m_max: dates.map(() => 12),
    wind_gusts_10m_max: dates.map(() => 20),
    wind_direction_10m_dominant: dates.map(() => 225),
    weather_code: dates.map(() => 3),
    precipitation_probability_max: dates.map(() => 40),
    ...overrides,
  },
});

const respondWith = (payload: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Too Many Requests",
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const provider = () => new OpenMeteoWindForecast(() => TODAY);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoWindForecast", () => {
  it("returns one forecast per zone, in the order asked for", async () => {
    respondWith([daily([TODAY, "2026-08-16"]), daily([TODAY, "2026-08-16"])]);

    const result = await provider().forecast({ zones, startDate: TODAY, days: 2 });

    expect(result.map((r) => r.zoneId)).toEqual(["san-juans", "georgia-south"]);
    expect(result[0]?.days).toHaveLength(2);
  });

  it("accepts the bare object Open-Meteo returns for a single coordinate", async () => {
    // The API switches shape rather than always returning an array.
    respondWith(daily([TODAY]));

    const result = await provider().forecast({
      zones: [zones[0]!],
      startDate: TODAY,
      days: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.days[0]?.speedKnots).toBe(12);
  });

  it("carries the model's values through unrounded", async () => {
    respondWith([daily([TODAY])]);

    const [zone] = await provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 1 });

    expect(zone?.days[0]).toMatchObject({
      date: TODAY,
      speedKnots: 12,
      gustKnots: 20,
      fromDegrees: 225,
      weatherCode: 3,
      precipitationChance: 40,
    });
  });

  it("treats a missing gust as a steady wind, not a lull", async () => {
    respondWith([daily([TODAY], { wind_gusts_10m_max: [null] })]);

    const [zone] = await provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 1 });

    expect(zone?.days[0]?.gustKnots).toBe(12);
  });

  it("drops a day with no wind direction rather than guessing one", async () => {
    respondWith([daily([TODAY, "2026-08-16"], { wind_direction_10m_dominant: [null, 225] })]);

    const [zone] = await provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 2 });

    expect(zone?.days.map((d) => d.date)).toEqual(["2026-08-16"]);
  });

  it("asks for knots, so nothing downstream has to convert", async () => {
    const fetchMock = respondWith([daily([TODAY])]);

    await provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 1 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("wind_speed_unit")).toBe("kn");
    expect(url.searchParams.get("latitude")).toBe("48.6");
  });

  it("sends every zone in one request rather than one call each", async () => {
    const fetchMock = respondWith([daily([TODAY]), daily([TODAY])]);

    await provider().forecast({ zones, startDate: TODAY, days: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("latitude")).toBe("48.6,49.1");
  });

  it("clamps the start up to today for a trip already under way", async () => {
    const fetchMock = respondWith([daily([TODAY])]);

    // Left today, still sailing on the 17th: the days already gone have
    // no forecast, but the remaining ones do.
    await provider().forecast({ zones: [zones[0]!], startDate: "2026-08-13", days: 5 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("start_date")).toBe(TODAY);
    expect(url.searchParams.get("end_date")).toBe("2026-08-17");
  });

  it("does not call the API for a trip that finished before today", async () => {
    const fetchMock = respondWith([daily([TODAY])]);

    const result = await provider().forecast({
      zones: [zones[0]!],
      startDate: "2026-08-01",
      days: 3,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("clamps the end date to the model's horizon", async () => {
    const fetchMock = respondWith([daily([TODAY])]);

    await provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 60 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    // 16-day horizon counting today, so the 15th plus 15 days.
    expect(url.searchParams.get("end_date")).toBe("2026-08-30");
  });

  it("does not call the API at all for a trip beyond the horizon", async () => {
    const fetchMock = respondWith([daily([TODAY])]);

    const result = await provider().forecast({ zones, startDate: "2027-01-01", days: 3 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("does no work when there are no zones", async () => {
    const fetchMock = respondWith([]);
    await expect(provider().forecast({ zones: [], startDate: TODAY, days: 3 })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the API refuses, so the caller can fall back to distance-only", async () => {
    respondWith({}, false, 429);

    await expect(
      provider().forecast({ zones: [zones[0]!], startDate: TODAY, days: 1 })
    ).rejects.toThrow(/429/);
  });

  it("yields an empty day list for a zone the response has no entry for", async () => {
    respondWith([daily([TODAY])]);

    const result = await provider().forecast({ zones, startDate: TODAY, days: 1 });

    expect(result[1]).toEqual({ zoneId: "georgia-south", days: [] });
  });
});
