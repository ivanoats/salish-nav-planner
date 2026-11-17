import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGpxExport } from "../gpx-export";
import { serializeGpx } from "@/adapters/outbound/gpx-serializer";
import type { LonLat } from "@/domain/route-line";
import type { RouteLeg } from "@/domain/route";
import type { TripDay } from "@/domain/trip";

const a: LonLat = [-122.601234567, 48.51];
const bend: LonLat = [-122.7, 48.57];
const b: LonLat = [-122.8, 48.6];
const c: LonLat = [-122.9, 48.7];
const places = new Map([
  ["a", { name: "Éscale & <North> \"A\" '港' 🛟" }],
  ["b", { name: "Second stop" }],
  ["c", { name: "Third stop" }],
]);

const leg = (from: string, to: string, coordinates: readonly LonLat[]): RouteLeg => ({
  from, to, nm: 5, hrMin: "0:50", via: [], track: { source: "mesh", coordinates },
});

const day = (dayNumber: number, fromSlug: string, toSlug: string, ...legs: RouteLeg[]): TripDay => ({
  dayNumber, fromSlug, toSlug, source: "manual",
  route: { legs, totalNm: 5 * legs.length, totalHrMin: "0:50" },
});

const first = day(1, "a", "c", leg("a", "b", [a, bend, bend, b]), leg("b", "c", [b, c]));
const second = day(2, "c", "a", leg("c", "b", [c, b]), leg("b", "a", [b, bend, a]));
const namespace = "http://www.topografix.com/GPX/1/1";
const schema = join(import.meta.dirname, "fixtures/gpx-1.1.xsd");

function parseValidatedExport(days: readonly TripDay[]) {
  const result = buildGpxExport(days, places, "ready");
  if (result.status !== "ready") throw new Error(result.reason);
  const bytes = Buffer.from(serializeGpx(result.routes), "utf8");
  execFileSync("xmllint", ["--noout", "--nonet", "--schema", schema, "-"], {
    input: bytes, stdio: ["pipe", "pipe", "pipe"],
  });
  return new DOMParser().parseFromString(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes), "application/xml"
  );
}

describe("GPX export", () => {
  it("validates offline and retains travel-day order, named stops, repeated visits and every bend", () => {
    const doc = parseValidatedExport([first, second]);
    const routes = Array.from(doc.getElementsByTagNameNS(namespace, "rte"));
    const names = routes.map((route) => route.firstElementChild?.textContent);
    expect(names).toEqual([
      `Day 1: ${places.get("a")?.name} → Third stop`,
      `Day 2: Third stop → ${places.get("a")?.name}`,
    ]);
    const points = routes.map((route) => Array.from(route.getElementsByTagNameNS(namespace, "rtept")));
    expect(points.map((dayPoints) => dayPoints.map((point) => [
      Number(point.getAttribute("lon")), Number(point.getAttribute("lat")),
    ]))).toEqual([[a, bend, bend, b, c], [c, b, bend, a]]);
    expect(points.map((dayPoints) => dayPoints.map((point) => point.textContent))).toEqual([
      [places.get("a")?.name, "", "", "Second stop", "Third stop"],
      ["Third stop", "Second stop", "", places.get("a")?.name],
    ]);
    expect(doc.getElementsByTagNameNS(namespace, "desc")[0]?.textContent).toMatch(/passage-planning aid/i);
  });

  it("writes bounded WGS84 coordinates as decimals even when JavaScript uses an exponent", () => {
    const doc = parseValidatedExport([day(1, "a", "b", leg("a", "b", [[-180, 90], [1e-8, -90]]))]);
    const points = doc.getElementsByTagNameNS(namespace, "rtept");
    expect(points[0]?.getAttribute("lon")).toBe("-180");
    expect(points[1]?.getAttribute("lon")).toBe("0.00000001");
    expect(points[1]?.getAttribute("lat")).toBe("-90");
  });

  it("holds an empty plan and a plan awaiting geometry", () => {
    expect(buildGpxExport([], places, "loading")).toEqual({
      status: "unavailable", reason: "Choose a start and destination to download GPX.",
    });
    expect(buildGpxExport([first], places, "loading")).toEqual({
      status: "unavailable", reason: "Day 1: Route geometry is loading.",
    });
    expect(buildGpxExport([first], places, "unavailable")).toEqual({
      status: "unavailable", reason: "Day 1: Route geometry could not be loaded.",
    });
  });

  it("blocks the whole trip when a later stop is unreachable or unplanned", () => {
    for (const toSlug of ["a", null]) {
      expect(buildGpxExport([first, { ...second, toSlug, route: null }], places, "ready")).toEqual({
        status: "unavailable",
        reason: toSlug === null ? "Day 2: No destination could be planned." : "Day 2: Destination is unreachable.",
      });
    }
  });

  it.each([
    ["approximate", { source: "approximate", coordinates: [a, b] }, "Route geometry is approximate."],
    ["missing", undefined, "Route geometry is missing."],
    ["too few points", { source: "mesh", coordinates: [a] }, "Route geometry is invalid."],
    ["one distinct point", { source: "mesh", coordinates: [a, a] }, "Route geometry is invalid."],
    ["non-finite latitude", { source: "mesh", coordinates: [a, [-123, NaN]] }, "Route geometry is invalid."],
    ["infinite longitude", { source: "mesh", coordinates: [a, [Infinity, 48]] }, "Route geometry is invalid."],
    ["longitude at 180", { source: "mesh", coordinates: [a, [180, 48]] }, "Route geometry is invalid."],
    ["longitude below -180", { source: "mesh", coordinates: [a, [-181, 48]] }, "Route geometry is invalid."],
    ["latitude above 90", { source: "mesh", coordinates: [a, [-123, 91]] }, "Route geometry is invalid."],
    ["latitude below -90", { source: "mesh", coordinates: [a, [-123, -91]] }, "Route geometry is invalid."],
  ] satisfies [string, RouteLeg["track"], string][])("blocks %s geometry", (_label, track, reason) => {
    expect(buildGpxExport([day(1, "a", "b", { ...leg("a", "b", [a, b]), track })], places, "ready"))
      .toEqual({ status: "unavailable", reason: `Day 1: ${reason}` });
  });

  it("blocks coordinate and stop discontinuities within and between days", () => {
    const discontinuousLegs = day(1, "a", "c", leg("a", "b", [a, b]), leg("b", "c", [bend, c]));
    const discontinuousStops = day(1, "a", "c", leg("a", "b", [a, b]), leg("a", "c", [b, c]));
    for (const broken of [discontinuousLegs, discontinuousStops]) {
      expect(buildGpxExport([broken], places, "ready")).toEqual({
        status: "unavailable", reason: "Day 1: Route geometry is discontinuous.",
      });
    }
    const shifted = day(2, "c", "a", leg("c", "a", [b, a]));
    expect(buildGpxExport([first, shifted], places, "ready")).toEqual({
      status: "unavailable", reason: "Day 2: Route geometry is discontinuous.",
    });
  });
});
