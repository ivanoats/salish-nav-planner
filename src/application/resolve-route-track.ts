import { projectOntoPolyline } from "@/domain/geo";
import { meshPathCoordinates, type MeshGraph } from "@/domain/mesh-route";
import type { Location, Waypoint } from "@/domain/location";
import type { Obstruction } from "@/domain/obstruction";
import type { TidalPass } from "@/domain/pass";
import { isNamedPass, NAMED_PASS_MAX_OFFSET_NM } from "@/domain/pass-transit";
import type { PlannedRoute } from "@/domain/route";
import { buildDisplayedRouteLineCoordinates, type LonLat } from "@/domain/route-line";
import { buildCoordinateIndex, resolveViaCoordinatesWith } from "@/domain/via-resolution";

const NAMED_TRACK_OFFSET_NM = 1;
const BRIDGE_TRACK_OFFSET_NM = 0.25;
const asPoints = (line: readonly LonLat[]) => line.map(([lon, lat]) => ({ lon, lat }));

/**
 * A mesh line may refine a graph leg if it agrees with the selected
 * passages and known spans. The published distance stays on the leg.
 */
export const resolveRouteTrack = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  waypoints: readonly Waypoint[],
  passes: readonly TidalPass[],
  obstructions: readonly Obstruction[],
  mesh: MeshGraph | null
): PlannedRoute => {
  const index = buildCoordinateIndex([...locationsBySlug.values()], waypoints);

  return {
    ...route,
    legs: route.legs.map((leg) => {
      const from = locationsBySlug.get(leg.from);
      const to = locationsBySlug.get(leg.to);
      const fallback = buildDisplayedRouteLineCoordinates(
        { legs: [leg], totalNm: leg.nm, totalHrMin: leg.hrMin }, locationsBySlug, waypoints
      );
      const approximate = { ...leg, track: { source: "approximate" as const, coordinates: fallback } };
      if (mesh === null || from === undefined || to === undefined) return approximate;

      const coordinates = meshPathCoordinates(mesh, from, to);
      if (coordinates === null) return approximate;

      const line = asPoints(coordinates);
      const fallbackLine = asPoints(fallback);
      const viaPoints = resolveViaCoordinatesWith(leg.via, index);
      const namedPasses = passes.filter((pass) =>
        isNamedPass(pass, leg.via) &&
        (projectOntoPolyline(pass, fallbackLine)?.offsetNm ?? Infinity) <= NAMED_PASS_MAX_OFFSET_NM
      );
      const missesPassage = [...viaPoints, ...namedPasses].some((point) =>
        (projectOntoPolyline(point, line)?.offsetNm ?? Infinity) > NAMED_TRACK_OFFSET_NM
      );
      const changesSpans = obstructions.some((span) => {
        const onTrack = (projectOntoPolyline(span, line)?.offsetNm ?? Infinity) <= BRIDGE_TRACK_OFFSET_NM;
        return onTrack !== (leg.obstructionIds?.includes(span.id) ?? false);
      });

      return missesPassage || changesSpans ? approximate : { ...leg, track: { source: "mesh", coordinates } };
    }),
  };
};
