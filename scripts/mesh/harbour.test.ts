// @vitest-environment node
import { describe, expect, it } from "vitest";
import { snapHarbourToWater } from "./harbour";
import type { WaterGrid } from "./water-grid";

const grid: WaterGrid = {
  cols: 3, rows: 3, minLon: 0, minLat: 0, dLon: 1, dLat: 1,
  water: new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]),
  clearance: new Uint8Array(9).fill(1),
  col: Math.floor, row: Math.floor,
  lon: (col) => col + 0.5, lat: (row) => row + 0.5,
};
const reviewed = { slug: "reviewed", lon: 1.5, lat: 1.5, requireWaterCell: true };

describe("snapHarbourToWater", () => {
  it.each([
    { lon: -0.5, lat: 1.5 }, { lon: 3, lat: 1.5 },
    { lon: 1.5, lat: -0.5 }, { lon: 1.5, lat: 3 },
  ])("skips an excluded regional endpoint at $lon,$lat", (point) => {
    expect(snapHarbourToWater(grid, { ...reviewed, ...point }, true)).toBeNull();
  });

  it.each([false, true])("rejects a dry reviewed endpoint with regional=%s", (regional) => {
    expect(() => snapHarbourToWater(grid, reviewed, regional)).toThrow(
      "reviewed: chart-reviewed approach is outside the mesh's water cells"
    );
  });

  it("rejects an out-of-grid reviewed endpoint in a full build", () => {
    expect(() => snapHarbourToWater(grid, { ...reviewed, lon: -0.5 }, false)).toThrow();
  });

  it.each([false, true])("uses a wet reviewed endpoint with regional=%s", (regional) => {
    expect(snapHarbourToWater(grid, { ...reviewed, lon: 0.5 }, regional)).toEqual({ col: 0, row: 1 });
  });

  it("preserves nearby water snapping for ordinary harbour positions", () => {
    expect(snapHarbourToWater(grid, { ...reviewed, requireWaterCell: false }, false)).not.toBeNull();
  });
});
