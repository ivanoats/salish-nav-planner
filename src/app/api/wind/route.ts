import { loadDataset } from "@/adapters/inbound/next/load-dataset";
import { OpenMeteoWindForecast } from "@/adapters/outbound/open-meteo-wind-forecast";
import { isIsoDate, todayIso } from "@/domain/calendar";
import { MAX_TRIP_DAYS } from "@/domain/trip";

const provider = new OpenMeteoWindForecast();

/**
 * Daily wind for every zone over a trip's dates.
 *
 * Proxied through the server rather than called from the browser so the
 * upstream response can be cached once for everyone planning the same
 * week, instead of once per visitor.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get("start") ?? todayIso();
  if (!isIsoDate(startDate)) {
    return Response.json({ error: "start must be YYYY-MM-DD" }, { status: 400 });
  }

  const requestedDays = Number(searchParams.get("days") ?? MAX_TRIP_DAYS);
  if (!Number.isFinite(requestedDays) || requestedDays < 1) {
    return Response.json({ error: "days must be a positive number" }, { status: 400 });
  }
  const days = Math.min(MAX_TRIP_DAYS, Math.floor(requestedDays));

  const { windZones } = await loadDataset();

  try {
    const zones = await provider.forecast({ zones: windZones, startDate, days });
    return Response.json({ zones });
  } catch (error) {
    // A missing forecast degrades the plan rather than breaking it — the
    // planner falls back to distance-only ranking — so this reports the
    // failure without taking the page down with it.
    return Response.json(
      { error: error instanceof Error ? error.message : "wind forecast unavailable" },
      { status: 502 }
    );
  }
}
