import { ChsCurrentPredictions } from "./chs-current-predictions";
import { NoaaCurrentPredictions } from "./noaa-current-predictions";
import type {
  CurrentPredictionsProvider,
  CurrentPredictionsRequest,
} from "@/application/ports/current-predictions-provider";
import type { CurrentEvent } from "@/domain/tidal";

/**
 * Sends each pass to the agency that predicts it.
 *
 * The cruising ground crosses an international border that the tide pays
 * no attention to, so the split is a fact about data publishers rather
 * than about the water. Keeping it here means nothing above this line has
 * to know which side of the line a pass sits on.
 */
export class RegionalCurrentPredictions implements CurrentPredictionsProvider {
  constructor(
    private readonly noaa: CurrentPredictionsProvider = new NoaaCurrentPredictions(),
    private readonly chs: CurrentPredictionsProvider = new ChsCurrentPredictions()
  ) {}

  predictions(request: CurrentPredictionsRequest): Promise<readonly CurrentEvent[]> {
    return request.station.source === "chs"
      ? this.chs.predictions(request)
      : this.noaa.predictions(request);
  }
}
