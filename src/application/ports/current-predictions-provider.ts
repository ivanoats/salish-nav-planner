import type { CurrentStationRef } from "@/domain/pass";
import type { CurrentEvent } from "@/domain/tidal";

export interface CurrentPredictionsRequest {
  readonly station: CurrentStationRef;
  /** Window to cover, as epoch milliseconds. */
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Slack and maximum-current times for one station over a window.
 *
 * Tidal currents are astronomical, so unlike the weather these can be
 * asked for any date — the limit is the agency's published range, not a
 * forecast horizon.
 */
export interface CurrentPredictionsProvider {
  predictions(request: CurrentPredictionsRequest): Promise<readonly CurrentEvent[]>;
}
