import { describe, expect, it } from "vitest";
import {
  angleBetweenDegrees,
  bearingDegrees,
  haversineNm,
  polylineLengthNm,
  projectOntoPolyline,
} from "../geo";

const SHILSHOLE = { lat: 47.6775, lon: -122.4112 };
const FRIDAY_HARBOR = { lat: 48.5344, lon: -123.0139 };

describe("haversineNm", () => {
  it("measures a known Salish Sea run", () => {
    // Shilshole to Friday Harbor: ~57nm as the gull flies, against the
    // ~70nm the route tables give for going round Whidbey by water.
    expect(haversineNm(SHILSHOLE, FRIDAY_HARBOR)).toBeCloseTo(56.8, 0);
  });

  it("is zero for a point against itself and symmetric otherwise", () => {
    expect(haversineNm(SHILSHOLE, SHILSHOLE)).toBe(0);
    expect(haversineNm(SHILSHOLE, FRIDAY_HARBOR)).toBeCloseTo(
      haversineNm(FRIDAY_HARBOR, SHILSHOLE),
      9
    );
  });

  it("puts one minute of latitude at one nautical mile", () => {
    expect(haversineNm({ lat: 48, lon: -123 }, { lat: 48 + 1 / 60, lon: -123 })).toBeCloseTo(1, 2);
  });
});

describe("bearingDegrees", () => {
  it("reads north and south exactly along a meridian", () => {
    expect(bearingDegrees({ lat: 48, lon: -123 }, { lat: 49, lon: -123 })).toBeCloseTo(0, 4);
    expect(bearingDegrees({ lat: 48, lon: -123 }, { lat: 47, lon: -123 })).toBeCloseTo(180, 4);
  });

  it("reads east and west as an initial great-circle heading", () => {
    // A great circle between two points on the same parallel doesn't
    // follow that parallel — it bows poleward, so it sets off a fraction
    // of a degree north of due east and comes back. This is the initial
    // bearing, so 89.6° is right and 90° would be the wrong answer.
    expect(bearingDegrees({ lat: 48, lon: -123 }, { lat: 48, lon: -122 })).toBeCloseTo(89.63, 1);
    expect(bearingDegrees({ lat: 48, lon: -123 }, { lat: 48, lon: -124 })).toBeCloseTo(270.37, 1);
  });

  it("points northwest from Seattle to the San Juans", () => {
    const bearing = bearingDegrees(SHILSHOLE, FRIDAY_HARBOR);
    expect(bearing).toBeGreaterThan(315);
    expect(bearing).toBeLessThan(350);
  });
});

describe("angleBetweenDegrees", () => {
  it("never exceeds a half turn", () => {
    expect(angleBetweenDegrees(10, 350)).toBe(20);
    expect(angleBetweenDegrees(0, 180)).toBe(180);
    expect(angleBetweenDegrees(90, 90)).toBe(0);
  });

  it("ignores which way the turn goes", () => {
    expect(angleBetweenDegrees(350, 10)).toBe(angleBetweenDegrees(10, 350));
  });
});

describe("projectOntoPolyline", () => {
  // A due-north line up one degree of longitude, two segments.
  const line = [
    { lat: 48, lon: -123 },
    { lat: 48.5, lon: -123 },
    { lat: 49, lon: -123 },
  ];

  it("finds a point sitting on the line", () => {
    const projection = projectOntoPolyline({ lat: 48.25, lon: -123 }, line);
    expect(projection?.offsetNm).toBeCloseTo(0, 3);
    expect(projection?.alongNm).toBeCloseTo(15, 1);
    expect(projection?.segmentIndex).toBe(0);
  });

  it("measures how far a point sits off the line", () => {
    const projection = projectOntoPolyline({ lat: 48.75, lon: -123 + 1 / 60 / Math.cos(0) }, line);
    expect(projection?.segmentIndex).toBe(1);
    expect(projection?.offsetNm).toBeGreaterThan(0.3);
    expect(projection?.offsetNm).toBeLessThan(1);
  });

  it("clamps to the ends rather than running off them", () => {
    const before = projectOntoPolyline({ lat: 47, lon: -123 }, line);
    expect(before?.alongNm).toBeCloseTo(0, 1);

    const after = projectOntoPolyline({ lat: 50, lon: -123 }, line);
    expect(after?.alongNm).toBeCloseTo(polylineLengthNm(line), 0);
  });

  it("returns null when there is no line to measure against", () => {
    expect(projectOntoPolyline({ lat: 48, lon: -123 }, [])).toBeNull();
    expect(projectOntoPolyline({ lat: 48, lon: -123 }, [{ lat: 48, lon: -123 }])).toBeNull();
  });
});

describe("polylineLengthNm", () => {
  it("adds its segments", () => {
    expect(
      polylineLengthNm([
        { lat: 48, lon: -123 },
        { lat: 48.5, lon: -123 },
        { lat: 49, lon: -123 },
      ])
    ).toBeCloseTo(60, 0);
  });

  it("is zero for a degenerate line", () => {
    expect(polylineLengthNm([{ lat: 48, lon: -123 }])).toBe(0);
  });
});
