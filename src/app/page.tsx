import { loadDataset } from "@/adapters/inbound/next/load-dataset";
import {
  decodeSharedTrip,
  searchParamsFromRecord,
} from "@/application/shareable-trip-url";
import { PlannerShell } from "@/components/layout/planner-shell";

interface HomeProps {
  readonly searchParams: Promise<
    Readonly<Record<string, string | string[] | undefined>>
  >;
}

export default async function Home({ searchParams }: HomeProps) {
  const [{ locations, edges, waypoints, passes, windZones, obstructions }, query] =
    await Promise.all([loadDataset(), searchParams]);
  const sharedTrip = decodeSharedTrip(
    searchParamsFromRecord(query),
    new Set(locations.map((location) => location.slug))
  );

  return (
    <PlannerShell
      locations={locations}
      edges={edges}
      waypoints={waypoints}
      passes={passes}
      windZones={windZones}
      obstructions={obstructions}
      chartPmtilesUrl={process.env.NEXT_PUBLIC_CHART_PMTILES_URL}
      initialTripState={sharedTrip.state}
      sharedTripIssues={sharedTrip.issues}
      hasIncomingSharedTrip={sharedTrip.hasSharedTrip}
    />
  );
}
