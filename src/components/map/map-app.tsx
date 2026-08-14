"use client";

import dynamic from "next/dynamic";
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

export function MapApp(props: MapAppProps) {
  return (
    <div className={css({ width: "full", height: "full" })}>
      <MapView {...props} />
    </div>
  );
}
