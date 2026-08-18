"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { css } from "styled-system/css";
import type { Location, Waypoint } from "@/domain/location";
import type { PlannedRoute } from "@/domain/route";

// maplibre-gl touches `window` at import time — keep this client-only.
const MapView = dynamic(() => import("./map").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div
      className={css({
        width: "full",
        height: "full",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "fg.muted",
        fontSize: "sm",
      })}
    >
      Loading map…
    </div>
  ),
});

interface MapAppProps {
  readonly locations: readonly Location[];
  readonly waypoints: readonly Waypoint[];
  readonly stopLocations: readonly Location[];
  readonly routes: readonly PlannedRoute[];
  readonly chartPmtilesUrl?: string;
}

export function MapApp({ locations, ...rest }: MapAppProps) {
  // Off by default: the planned route is what the map is for, and a scatter of
  // every harbour in the Salish Sea over the top of it buries the answer.
  const [showAllLocations, setShowAllLocations] = useState(false);

  return (
    <div className={css({ position: "relative", width: "full", height: "full" })}>
      <MapView locations={locations} showAllLocations={showAllLocations} {...rest} />

      {/* Top-left: maplibre's own zoom controls own the top-right corner.
          Hidden with no dataset — a switch that reveals nothing reads as
          broken, and `ALLOW_EMPTY_DATASET` builds have no locations at all. */}
      {locations.length === 0 ? null : (
        <label
          className={css({
            position: "absolute",
            top: "2",
            left: "2",
            zIndex: "1",
            display: "flex",
            alignItems: "center",
            gap: "2",
            paddingX: "2.5",
            paddingY: "2",
            fontSize: "sm",
            cursor: "pointer",
            borderWidth: "1px",
            borderColor: "border.default",
            borderRadius: "md",
            backgroundColor: "bg.default",
            boxShadow: "sm",
            _hover: { backgroundColor: "colorPalette.2" },
          })}
        >
          <input
            type="checkbox"
            checked={showAllLocations}
            onChange={(e) => setShowAllLocations(e.target.checked)}
            className={css({
              cursor: "pointer",
              _focusVisible: {
                outline: "2px solid",
                outlineColor: "colorPalette.9",
                outlineOffset: "2px",
              },
            })}
          />
          Show all {locations.length} locations
        </label>
      )}
    </div>
  );
}
