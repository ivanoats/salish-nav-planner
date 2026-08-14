import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Location, Waypoint } from "@/domain/location";
import type { RouteEdge } from "@/domain/route";

const DATA_DIR = join(process.cwd(), "public", "data");

interface LocationFeature {
  readonly type: "Feature";
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: { readonly slug: string; readonly name: string; readonly region: "US" | "CA" };
}

interface LocationFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly LocationFeature[];
}

export interface Dataset {
  readonly locations: readonly Location[];
  readonly edges: readonly RouteEdge[];
  readonly waypoints: readonly Waypoint[];
}

const readJson = async <T>(fileName: string): Promise<T> => {
  const text = await readFile(join(DATA_DIR, fileName), "utf-8");
  return JSON.parse(text) as T;
};

export const loadDataset = async (): Promise<Dataset> => {
  const [geojson, edges, waypoints] = await Promise.all([
    readJson<LocationFeatureCollection>("locations.geojson"),
    readJson<RouteEdge[]>("edges.json"),
    readJson<Waypoint[]>("waypoints.json"),
  ]);

  const locations: Location[] = geojson.features.map((feature) => ({
    slug: feature.properties.slug,
    name: feature.properties.name,
    region: feature.properties.region,
    lon: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }));

  return { locations, edges, waypoints };
};
