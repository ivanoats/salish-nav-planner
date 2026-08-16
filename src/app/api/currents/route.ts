import { loadDataset } from "@/adapters/inbound/next/load-dataset";
import { RegionalCurrentPredictions } from "@/adapters/outbound/regional-current-predictions";
import type { CurrentEvent } from "@/domain/tidal";

const provider = new RegionalCurrentPredictions();

/**
 * A week of cruising crosses a few passes a day, so this sits well above
 * any real plan. It's a guard against a caller fanning the whole registry
 * out across two public agencies at once, not a limit anyone should meet.
 */
export const MAX_PASSES_PER_REQUEST = 24;

export interface PassCurrentsResponse {
  readonly passId: string;
  readonly events: readonly CurrentEvent[];
  /** Set when this one pass failed while others succeeded. */
  readonly error?: string;
}

/**
 * Predicted slack and maximum currents for the passes on a plan.
 *
 * Passes are named by id and resolved against the server's own registry,
 * so a caller can't point this at an arbitrary upstream station — the
 * only stations reachable are the ones the planner already knows about.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const requestedIds = (searchParams.get("passes") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  if (requestedIds.length === 0) {
    return Response.json({ passes: [] satisfies PassCurrentsResponse[] });
  }
  if (requestedIds.length > MAX_PASSES_PER_REQUEST) {
    return Response.json(
      { error: `at most ${MAX_PASSES_PER_REQUEST} passes per request` },
      { status: 400 }
    );
  }

  const fromMs = Number(searchParams.get("from"));
  const toMs = Number(searchParams.get("to"));
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return Response.json({ error: "from and to must be epoch milliseconds" }, { status: 400 });
  }

  const { passes } = await loadDataset();
  const byId = new Map(passes.map((pass) => [pass.id, pass] as const));

  const results = await Promise.all(
    requestedIds.map(async (passId): Promise<PassCurrentsResponse | null> => {
      const pass = byId.get(passId);
      if (pass === undefined) return null;

      try {
        const events = await provider.predictions({ station: pass.station, fromMs, toMs });
        return { passId, events };
      } catch (error) {
        // One station being down shouldn't blank the tidal panel for the
        // rest of the trip, so failures ride along per pass.
        return {
          passId,
          events: [],
          error: error instanceof Error ? error.message : "predictions unavailable",
        };
      }
    })
  );

  return Response.json({ passes: results.filter((result) => result !== null) });
}
