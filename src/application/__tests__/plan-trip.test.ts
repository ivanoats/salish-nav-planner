import { describe, expect, it } from "vitest";
import { planTrip } from "../plan-trip";
import { buildRouteGraph, rankNextDestinations, shortestDistancesFrom } from "../route-graph";
import { dayLengthRangeFor, idealDistanceToEnd } from "@/domain/trip";
import type { RouteEdge } from "@/domain/route";

const edge = (from: string, to: string, nm: number, via: string[] = []): RouteEdge => ({
  from,
  to,
  nm,
  hrMin: "1:00",
  via,
  routeUrl: "",
});

// a -> b (30), a -> c (50), a -> far (200), b -> c (25), b -> d (40), c -> d (35)
const edges: RouteEdge[] = [
  edge("a", "b", 30),
  edge("a", "c", 50),
  edge("a", "far", 200),
  edge("b", "c", 25),
  edge("b", "d", 40),
  edge("c", "d", 35),
];
const graph = buildRouteGraph(edges);
const range = { minNm: 20, maxNm: 60 };

describe("rankNextDestinations", () => {
  it("excludes destinations outside the day-length range", () => {
    const slugs = rankNextDestinations(graph, "a", { range }).map((c) => c.slug);
    expect(slugs).not.toContain("far");
    expect(slugs).toEqual(expect.arrayContaining(["b", "c"]));
  });

  it("ranks candidates closest to the middle of the range first", () => {
    // midpoint of 20..60 is 40; b is 30 (delta 10), c is 50 (delta 10) -
    // tie broken alphabetically. Narrow the range to make it decisive.
    const slugs = rankNextDestinations(graph, "a", { range: { minNm: 20, maxNm: 70 } }).map((c) => c.slug);
    // midpoint 45: c(50, delta 5) beats b(30, delta 15)
    expect(slugs[0]).toBe("c");
  });

  it("excludes already-visited stops", () => {
    const slugs = rankNextDestinations(graph, "a", { range, exclude: new Set(["b"]) }).map((c) => c.slug);
    expect(slugs).not.toContain("b");
  });

  it("collapses parallel edges to the shortest", () => {
    const withParallel = buildRouteGraph([...edges, edge("a", "b", 22, ["shortcut"])]);
    const candidate = rankNextDestinations(withParallel, "a", { range }).find((c) => c.slug === "b");
    expect(candidate?.nm).toBe(22);
  });

  it("returns an empty list when nothing is in range", () => {
    expect(rankNextDestinations(graph, "a", { range: { minNm: 300, maxNm: 400 } })).toEqual([]);
  });

  it("ranks on the same shortest-path distance findRoute will report", () => {
    // a->d has no direct edge; the a->b->d path is 70nm. A candidate must
    // be offered at that distance, not at some unrelated direct-edge value.
    const candidate = rankNextDestinations(graph, "a", { range: { minNm: 60, maxNm: 80 } }).find(
      (c) => c.slug === "d"
    );
    expect(candidate?.nm).toBe(70);
  });

  it("never offers a candidate whose actual route falls outside the range", () => {
    // Guards the bug where ranking used the direct edge but the planner
    // routed via a shorter multi-hop path, landing the day under minNm.
    const shortcutGraph = buildRouteGraph([
      edge("a", "z", 40),
      edge("a", "mid", 5),
      edge("mid", "z", 5),
    ]);
    const slugs = rankNextDestinations(shortcutGraph, "a", { range: { minNm: 20, maxNm: 55 } }).map(
      (c) => c.slug
    );
    // z is 40nm by direct edge but only 10nm via mid, so it must not be
    // offered as a 20-55nm day.
    expect(slugs).not.toContain("z");
  });
});

describe("planTrip", () => {
  const base = {
    graph,
    startSlug: "a",
    days: 1,
    range,
    endSlug: null,
    overrides: new Map<number, string>(),
  };

  it("uses the user's chosen destination for day 1", () => {
    const [day1] = planTrip({ ...base, firstDestinationSlug: "c" });
    expect(day1?.fromSlug).toBe("a");
    expect(day1?.toSlug).toBe("c");
    expect(day1?.source).toBe("manual");
    expect(day1?.route?.totalNm).toBe(50);
  });

  it("auto-picks later days, each departing from the previous day's stop", () => {
    const days = planTrip({ ...base, firstDestinationSlug: "b", days: 3 });
    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({ fromSlug: "a", toSlug: "b", source: "manual" });
    expect(days[1]?.fromSlug).toBe("b");
    expect(days[1]?.source).toBe("auto");
    // day 2 departs b; day 3 departs day 2's destination
    expect(days[2]?.fromSlug).toBe(days[1]?.toSlug);
  });

  it("never revisits a stop already used earlier in the trip", () => {
    const days = planTrip({ ...base, firstDestinationSlug: "b", days: 3 });
    const stops = days.map((d) => d.toSlug).filter((s): s is string => s !== null);
    expect(new Set(stops).size).toBe(stops.length);
    expect(stops).not.toContain("a");
  });

  it("honors a manual override for a later day", () => {
    const days = planTrip({
      ...base,
      firstDestinationSlug: "b",
      days: 2,
      overrides: new Map([[2, "d"]]),
    });
    expect(days[1]).toMatchObject({ fromSlug: "b", toSlug: "d", source: "manual" });
  });

  it("emits empty days once nothing is reachable in range", () => {
    const days = planTrip({
      ...base,
      firstDestinationSlug: "b",
      days: 5,
      range: { minNm: 20, maxNm: 45 },
    });
    expect(days).toHaveLength(5);
    const exhausted = days.filter((d) => d.toSlug === null);
    expect(exhausted.length).toBeGreaterThan(0);
    // every day is still represented, in order
    expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns a single empty day when day 1 has no destination yet", () => {
    const days = planTrip({ ...base, firstDestinationSlug: null, days: 3 });
    expect(days).toHaveLength(3);
    expect(days.every((d) => d.toSlug === null)).toBe(true);
  });
});

describe("planTrip with an end point", () => {
  const base = {
    graph,
    startSlug: "a",
    days: 3,
    range,
    overrides: new Map<number, string>(),
    firstDestinationSlug: "b",
  };

  it("finishes a round trip back at the start", () => {
    const days = planTrip({ ...base, endSlug: "a" });
    const last = days[days.length - 1];
    expect(last?.toSlug).toBe("a");
    expect(last?.source).toBe("endpoint");
  });

  it("finishes at a named end point that isn't the start", () => {
    const days = planTrip({ ...base, endSlug: "d" });
    const last = days[days.length - 1];
    expect(last?.toSlug).toBe("d");
    expect(last?.source).toBe("endpoint");
  });

  it("does not land on the end point before the final day", () => {
    const days = planTrip({ ...base, endSlug: "d", days: 3 });
    const early = days.slice(0, -1).map((d) => d.toSlug);
    expect(early).not.toContain("d");
  });

  it("leaves one-way trips unconstrained", () => {
    const days = planTrip({ ...base, endSlug: null });
    expect(days[days.length - 1]?.source).not.toBe("endpoint");
  });

  it("drops candidates it could not get back from in the days left", () => {
    // home --60-- mid --40-- outpost --40-- deepOut
    // Standing at "outpost", both neighbours are a legal 40nm day, but
    // deepOut leaves you 140nm from home and mid only 60nm. With two
    // days left at 60nm max (a 120nm budget) only mid is survivable.
    const returnGraph = buildRouteGraph([
      edge("home", "mid", 60),
      edge("mid", "outpost", 40),
      edge("outpost", "deepOut", 40),
    ]);
    const slugs = rankNextDestinations(returnGraph, "outpost", {
      range: { minNm: 20, maxNm: 60 },
      returnLeg: {
        distancesToEnd: shortestDistancesFrom(returnGraph, "home"),
        daysRemaining: 2,
        idealDistanceToEnd: 60,
        weight: 1,
      },
    }).map((c) => c.slug);
    expect(slugs).toContain("mid");
    expect(slugs).not.toContain("deepOut");
  });

  it("prefers the candidate nearest the ideal distance from the end point", () => {
    // Both b (30nm) and c (50nm) fit the day range; with an ideal
    // distance-from-home of 50 the shaping term should favour c.
    const [first] = rankNextDestinations(graph, "a", {
      range,
      returnLeg: {
        distancesToEnd: shortestDistancesFrom(graph, "a"),
        daysRemaining: 2,
        idealDistanceToEnd: 50,
        weight: 1,
      },
    });
    expect(first?.slug).toBe("c");
  });
});

describe("day length in hours", () => {
  it("converts an hour window to the distance window at a given speed", () => {
    expect(dayLengthRangeFor({ minHours: 3, maxHours: 8 }, 6)).toEqual({
      minNm: 18,
      maxNm: 48,
    });
  });

  it("reaches further at the same hours when the boat is faster", () => {
    const slow = dayLengthRangeFor({ minHours: 3, maxHours: 8 }, 6);
    const fast = dayLengthRangeFor({ minHours: 3, maxHours: 8 }, 8);
    expect(fast.maxNm).toBeGreaterThan(slow.maxNm);
  });

  it("changes which stops are reachable when only the speed changes", () => {
    // "c" is 50nm from "a": out of reach on an 8h day at 6kt (48nm),
    // in reach at 7kt (56nm). Same hour window both times.
    const hours = { minHours: 3, maxHours: 8 };
    const atSix = rankNextDestinations(graph, "a", {
      range: dayLengthRangeFor(hours, 6),
    }).map((candidate) => candidate.slug);
    const atSeven = rankNextDestinations(graph, "a", {
      range: dayLengthRangeFor(hours, 7),
    }).map((candidate) => candidate.slug);

    expect(atSix).not.toContain("c");
    expect(atSeven).toContain("c");
  });
});

describe("idealDistanceToEnd", () => {
  it("traces a tent that peaks mid-trip and ends at zero", () => {
    const shape = [1, 2, 3, 4, 5].map((day) => idealDistanceToEnd(day, 5, 25));
    expect(shape).toEqual([25, 50, 50, 25, 0]);
  });

  it("is zero on the final day of any trip length", () => {
    for (const days of [2, 3, 6, 7]) {
      expect(idealDistanceToEnd(days, days, 30)).toBe(0);
    }
  });
});
