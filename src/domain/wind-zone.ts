import { haversineNm } from "./geo";
import type { Coordinates } from "./location";

/**
 * A marine area treated as having one wind, sampled at a representative
 * point offshore.
 *
 * Forecasting every stop separately would be both slower and falsely
 * precise: a synoptic wind over the Salish Sea is coherent across tens of
 * miles, and the model's own grid is coarser than the gap between
 * neighbouring harbours. Zones mirror how NOAA and Environment Canada
 * actually issue marine forecasts, so the split lines up with the wording
 * a sailor already hears on the VHF.
 */
export interface WindZone extends Coordinates {
  readonly id: string;
  readonly name: string;
}

/** The zone whose sample point is closest to a position. */
export const nearestZone = (
  point: Coordinates,
  zones: readonly WindZone[]
): WindZone | null => {
  let best: WindZone | null = null;
  let bestNm = Infinity;

  for (const zone of zones) {
    const nm = haversineNm(point, zone);
    if (nm < bestNm) {
      bestNm = nm;
      best = zone;
    }
  }

  return best;
};
