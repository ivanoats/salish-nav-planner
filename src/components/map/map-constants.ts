/** Salish Sea map view constants shared across map components. */

/** Default center for the Salish Sea region. */
export const SALISH_SEA_CENTER: readonly [number, number] = [-123.1, 48.3];

/** Default zoom level to show the full Salish Sea area. */
export const SALISH_SEA_ZOOM = 7;

/** MapLibre source ID for the planned route GeoJSON layer. */
export const ROUTE_SOURCE_ID = "planned-route";

/** Marker colour for the trip's starting location. */
export const START_MARKER_COLOR = "#16a34a";

/** Marker colour for the trip's final destination. */
export const DEST_MARKER_COLOR = "#dc2626";

/** Marker colour for overnight stops between the start and end. */
export const STOPOVER_MARKER_COLOR = "#d97706";

/** Minimum padding (px) when fitting bounds to the planned route. */
export const FIT_BOUNDS_PADDING = 64;

/** Maximum zoom level when auto-fitting to a planned route. */
export const FIT_BOUNDS_MAX_ZOOM = 12;

/** Animation duration (ms) for auto-fit transitions. */
export const FIT_BOUNDS_DURATION = 500;

/** MapLibre source ID for every location in the dataset. */
export const LOCATIONS_SOURCE_ID = "all-locations";

/** MapLibre layer ID for the all-locations circle layer. */
export const LOCATIONS_LAYER_ID = "all-locations-circles";

/** Fill colour for the all-locations dots. */
export const LOCATION_DOT_COLOR = "#0f766e";

/** Halo colour that keeps the dots legible over land and water alike. */
export const LOCATION_DOT_STROKE_COLOR = "#ffffff";

/**
 * Dot radius by zoom. Small enough at the default Salish Sea zoom that 200+
 * harbours read as a scatter of ports rather than a solid smear, and large
 * enough to be a tappable target once zoomed into one.
 */
export const LOCATION_DOT_RADIUS: readonly (readonly [number, number])[] = [
  [6, 2.5],
  [9, 4],
  [12, 6],
];
