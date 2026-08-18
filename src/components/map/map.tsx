"use client";

import {
  addProtocol,
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LayerSpecification,
  type SourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { buildRouteLineCoordinates } from "@/domain/route-line";
import type { Location, Waypoint } from "@/domain/location";
import type { PlannedRoute } from "@/domain/route";

import {
  SALISH_SEA_CENTER,
  SALISH_SEA_ZOOM,
  ROUTE_SOURCE_ID,
  START_MARKER_COLOR,
  DEST_MARKER_COLOR,
  STOPOVER_MARKER_COLOR,
  FIT_BOUNDS_PADDING,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_DURATION,
  LOCATIONS_SOURCE_ID,
  LOCATIONS_LAYER_ID,
  LOCATION_DOT_COLOR,
  LOCATION_DOT_STROKE_COLOR,
  LOCATION_DOT_RADIUS,
} from "./map-constants";

interface MapProps {
  readonly locations: readonly Location[];
  readonly waypoints: readonly Waypoint[];
  /** Every overnight stop in order, starting with the trip's origin. */
  readonly stopLocations: readonly Location[];
  /** One route per planned day, in order. */
  readonly routes: readonly PlannedRoute[];
  /** Whether to draw a dot for every location in the dataset. */
  readonly showAllLocations: boolean;
  /** Optional local-only chart overlay — see README for how to set this up. */
  readonly chartPmtilesUrl?: string;
}

let protocolRegistered = false;
const ensurePmtilesProtocol = () => {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
};

/**
 * maplibre-gl otherwise derives its worker URL from `import.meta.url` at
 * runtime, which under Turbopack points at a chunk path that is never
 * emitted — the worker 404s and every GeoJSON source stays unparsed, so
 * vector layers silently never draw. `scripts/copy-maplibre-worker.mjs`
 * stages the worker here on install/dev/build.
 */
let workerUrlSet = false;
const ensureWorkerUrl = () => {
  if (workerUrlSet) return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  workerUrlSet = true;
};

const emptyFeatureCollection = (): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

export function MapView({
  locations,
  waypoints,
  stopLocations,
  routes,
  showAllLocations,
  chartPmtilesUrl,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const locationPopupRef = useRef<Popup | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    ensureWorkerUrl();
    ensurePmtilesProtocol();

    const sources: Record<string, SourceSpecification> = {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
      [ROUTE_SOURCE_ID]: { type: "geojson", data: emptyFeatureCollection() },
      [LOCATIONS_SOURCE_ID]: { type: "geojson", data: emptyFeatureCollection() },
    };
    const layers: LayerSpecification[] = [{ id: "basemap", type: "raster", source: "basemap" }];

    if (chartPmtilesUrl !== undefined && chartPmtilesUrl !== "") {
      sources.charts = {
        type: "vector",
        url: `pmtiles://${chartPmtilesUrl}`,
        attribution: "CHS ENC via bc-charts-pm",
      };
      layers.push(
        {
          id: "depth_areas",
          type: "fill",
          source: "charts",
          "source-layer": "depth_areas",
          paint: { "fill-color": "#a6cee3", "fill-opacity": 0.5 },
        },
        {
          id: "land_areas",
          type: "fill",
          source: "charts",
          "source-layer": "land_areas",
          paint: { "fill-color": "#f5deb3", "fill-opacity": 0.8 },
        },
        {
          id: "coastline",
          type: "line",
          source: "charts",
          "source-layer": "coastline",
          paint: { "line-color": "#333", "line-width": 1 },
        }
      );
    }

    // Below the route line so a leg is never hidden by the ports it links.
    // Starts hidden and is switched on by the visibility effect below, which
    // keeps `showAllLocations` out of this effect's deps — reading it here
    // would rebuild the whole map on every toggle.
    layers.push({
      id: LOCATIONS_LAYER_ID,
      type: "circle",
      source: LOCATIONS_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ...LOCATION_DOT_RADIUS.flat(),
        ],
        "circle-color": LOCATION_DOT_COLOR,
        "circle-opacity": 0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": LOCATION_DOT_STROKE_COLOR,
      },
    });

    layers.push({
      id: ROUTE_SOURCE_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        // Alternate hue by day parity so consecutive legs stay
        // distinguishable where a multi-day route doubles back on itself.
        "line-color": [
          "case",
          ["==", ["%", ["coalesce", ["get", "day"], 1], 2], 0],
          "#7c3aed",
          "#2563eb",
        ],
        "line-width": 3,
        // Dash lengths are multiples of line-width, so keep the "on"
        // segment >= ~1 or it renders as sub-pixel dots that vanish.
        "line-dasharray": [2, 1.5],
      },
    });

    const map = new MapLibreMap({
      container: containerRef.current,
      center: [SALISH_SEA_CENTER[0], SALISH_SEA_CENTER[1]],
      zoom: SALISH_SEA_ZOOM,
      style: { version: 8, sources, layers },
    });
    map.addControl(new NavigationControl());

    // A dot on its own says "something is here" without saying what, and 200
    // labels at once would be unreadable, so the name arrives on demand.
    map.on("click", LOCATIONS_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      if (feature === undefined || feature.geometry.type !== "Point") return;
      const [lon, lat] = feature.geometry.coordinates;
      if (lon === undefined || lat === undefined) return;

      locationPopupRef.current?.remove();
      locationPopupRef.current = new Popup()
        .setLngLat([lon, lat])
        .setText(String(feature.properties.name))
        .addTo(map);
    });
    map.on("mouseenter", LOCATIONS_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LOCATIONS_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    // "style.load" fires once sources/layers are queryable, without
    // waiting on tile network requests to finish — unlike "load", which
    // waits for the first visually-complete render (all initial tiles
    // fetched). Gating on "load" left the route line stuck unset
    // whenever a basemap/chart tile was slow or unreachable.
    setStyleLoaded(Boolean(map.isStyleLoaded()));
    map.on("style.load", () => setStyleLoaded(true));
    // Exposed for e2e/manual debugging, mirrors the window.__ndwtMap pattern.
    (window as unknown as { __navPlannerMap?: MapLibreMap }).__navPlannerMap = map;

    return () => {
      locationPopupRef.current?.remove();
      locationPopupRef.current = null;
      map.remove();
      mapRef.current = null;
      setStyleLoaded(false);
    };
  }, [chartPmtilesUrl]);

  // Every location in the dataset, as one GeoJSON source rather than 200-odd
  // DOM markers — the marker-per-location approach costs an element and a
  // per-frame reprojection each, and stutters badly while panning.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleLoaded) return;

    const source = map.getSource<GeoJSONSource>(LOCATIONS_SOURCE_ID);
    if (source === undefined) return;

    source.setData({
      type: "FeatureCollection",
      features: locations.map((location) => ({
        type: "Feature",
        properties: { slug: location.slug, name: location.name, region: location.region },
        geometry: { type: "Point", coordinates: [location.lon, location.lat] },
      })),
    });
  }, [locations, styleLoaded]);

  // Toggling visibility keeps the parsed source and its tiles warm, so
  // switching back on is instant — cheaper than adding and removing the layer.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleLoaded) return;
    if (map.getLayer(LOCATIONS_LAYER_ID) === undefined) return;

    map.setLayoutProperty(
      LOCATIONS_LAYER_ID,
      "visibility",
      showAllLocations ? "visible" : "none"
    );

    // A popup left open over a hidden layer points at nothing.
    if (!showAllLocations) {
      locationPopupRef.current?.remove();
      locationPopupRef.current = null;
    }
  }, [showAllLocations, styleLoaded]);

  // Stop markers: green for the trip's origin, red for its final stop,
  // amber for the overnight stops in between.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    stopLocations.forEach((stop, index) => {
      const isFirst = index === 0;
      const isLast = index === stopLocations.length - 1;
      const color = isFirst
        ? START_MARKER_COLOR
        : isLast
          ? DEST_MARKER_COLOR
          : STOPOVER_MARKER_COLOR;
      const label = isFirst ? "Start" : `Night ${index}`;

      markersRef.current.push(
        new Marker({ color })
          .setLngLat([stop.lon, stop.lat])
          .setPopup(new Popup().setText(`${label} — ${stop.name}`))
          .addTo(map)
      );
    });
  }, [stopLocations]);

  // Route line + fit bounds. Gated on `styleLoaded` state (set once via
  // the map's "load" event in the creation effect above) rather than
  // checking `map.isStyleLoaded()` here directly — that check plus a
  // one-shot `map.once("load", ...)` listener races when the route
  // prop changes before the initial style finishes loading: the
  // listener registered on an earlier run can miss an already-fired
  // "load" event, silently dropping the route line.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleLoaded) return;

    const source = map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID);
    if (source === undefined) return;

    const locationsBySlug = new Map(locations.map((l) => [l.slug, l] as const));
    const allCoordinates: [number, number][] = [];
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    routes.forEach((dayRoute, index) => {
      if (dayRoute.legs.length === 0) return;
      const coordinates = buildRouteLineCoordinates(dayRoute, locationsBySlug, waypoints).map(
        ([lon, lat]) => [lon, lat] as [number, number]
      );
      if (coordinates.length === 0) return;
      allCoordinates.push(...coordinates);
      features.push({
        type: "Feature",
        properties: { day: index + 1 },
        geometry: { type: "LineString", coordinates },
      });
    });

    source.setData({ type: "FeatureCollection", features });

    const [first, ...rest] = allCoordinates;
    if (first !== undefined) {
      const bounds = rest.reduce(
        (b, coord) => b.extend(coord),
        new LngLatBounds(first, first)
      );
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: FIT_BOUNDS_DURATION });
    }
  }, [routes, locations, waypoints, styleLoaded]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
