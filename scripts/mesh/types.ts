/** Source types for the Salish Sea navigation mesh. */

/** [lon, lat], as GeoJSON orders it. */
export type LonLat = readonly [number, number];

/**
 * How much water a corridor is drawn for, which is roughly how much
 * slack it leaves you. `trunk` is a main shipping-scale channel,
 * `secondary` an inlet or island channel, `pass` a tidal gate you time
 * rather than simply steer through.
 */
export type CorridorClass = "trunk" | "secondary" | "pass";

/**
 * One named waterway in the hand-authored skeleton: what it is called,
 * what class of water it is, what it branches from, and the control
 * points that put it in the right body of water. The geometry between
 * those points is traced by the build, not declared here.
 */
export interface CorridorSpec {
  readonly id: string;
  readonly name: string;
  readonly corridorClass: CorridorClass;
  /**
   * `wind-zones.json` id this corridor mostly sits in. Omitted for the
   * Inside Passage north of Cape Caution, which is beyond the zones the
   * planner forecasts for.
   */
  readonly zone?: string;
  /**
   * `passes.json` id, when this corridor is the passage that file names.
   * Independent of `corridorClass`, which says how much sea room the
   * corridor has rather than what it is: Rosario Strait and Haro Strait
   * are both trunk channels and both named passes.
   */
  readonly passId?: string;
  /** `obstructions.json` ids of overhead clearances along it. */
  readonly obstructionIds?: readonly string[];
  readonly note?: string;
  /**
   * Ordered control points, seaward end first where there is one. These
   * are hand-placed in the right body of water, not traced: the builder
   * runs the water search between consecutive points, so what ends up
   * in the mesh follows the real shoreline rather than my memory of it.
   */
  readonly path: readonly LonLat[];
  /**
   * Corridor this one branches off. The builder joins the first control
   * point to the nearest point on that corridor and splits it there, so
   * the two share an exact vertex and the mesh stays a graph.
   */
  readonly startsOn?: string;
  /** Same, for the last control point. */
  readonly endsOn?: string;
}

/**
 * A hand-traced approach for a harbour whose generated spur goes wrong —
 * usually because the harbour's published position sits inland of its
 * own breakwater. Seaward end first, harbour last.
 */
export interface SpurOverride {
  readonly slug: string;
  readonly note?: string;
  readonly path: readonly LonLat[];
}
