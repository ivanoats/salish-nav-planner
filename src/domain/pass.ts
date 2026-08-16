import type { Coordinates } from "./location";

export type CurrentStationSource = "noaa" | "chs";

/**
 * Which agency's prediction station stands in for a pass. The Salish Sea
 * straddles the border, so US passes come from NOAA and Canadian ones
 * from the Canadian Hydrographic Service — Active Pass, Dodd Narrows and
 * Porlier are simply not in NOAA's tables.
 */
export interface CurrentStationRef {
  readonly source: CurrentStationSource;
  readonly id: string;
  /**
   * NOAA's harmonic stations predict a separate profile per depth bin.
   * A boat feels the shallowest one, so that's what gets stored; absent
   * for subordinate stations and for CHS, which publish a single series.
   */
  readonly bin?: number;
  readonly depthFeet?: number;
}

/**
 * A place where the tide, not the distance, decides when you go through.
 * Curated by hand rather than derived: plenty of named channels carry no
 * meaningful current, and a few unnamed spots do.
 */
export interface TidalPass extends Coordinates {
  readonly id: string;
  readonly name: string;
  /** Other spellings used in the scraped route tables, e.g. "Agate Pass". */
  readonly aliases?: readonly string[];
  readonly station: CurrentStationRef;
  /** The station's own name, so the panel can show whose numbers these are. */
  readonly stationName: string;
  /**
   * The direction a flood sets *toward*, degrees true. Without it the
   * planner can report how hard the water is running but not whether
   * it's with you, so the UI stays deliberately vaguer when it's null.
   */
  readonly floodDirectionDegrees: number | null;
  /** Rough peak spring rate in knots — how gnarly this pass gets at worst. */
  readonly maxKnots: number | null;
}
