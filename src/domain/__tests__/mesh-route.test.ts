import { describe, expect, it } from "vitest";
import {
  buildMeshGraph,
  buildMeshRouteLineCoordinates,
  meshPathCoordinates,
  type MeshFeatureCollection,
} from "../mesh-route";
import type { Location } from "../location";
import type { PlannedRoute } from "../route";

/**
 * A toy mesh shaped like the real one: two harbours joined by a dogleg
 * through water, plus an island harbour reachable only the long way, and
 * one harbour with no line to it at all.
 *
 *   west (0,0) ── (0,1) ── (1,1) ── east (2,1)
 *   marooned (5,5) is on nothing
 */
const mesh: MeshFeatureCollection = {
  features: [
    {
      properties: { kind: "corridor", id: "dogleg" },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0, 1],
          [1, 1],
          [2, 1],
        ],
      },
    },
    {
      properties: { kind: "harbour", slug: "west" },
      geometry: { type: "Point", coordinates: [0, 0] },
    },
    {
      properties: { kind: "harbour", slug: "east" },
      geometry: { type: "Point", coordinates: [2, 1] },
    },
  ],
};

const at = (slug: string, lon: number, lat: number): Location => ({
  slug,
  name: slug,
  region: "US",
  lon,
  lat,
});

const west = at("west", 0, 0);
const east = at("east", 2, 1);
const marooned = at("marooned", 5, 5);

const leg = (from: string, to: string) => ({ from, to, nm: 1, hrMin: "1:00", via: [] });

describe("buildMeshGraph", () => {
  it("treats a coordinate shared between features as one node", () => {
    const graph = buildMeshGraph({
      features: [
        ...mesh.features,
        {
          properties: { kind: "spur", slug: "east" },
          geometry: { type: "LineString", coordinates: [[1, 1], [1, 2]] },
        },
      ],
    });

    // The spur starts on a vertex the corridor already had, so the graph
    // gains the spur's far end and nothing else.
    expect(graph.nodes).toHaveLength(5);
    // Degree, not identity: the corridor gives the shared vertex two
    // neighbours and the spur a third, which only holds if all three
    // features resolved to the same node.
    const shared = graph.byKey.get("1,1");
    if (shared === undefined) throw new Error("expected a node at 1,1");
    expect(graph.nodes[shared]?.edges).toHaveLength(3);
  });

  it("ignores Point features", () => {
    expect(buildMeshGraph(mesh).nodes).toHaveLength(4);
  });
});

describe("meshPathCoordinates", () => {
  it("follows the mesh rather than the straight line between two harbours", () => {
    const path = meshPathCoordinates(buildMeshGraph(mesh), west, east);

    expect(path).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it("is symmetric", () => {
    const graph = buildMeshGraph(mesh);
    const there = meshPathCoordinates(graph, west, east);
    const back = meshPathCoordinates(graph, east, west);

    expect(back).toEqual([...(there as unknown[])].reverse());
  });

  it("snaps a position that is near the mesh but not on it", () => {
    // Just off the harbour, as a published position often is.
    const path = meshPathCoordinates(buildMeshGraph(mesh), { lon: 0.001, lat: 0.001 }, east);

    expect(path?.[0]).toEqual([0, 0]);
  });

  it("returns null rather than throwing when both ends snap to one node", () => {
    const graph = buildMeshGraph(mesh);

    expect(meshPathCoordinates(graph, west, { lon: 0.0001, lat: 0.0001 })).toBeNull();
  });
});

describe("buildMeshRouteLineCoordinates", () => {
  const locations = new Map<string, Location>([
    ["west", west],
    ["east", east],
    ["marooned", marooned],
  ]);

  it("walks the water for a leg the mesh can serve", () => {
    const route: PlannedRoute = { legs: [leg("west", "east")], totalNm: 1, totalHrMin: "1:00" };

    expect(buildMeshRouteLineCoordinates(route, locations, buildMeshGraph(mesh))).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it("collapses the seam where one leg ends and the next begins", () => {
    const route: PlannedRoute = {
      legs: [leg("west", "east"), leg("east", "west")],
      totalNm: 2,
      totalHrMin: "2:00",
    };
    const line = buildMeshRouteLineCoordinates(route, locations, buildMeshGraph(mesh));

    // Out and back, with the shared turning point appearing once.
    expect(line).toHaveLength(7);
    expect(line[3]).toEqual([2, 1]);
  });

  it("falls back to a straight line for a leg the mesh cannot serve, and says so", () => {
    const route: PlannedRoute = {
      legs: [leg("west", "marooned")],
      totalNm: 1,
      totalHrMin: "1:00",
    };
    const fallbacks: { from: string; to: string }[] = [];

    const line = buildMeshRouteLineCoordinates(
      route,
      locations,
      buildMeshGraph(mesh),
      (failed) => fallbacks.push(failed)
    );

    expect(line).toEqual([
      [0, 0],
      [5, 5],
    ]);
    expect(fallbacks).toEqual([{ from: "west", to: "marooned" }]);
  });

  it("skips a leg whose endpoints are not in the dataset", () => {
    const route: PlannedRoute = { legs: [leg("nowhere", "east")], totalNm: 1, totalHrMin: "1:00" };

    expect(buildMeshRouteLineCoordinates(route, locations, buildMeshGraph(mesh))).toEqual([]);
  });
});
