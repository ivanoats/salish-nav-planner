import { afterEach, describe, expect, it, vi } from "vitest";
import { NoaaCurrentPredictions } from "../noaa-current-predictions";

const AUG_15 = Date.UTC(2026, 7, 15);
const AUG_16 = Date.UTC(2026, 7, 16);

const respondWith = (payload: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Server Error",
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const cp = (rows: unknown[]) => ({ current_predictions: { cp: rows } });

const station = { source: "noaa" as const, id: "PUG1701" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NoaaCurrentPredictions", () => {
  it("maps NOAA's slack/flood/ebb onto the domain's event types", async () => {
    respondWith(
      cp([
        { Type: "slack", Time: "2026-08-15 00:21", Velocity_Major: 0 },
        { Type: "flood", Time: "2026-08-15 03:30", Velocity_Major: 4.2 },
        { Type: "ebb", Time: "2026-08-15 09:45", Velocity_Major: -6.1 },
      ])
    );

    const events = await new NoaaCurrentPredictions().predictions({
      station,
      fromMs: AUG_15,
      toMs: AUG_16,
    });

    expect(events.map((e) => e.type)).toEqual(["slack", "maxFlood", "maxEbb"]);
  });

  it("reads the timestamp as UTC, since the request asks for GMT", async () => {
    respondWith(cp([{ Type: "slack", Time: "2026-08-15 00:21", Velocity_Major: 0 }]));

    const [event] = await new NoaaCurrentPredictions().predictions({
      station,
      fromMs: AUG_15,
      toMs: AUG_16,
    });

    // Not 00:21 Pacific — the adapter must not re-derive a local offset.
    expect(event?.atMs).toBe(Date.UTC(2026, 7, 15, 0, 21));
  });

  it("stores speed as a magnitude, letting the type carry the direction", async () => {
    respondWith(cp([{ Type: "ebb", Time: "2026-08-15 09:45", Velocity_Major: -6.1 }]));

    const [event] = await new NoaaCurrentPredictions().predictions({
      station,
      fromMs: AUG_15,
      toMs: AUG_16,
    });

    expect(event?.speedKnots).toBeCloseTo(6.1, 5);
  });

  it("returns events in time order even when the API does not", async () => {
    respondWith(
      cp([
        { Type: "ebb", Time: "2026-08-15 09:45", Velocity_Major: 6 },
        { Type: "slack", Time: "2026-08-15 00:21", Velocity_Major: 0 },
        { Type: "flood", Time: "2026-08-15 03:30", Velocity_Major: 4 },
      ])
    );

    const events = await new NoaaCurrentPredictions().predictions({
      station,
      fromMs: AUG_15,
      toMs: AUG_16,
    });

    const times = events.map((e) => e.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("asks for GMT and the MAX_SLACK interval", async () => {
    const fetchMock = respondWith(cp([]));

    await new NoaaCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("time_zone")).toBe("gmt");
    expect(url.searchParams.get("interval")).toBe("MAX_SLACK");
    expect(url.searchParams.get("station")).toBe("PUG1701");
    expect(url.searchParams.get("begin_date")).toBe("20260815");
  });

  it("sends the depth bin for a harmonic station and omits it otherwise", async () => {
    const withBin = respondWith(cp([]));
    await new NoaaCurrentPredictions().predictions({
      station: { ...station, bin: 33 },
      fromMs: AUG_15,
      toMs: AUG_16,
    });
    expect(new URL(String(withBin.mock.calls[0]?.[0])).searchParams.get("bin")).toBe("33");

    const withoutBin = respondWith(cp([]));
    await new NoaaCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 });
    expect(new URL(String(withoutBin.mock.calls[0]?.[0])).searchParams.has("bin")).toBe(false);
  });

  it("throws on an HTTP failure rather than reporting slack water", async () => {
    respondWith({}, false, 503);

    await expect(
      new NoaaCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 })
    ).rejects.toThrow(/503/);
  });

  it("throws when NOAA reports an error in an otherwise-200 body", async () => {
    respondWith({ error: { message: "Wrong Station ID" } });

    await expect(
      new NoaaCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 })
    ).rejects.toThrow(/Wrong Station ID/);
  });

  it("skips rows it cannot interpret instead of inventing events", async () => {
    respondWith(
      cp([
        { Type: "unknown", Time: "2026-08-15 00:21", Velocity_Major: 1 },
        { Type: "slack", Velocity_Major: 0 },
        { Type: "slack", Time: "not a date", Velocity_Major: 0 },
        { Type: "flood", Time: "2026-08-15 03:30", Velocity_Major: 4 },
      ])
    );

    const events = await new NoaaCurrentPredictions().predictions({
      station,
      fromMs: AUG_15,
      toMs: AUG_16,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("maxFlood");
  });

  it("returns nothing when the station has no predictions", async () => {
    respondWith({});
    await expect(
      new NoaaCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 })
    ).resolves.toEqual([]);
  });
});
