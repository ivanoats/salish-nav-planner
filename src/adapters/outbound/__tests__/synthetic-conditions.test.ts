import { afterEach, describe, expect, it } from "vitest";
import {
  SyntheticCurrentPredictions,
  SyntheticWindForecast,
  usesSyntheticConditions,
} from "../synthetic-conditions";

const HOUR_MS = 3_600_000;
const station = { source: "noaa", id: "PUG1701", bin: 33 } as const;

afterEach(() => {
  delete process.env.SYNTHETIC_CONDITIONS;
});

describe("usesSyntheticConditions", () => {
  it("is on only when SYNTHETIC_CONDITIONS is exactly 1", () => {
    expect(usesSyntheticConditions()).toBe(false);
    process.env.SYNTHETIC_CONDITIONS = "true";
    expect(usesSyntheticConditions()).toBe(false);
    process.env.SYNTHETIC_CONDITIONS = "1";
    expect(usesSyntheticConditions()).toBe(true);
  });
});

describe("SyntheticWindForecast", () => {
  it("returns one day per day asked for, in every zone", async () => {
    const zones = [
      { id: "a", name: "A", lat: 48, lon: -123 },
      { id: "b", name: "B", lat: 47, lon: -122 },
    ];

    const forecast = await new SyntheticWindForecast().forecast({
      zones,
      startDate: "2026-07-30",
      days: 3,
    });

    expect(forecast.map((zone) => zone.zoneId)).toEqual(["a", "b"]);
    expect(forecast[0]?.days.map((day) => day.date)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });
});

describe("SyntheticCurrentPredictions", () => {
  const fromMs = Date.UTC(2026, 6, 30);
  const toMs = fromMs + 24 * HOUR_MS;

  it("alternates slack with flood and ebb inside the window", async () => {
    const events = await new SyntheticCurrentPredictions().predictions({ station, fromMs, toMs });

    expect(events.length).toBeGreaterThan(6);
    expect(events.every((event) => event.atMs >= fromMs && event.atMs <= toMs)).toBe(true);
    events.forEach((event, index) => {
      const next = events[index + 1];
      if (next === undefined) return;
      expect([event.type, next.type]).toContain("slack");
      expect(event.type === "slack").toBe(event.speedKnots === 0);
    });
  });

  it("gives the same answer to the same question", async () => {
    const provider = new SyntheticCurrentPredictions();
    expect(await provider.predictions({ station, fromMs, toMs })).toEqual(
      await provider.predictions({ station, fromMs, toMs })
    );
  });
});
