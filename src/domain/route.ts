/** One scraped nwcruising.net table row: a direct link between two locations. */
export interface RouteEdge {
  readonly from: string; // Location slug
  readonly to: string; // Location slug
  readonly nm: number;
  readonly hrMin: string; // "H:MM" as published, e.g. "8:34"
  readonly via: readonly string[];
  readonly routeUrl: string;
}

/** One hop of a planned route, resolved to its endpoint locations. */
export interface RouteLeg {
  readonly from: string; // Location slug
  readonly to: string; // Location slug
  readonly nm: number;
  readonly hrMin: string;
  readonly via: readonly string[];
  /**
   * Ids of bridges this hop goes under. Empty when the graph was built
   * without obstruction geometry.
   */
  readonly obstructionIds?: readonly string[];
}

export interface PlannedRoute {
  readonly legs: readonly RouteLeg[];
  readonly totalNm: number;
  readonly totalHrMin: string;
}
