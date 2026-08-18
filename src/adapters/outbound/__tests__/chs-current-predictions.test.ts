import { afterEach, describe, expect, it, vi } from "vitest";
import { ChsCurrentPredictions } from "../chs-current-predictions";

const AUG_15 = Date.UTC(2026, 7, 15);
const AUG_16 = Date.UTC(2026, 7, 16);

const respondWith = (payload: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Gateway",
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

// CHS station ids are opaque Mongo-style ids, not the five-digit codes.
const station = { source: "chs" as const, id: "63aef1866a2b9417c035030f" };

const predictions = () =>
  new ChsCurrentPredictions().predictions({ station, fromMs: AUG_15, toMs: AUG_16 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChsCurrentPredictions", () => {
  it("maps IWLS qualifiers onto the domain's event types", async () => {
    respondWith([
      { eventDate: "2026-08-15T01:16:00Z", qualifier: "SLACK", value: 0 },
      { eventDate: "2026-08-15T04:40:00Z", qualifier: "EXTREMA_EBB", value: 7.002 },
      { eventDate: "2026-08-15T10:33:00Z", qualifier: "EXTREMA_FLOOD", value: 5.872 },
    ]);

    const events = await predictions();

    expect(events.map((e) => e.type)).toEqual(["slack", "maxEbb", "maxFlood"]);
  });

  it("reads IWLS timestamps as the UTC they are declared in", async () => {
    respondWith([{ eventDate: "2026-08-15T01:16:00Z", qualifier: "SLACK", value: 0 }]);

    const [event] = await predictions();

    expect(event?.atMs).toBe(Date.UTC(2026, 7, 15, 1, 16));
  });

  it("keeps speed as a magnitude", async () => {
    respondWith([{ eventDate: "2026-08-15T04:40:00Z", qualifier: "EXTREMA_EBB", value: -7.5 }]);

    const [event] = await predictions();

    expect(event?.speedKnots).toBeCloseTo(7.5, 5);
  });

  it("requests the current-prediction event series over the window", async () => {
    const fetchMock = respondWith([]);

    await predictions();

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toContain(station.id);
    expect(url.searchParams.get("time-series-code")).toBe("wcp1-events");
    expect(url.searchParams.get("from")).toBe(new Date(AUG_15).toISOString());
  });

  it("throws on an HTTP failure", async () => {
    respondWith([], false, 502);
    await expect(predictions()).rejects.toThrow(/502/);
  });

  it("returns nothing when the body is not the array IWLS promises", async () => {
    respondWith({ message: "no data" });
    await expect(predictions()).resolves.toEqual([]);
  });

  it("skips entries it cannot interpret", async () => {
    respondWith([
      { eventDate: "2026-08-15T01:16:00Z", qualifier: "SOMETHING_NEW", value: 1 },
      { qualifier: "SLACK", value: 0 },
      { eventDate: "garbage", qualifier: "SLACK", value: 0 },
      { eventDate: "2026-08-15T10:33:00Z", qualifier: "EXTREMA_FLOOD", value: 5 },
    ]);

    const events = await predictions();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("maxFlood");
  });

  it("rejects a truncated timestamp instead of reading it as the first of the month", async () => {
    // Date.parse("2026-08") is a valid instant — 1 Aug — so a truncated
    // field would otherwise become a plausible-looking wrong slack time.
    respondWith([{ eventDate: "2026-08", qualifier: "SLACK", value: 0 }]);

    await expect(predictions()).resolves.toEqual([]);
  });

  it("returns events in time order", async () => {
    respondWith([
      { eventDate: "2026-08-15T10:33:00Z", qualifier: "EXTREMA_FLOOD", value: 5 },
      { eventDate: "2026-08-15T01:16:00Z", qualifier: "SLACK", value: 0 },
    ]);

    const times = (await predictions()).map((e) => e.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
