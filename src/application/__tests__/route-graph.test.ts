import { describe, expect, it } from "vitest";
import { buildRouteGraph, findRoute } from "../route-graph";
import type { RouteEdge } from "@/domain/route";

const edges: RouteEdge[] = [
  {
    from: "shilshole",
    to: "friday_harbor",
    nm: 60.0,
    hrMin: "8:34",
    via: ["Admiralty Inlet"],
    routeUrl: "route.0233.html",
  },
  {
    from: "shilshole",
    to: "anacortes",
    nm: 59.1,
    hrMin: "8:32",
    via: ["Saratoga Passage"],
    routeUrl: "route.0173.html",
  },
  {
    from: "anacortes",
    to: "sucia_island",
    nm: 20.0,
    hrMin: "2:52",
    via: [],
    routeUrl: "route.9999.html",
  },
];

describe("findRoute", () => {
  it("returns a direct 1-leg route when a direct edge exists", () => {
    const graph = buildRouteGraph(edges);
    const route = findRoute(graph, "shilshole", "friday_harbor");
    expect(route).not.toBeNull();
    expect(route?.legs).toHaveLength(1);
    expect(route?.totalNm).toBe(60.0);
    expect(route?.totalHrMin).toBe("8:34");
  });

  it("chains through an intermediate hop when no direct edge exists", () => {
    const graph = buildRouteGraph(edges);
    const route = findRoute(graph, "shilshole", "sucia_island");
    expect(route).not.toBeNull();
    expect(route?.legs.map((l) => l.to)).toEqual(["anacortes", "sucia_island"]);
    expect(route?.totalNm).toBeCloseTo(79.1, 5);
  });

  it("traverses edges in either direction (undirected)", () => {
    const graph = buildRouteGraph(edges);
    const route = findRoute(graph, "friday_harbor", "shilshole");
    expect(route?.legs).toHaveLength(1);
    expect(route?.legs[0]?.to).toBe("shilshole");
  });

  it("returns an empty route for the same start and destination", () => {
    const graph = buildRouteGraph(edges);
    const route = findRoute(graph, "shilshole", "shilshole");
    expect(route).toEqual({ legs: [], totalNm: 0, totalHrMin: "0:00" });
  });

  it("returns null when no path exists", () => {
    const graph = buildRouteGraph(edges);
    const route = findRoute(graph, "shilshole", "nowhere");
    expect(route).toBeNull();
  });
});
