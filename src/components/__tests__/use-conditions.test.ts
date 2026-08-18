import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePassCurrents, useWindField } from "../use-conditions";
import type { WindZone } from "@/domain/wind-zone";

const zones: WindZone[] = [
  { id: "san-juans", name: "San Juan Islands", lat: 48.6, lon: -122.95 },
];

const windPayload = (speed = 12) => ({
  zones: [
    {
      zoneId: "san-juans",
      days: [
        {
          date: "2026-08-15",
          speedKnots: speed,
          gustKnots: speed + 8,
          fromDegrees: 225,
          weatherCode: 3,
          precipitationChance: 40,
        },
      ],
    },
  ],
});

const currentsPayload = () => ({
  passes: [
    {
      passId: "deception-pass",
      events: [{ type: "slack", atMs: Date.UTC(2026, 7, 15, 12), speedKnots: 0 }],
    },
  ],
});

/** Resolves immediately; `hold` returns a promise you control instead. */
const respondWith = (payload: unknown, { ok = true, status = 200 } = {}) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Gateway",
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const rejectWith = (error: unknown) => {
  const fetchMock = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWindField", () => {
  it("fetches the trip's dates and exposes the forecast", async () => {
    const fetchMock = respondWith(windPayload());

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.windField.hasData).toBe(true);
    expect(result.current.windField.windAt({ lat: 48.6, lon: -122.95 }, "2026-08-15")).toMatchObject(
      { speedKnots: 12, fromDegrees: 225 }
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/wind?start=2026-08-15&days=3");
  });

  it("reports loading until the response lands", async () => {
    respondWith(windPayload());

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    expect(result.current.status).toBe("loading");
    expect(result.current.windField.hasData).toBe(false);

    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("does not fetch at all when disabled", () => {
    const fetchMock = respondWith(windPayload());

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.windField.hasData).toBe(false);
  });

  it("reports an error on a failed request without throwing", async () => {
    respondWith({}, { ok: false, status: 502 });

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    await waitFor(() => expect(result.current.status).toBe("error"));
    // The planner falls back to distance-only ranking rather than breaking.
    expect(result.current.windField.hasData).toBe(false);
  });

  it("reports an error when the network itself fails", async () => {
    rejectWith(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("stays quiet when the request is aborted", async () => {
    rejectWith(new DOMException("The operation was aborted.", "AbortError"));

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    // An abort is a superseded request, not a failure to report.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.status).toBe("loading");
  });

  it("refetches when the dates change", async () => {
    const fetchMock = respondWith(windPayload());

    const { result, rerender } = renderHook(
      ({ start, days }) => useWindField(zones, start, days, true),
      { initialProps: { start: "2026-08-15", days: 3 } }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ start: "2026-08-20", days: 3 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("start=2026-08-20");
  });

  it("does not show the old forecast as ready while a new one is in flight", async () => {
    respondWith(windPayload());

    const { result, rerender } = renderHook(
      ({ start }) => useWindField(zones, start, 3, true),
      { initialProps: { start: "2026-08-15" } }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ start: "2026-08-20" });

    // Status is derived from the key, so last week's answer cannot be
    // mistaken for this week's.
    expect(result.current.status).toBe("loading");
  });

  it("treats a response with no zones as no data", async () => {
    respondWith({});

    const { result } = renderHook(() => useWindField(zones, "2026-08-15", 3, true));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.windField.hasData).toBe(false);
  });
});

describe("usePassCurrents", () => {
  const from = Date.UTC(2026, 7, 14);
  const to = Date.UTC(2026, 7, 19);

  it("fetches the named passes and keys them by id", async () => {
    const fetchMock = respondWith(currentsPayload());

    const { result } = renderHook(() => usePassCurrents(["deception-pass"], from, to));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.currentsByPassId.get("deception-pass")).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("passes=deception-pass");
  });

  it("does not fetch when there are no passes to ask about", () => {
    const fetchMock = respondWith(currentsPayload());

    const { result } = renderHook(() => usePassCurrents([], from, to));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.currentsByPassId.size).toBe(0);
  });

  it("does not fetch on a non-finite window", () => {
    const fetchMock = respondWith(currentsPayload());

    const { result } = renderHook(() => usePassCurrents(["deception-pass"], Number.NaN, to));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("ignores the order the passes arrive in", async () => {
    const fetchMock = respondWith(currentsPayload());

    const { result, rerender } = renderHook(
      ({ ids }) => usePassCurrents(ids, from, to),
      { initialProps: { ids: ["deception-pass", "cattle-pass"] } }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Same passes, different order: the plan re-rendered, the request
    // did not change, so nothing should be refetched.
    rerender({ ids: ["cattle-pass", "deception-pass"] });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when the passes actually change", async () => {
    const fetchMock = respondWith(currentsPayload());

    const { result, rerender } = renderHook(
      ({ ids }) => usePassCurrents(ids, from, to),
      { initialProps: { ids: ["deception-pass"] } }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ ids: ["deception-pass", "dodd-narrows"] });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("reports an error on a failed request", async () => {
    respondWith({}, { ok: false, status: 500 });

    const { result } = renderHook(() => usePassCurrents(["deception-pass"], from, to));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.currentsByPassId.size).toBe(0);
  });

  it("stays quiet when the request is aborted", async () => {
    rejectWith(new DOMException("The operation was aborted.", "AbortError"));

    const { result } = renderHook(() => usePassCurrents(["deception-pass"], from, to));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.status).toBe("loading");
  });

  it("treats a response with no passes as no currents", async () => {
    respondWith({});

    const { result } = renderHook(() => usePassCurrents(["deception-pass"], from, to));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.currentsByPassId.size).toBe(0);
  });
});
