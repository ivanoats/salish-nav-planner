import { snapToWater, type Cell } from "./router";
import type { WaterGrid } from "./water-grid";

interface HarbourPosition {
  readonly slug: string;
  readonly lon: number;
  readonly lat: number;
  readonly requireWaterCell?: boolean;
}

/** Regional builds skip excluded harbours, but still validate reviewed approaches inside the grid. */
export const snapHarbourToWater = (
  grid: WaterGrid,
  location: HarbourPosition,
  regional: boolean
): Cell | null => {
  const col = grid.col(location.lon);
  const row = grid.row(location.lat);
  const outside = col < 0 || col >= grid.cols || row < 0 || row >= grid.rows;
  if (regional && outside) return null;

  const harbour = snapToWater(grid, location.lon, location.lat, {
    // A reviewed point must occupy water itself. Searching farther could
    // reconnect it to the network across a headland.
    maxCells: location.requireWaterCell ? 0 : 90,
    wantClearance: 1,
  });
  if (harbour === null && location.requireWaterCell) {
    throw new Error(`${location.slug}: chart-reviewed approach is outside the mesh's water cells`);
  }
  return harbour;
};
