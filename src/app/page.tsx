import { loadDataset } from "@/adapters/inbound/next/load-dataset";
import { PlannerShell } from "@/components/layout/planner-shell";

export default async function Home() {
  const { locations, edges, waypoints } = await loadDataset();

  return (
    <PlannerShell
      locations={locations}
      edges={edges}
      waypoints={waypoints}
      chartPmtilesUrl={process.env.NEXT_PUBLIC_CHART_PMTILES_URL}
    />
  );
}
