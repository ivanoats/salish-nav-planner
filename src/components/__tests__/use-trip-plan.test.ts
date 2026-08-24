import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The hook's two data hooks reach the network; stubbed so these tests
// exercise planning logic rather than fetch, and so the arguments the
// hook derives can be asserted on directly.
const useWindFieldMock = vi.hoisted(() => vi.fn());
const usePassCurrentsMock = vi.hoisted(() => vi.fn());

vi.mock("../use-conditions", () => ({
  useWindField: useWindFieldMock,
  usePassCurrents: usePassCurrentsMock,
}));

const { useTripPlan } = await import("../use-trip-plan");
const { createComposition } = await import("@/composition-root");
const { EMPTY_WIND_FIELD } = await import("@/domain/wind-field");
const { localTimeToMs } = await import("@/domain/clock");
const { MAX_TRIP_DAYS, MIN_DAY_HOURS, MAX_DAY_HOURS } = await import("@/domain/trip");
const { AIR_DRAFT_MARGIN_FEET, MAX_MAST_HEIGHT_FEET, airDraftFor } = await import(
  "@/domain/obstruction"
);

import type { Location } from "@/domain/location";
import type { RouteEdge } from "@/domain/route";
import type { TidalPass } from "@/domain/pass";
import type { SharedTripState } from "@/application/shareable-trip-url";

const at = (slug: string, lat: number): Location => ({
  slug,
  name: slug,
  region: "US",
  lat,
  lon: -122.5,
});

/**
 * A start, one first stop, and three onward options all inside the
 * default 18–48 nm day. Three so that cycling has somewhere to go.
 */
const locations: Location[] = [
  at("home", 47.6),
  at("b", 47.9),
  at("c1", 48.2),
  at("c2", 48.3),
  at("c3", 48.4),
];

const edge = (from: string, to: string, nm: number): RouteEdge => ({
  from,
  to,
  nm,
  hrMin: "0:00",
  via: [],
  routeUrl: "",
});

const edges: RouteEdge[] = [
  edge("home", "b", 20),
  edge("b", "c1", 25),
  edge("b", "c2", 30),
  edge("b", "c3", 35),
];

const composition = (passes: readonly TidalPass[] = []) =>
  createComposition({
    locations,
    edges,
    waypoints: [],
    passes,
    windZones: [],
    obstructions: [],
  });

/** Start at `home`, first stop `b`, over `days` days. */
const planned = (days = 2, passes: readonly TidalPass[] = []) => {
  const rendered = renderHook(() => useTripPlan(composition(passes)));
  act(() => {
    rendered.result.current.setStartSlug("home");
    rendered.result.current.setFirstDestinationSlug("b");
    rendered.result.current.setDays(days);
  });
  return rendered;
};

beforeEach(() => {
  useWindFieldMock.mockReset();
  usePassCurrentsMock.mockReset();
  useWindFieldMock.mockReturnValue({ windField: EMPTY_WIND_FIELD, status: "idle" });
  usePassCurrentsMock.mockReturnValue({ currentsByPassId: new Map(), status: "idle" });
});

describe("useTripPlan", () => {
  describe("shared trip hydration", () => {
    const sharedTrip = (pinnedDays: readonly number[] = []): SharedTripState => ({
      version: 1,
      days: 2,
      minHours: 4,
      maxHours: 7,
      speedKnots: 7,
      startSlug: "home",
      firstDestinationSlug: "b",
      startDate: "2026-08-15",
      departureMinutes: 9 * 60 + 15,
      mastHeightFeet: 62,
      windAware: false,
      roundTrip: false,
      customEndSlug: null,
      stopSlugs: ["home", "b", "c2"],
      pinnedDays,
    });

    it("uses the server-decoded state on its first render", () => {
      const { result } = renderHook(() => useTripPlan(composition(), sharedTrip()));

      expect(result.current).toMatchObject({
        days: 2,
        minHours: 4,
        maxHours: 7,
        speedKnots: 7,
        startSlug: "home",
        firstDestinationSlug: "b",
        startDate: "2026-08-15",
        departureMinutes: 555,
        mastHeightFeet: 62,
        windAware: false,
        roundTrip: false,
        customEndSlug: null,
        stopSlugs: ["home", "b", "c2"],
      });
    });

    it("preserves shared automatic stops without presenting them as pins", () => {
      const { result } = renderHook(() => useTripPlan(composition(), sharedTrip()));

      expect(result.current.tripDays[1]?.toSlug).toBe("c2");
      expect(result.current.isPinned(2)).toBe(false);
      expect(result.current.pinnedDays).toEqual([]);
    });

    it("releases shared automatic stops when a routing input changes", () => {
      const { result } = renderHook(() => useTripPlan(composition(), sharedTrip()));

      act(() => {
        result.current.setMinHours(3);
        result.current.setMaxHours(4);
      });

      expect(result.current.tripDays[1]?.toSlug).toBe("c1");
      expect(result.current.isPinned(2)).toBe(false);
    });

    it("keeps an explicit shared pin when other routing inputs change", () => {
      const { result } = renderHook(() => useTripPlan(composition(), sharedTrip([2])));

      expect(result.current.isPinned(2)).toBe(true);
      act(() => {
        result.current.setMinHours(3);
        result.current.setMaxHours(4);
      });

      expect(result.current.tripDays[1]?.toSlug).toBe("c2");
      expect(result.current.isPinned(2)).toBe(true);
    });

    it("keeps shared automatic stops when only the departure time changes", () => {
      const { result } = renderHook(() => useTripPlan(composition(), sharedTrip()));

      act(() => result.current.setDepartureMinutes(600));

      expect(result.current.tripDays[1]?.toSlug).toBe("c2");
      expect(result.current.isPinned(2)).toBe(false);
    });
  });

  describe("day length", () => {
    it("derives the distance window from hours and speed", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      // Defaults: 3–8 hrs at 6 kt.
      expect(result.current.minNm).toBe(18);
      expect(result.current.maxNm).toBe(48);

      act(() => result.current.setSpeedKnots(10));

      expect(result.current.minNm).toBe(30);
      expect(result.current.maxNm).toBe(80);
    });

    it("clamps the hour window to something sailable", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      act(() => result.current.setMinHours(-5));
      expect(result.current.minHours).toBe(MIN_DAY_HOURS);

      act(() => result.current.setMaxHours(99));
      expect(result.current.maxHours).toBe(MAX_DAY_HOURS);
    });
  });

  describe("mast height", () => {
    it("clamps to the allowed range", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      act(() => result.current.setMastHeightFeet(999));
      expect(result.current.mastHeightFeet).toBe(MAX_MAST_HEIGHT_FEET);

      act(() => result.current.setMastHeightFeet(-10));
      expect(result.current.mastHeightFeet).toBe(0);
    });

    it("falls back rather than letting an empty input become NaN", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      // A cleared number input yields NaN, which would otherwise poison
      // every clearance comparison downstream.
      act(() => result.current.setMastHeightFeet(Number.NaN));

      expect(Number.isFinite(result.current.mastHeightFeet)).toBe(true);
    });

    it("is the height the clearance check actually uses, plus the margin", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      act(() => result.current.setMastHeightFeet(50));

      // The hook holds the bare mast height, not the air draft: the margin
      // goes on once, at the clearance check. Storing it pre-added here
      // would count it twice and quietly rule out passages that fit.
      expect(result.current.mastHeightFeet).toBe(50);
      expect(airDraftFor(result.current.mastHeightFeet)).toBe(50 + AIR_DRAFT_MARGIN_FEET);
    });
  });

  describe("trip shape", () => {
    it("clamps the day count", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      act(() => result.current.setDays(99));
      expect(result.current.days).toBe(MAX_TRIP_DAYS);

      act(() => result.current.setDays(0));
      expect(result.current.days).toBe(1);
    });

    it("ends a round trip back at the start", () => {
      const { result } = planned();

      act(() => result.current.setRoundTrip(true));

      expect(result.current.endSlug).toBe("home");
    });

    it("uses the named end point when it is not a round trip", () => {
      const { result } = planned();

      act(() => {
        result.current.setRoundTrip(false);
        result.current.setCustomEndSlug("c3");
      });

      expect(result.current.endSlug).toBe("c3");
    });

    it("lists the start and every destination as stops", () => {
      const { result } = planned();

      expect(result.current.stopSlugs[0]).toBe("home");
      expect(result.current.stopSlugs).toContain("b");
      expect(result.current.stopSlugs).toHaveLength(result.current.tripDays.length + 1);
    });

    it("has no stops at all before a start is chosen", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      expect(result.current.stopSlugs).toEqual([]);
      expect(result.current.tripDays).toEqual([]);
    });

    it("totals the distance of the planned days", () => {
      const { result } = planned();

      const summed = result.current.tripDays.reduce(
        (total, day) => total + (day.route?.totalNm ?? 0),
        0
      );
      expect(result.current.totalNm).toBeCloseTo(summed, 5);
      expect(result.current.totalNm).toBeGreaterThan(0);
    });
  });

  describe("pinning a day", () => {
    it("pins a destination and reports it as pinned", () => {
      const { result } = planned();

      act(() => result.current.setDayDestination(2, "c3"));

      expect(result.current.isPinned(2)).toBe(true);
      expect(result.current.tripDays.find((d) => d.dayNumber === 2)?.toSlug).toBe("c3");
    });

    it("releases a day back to auto-picking", () => {
      const { result } = planned();

      act(() => result.current.setDayDestination(2, "c3"));
      act(() => result.current.clearDayDestination(2));

      expect(result.current.isPinned(2)).toBe(false);
    });

    it("drops later pins, which were chosen from a different upstream stop", () => {
      const { result } = planned(3);

      act(() => result.current.setDayDestination(3, "c3"));
      expect(result.current.isPinned(3)).toBe(true);

      act(() => result.current.setDayDestination(2, "c1"));

      expect(result.current.isPinned(2)).toBe(true);
      expect(result.current.isPinned(3)).toBe(false);
    });

    it("drops later pins when a day is released too", () => {
      const { result } = planned(3);

      act(() => result.current.setDayDestination(2, "c1"));
      act(() => result.current.setDayDestination(3, "c3"));
      act(() => result.current.clearDayDestination(2));

      expect(result.current.isPinned(3)).toBe(false);
    });

    it("forgets pins for days that no longer exist", () => {
      const { result } = planned(3);

      act(() => result.current.setDayDestination(3, "c3"));
      act(() => result.current.setDays(2));
      act(() => result.current.setDays(3));

      // Shortening then re-lengthening must not resurrect a stale choice.
      expect(result.current.isPinned(3)).toBe(false);
    });
  });

  describe("cycling a day", () => {
    it("moves to a different destination", () => {
      const { result } = planned();

      const before = result.current.tripDays.find((d) => d.dayNumber === 2)?.toSlug;
      act(() => result.current.cycleDayDestination(2));
      const after = result.current.tripDays.find((d) => d.dayNumber === 2)?.toSlug;

      expect(after).not.toBe(before);
      expect(result.current.isPinned(2)).toBe(true);
    });

    it("comes back around rather than running out", () => {
      const { result } = planned();

      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        act(() => result.current.cycleDayDestination(2));
        const slug = result.current.tripDays.find((d) => d.dayNumber === 2)?.toSlug;
        if (slug !== null && slug !== undefined) seen.add(slug);
      }

      expect(seen.size).toBeGreaterThan(1);
      expect(result.current.tripDays.find((d) => d.dayNumber === 2)?.toSlug).not.toBeNull();
    });

    it("does nothing for a day that does not exist", () => {
      const { result } = planned();
      const before = result.current.tripDays.map((d) => d.toSlug);

      act(() => result.current.cycleDayDestination(9));

      expect(result.current.tripDays.map((d) => d.toSlug)).toEqual(before);
    });
  });

  describe("what it asks the data hooks for", () => {
    it("requests currents from the day before to the day after the trip", () => {
      const { result } = planned(3);

      act(() => result.current.setStartDate("2026-08-15"));

      const [, fromMs, toMs] = usePassCurrentsMock.mock.calls.at(-1) ?? [];
      expect(fromMs).toBe(localTimeToMs("2026-08-14", 0));
      // days + 1 past the start: a pre-dawn departure or an ETA that
      // slips past midnight still lands inside the window.
      expect(toMs).toBe(localTimeToMs("2026-08-19", 0));
    });

    it("asks for the forecast over the trip's own dates", () => {
      const { result } = renderHook(() => useTripPlan(composition()));

      act(() => {
        result.current.setStartDate("2026-08-15");
        result.current.setDays(4);
      });

      const [, startDate, days] = useWindFieldMock.mock.calls.at(-1) ?? [];
      expect(startDate).toBe("2026-08-15");
      expect(days).toBe(4);
    });

    it("caps the passes it asks about, mirroring the API route's own limit", () => {
      // Thirty passes crowded onto the first leg; the request must not
      // fan all of them out at two public agencies.
      const crowded: TidalPass[] = Array.from({ length: 30 }, (_, i) => ({
        id: `pass-${i}`,
        name: `Pass ${i}`,
        lat: 47.75,
        lon: -122.5,
        station: { source: "noaa" as const, id: `S${i}` },
        stationName: `Station ${i}`,
        floodDirectionDegrees: 0,
        maxKnots: 3,
      }));

      planned(2, crowded);

      const [passIds] = usePassCurrentsMock.mock.calls.at(-1) ?? [];
      expect(Array.isArray(passIds)).toBe(true);
      const ids = passIds as readonly string[];

      // Exactly 24, not merely "no more than": with thirty passes on the
      // leg, an at-most assertion would still pass if detection silently
      // found three, which is the failure this test exists to catch.
      expect(ids).toHaveLength(24);
      expect(new Set(ids).size).toBe(24);
    });

    it("reports whether a forecast actually arrived", () => {
      const { result } = renderHook(() => useTripPlan(composition()));
      expect(result.current.hasWind).toBe(false);

      useWindFieldMock.mockReturnValue({
        windField: { windAt: () => null, hasData: true },
        status: "ready",
      });
      const withWind = renderHook(() => useTripPlan(composition()));

      expect(withWind.result.current.hasWind).toBe(true);
      expect(withWind.result.current.windStatus).toBe("ready");
    });
  });
});
