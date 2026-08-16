"use client";

import { useEffect, useMemo, useState } from "react";
import { createWindField, EMPTY_WIND_FIELD, type ZoneWindForecast } from "@/domain/wind-field";
import type { IsoDate } from "@/domain/calendar";
import type { CurrentEvent } from "@/domain/tidal";
import type { WindField } from "@/domain/wind-field";
import type { WindZone } from "@/domain/wind-zone";

export type FetchStatus = "idle" | "loading" | "ready" | "error";

interface WindResponse {
  readonly zones?: readonly ZoneWindForecast[];
}

interface CurrentsResponse {
  readonly passes?: readonly { readonly passId: string; readonly events: readonly CurrentEvent[] }[];
}

/**
 * What came back, tagged with the request it answers.
 *
 * Status is derived by comparing that tag against the request currently
 * wanted rather than being written into state when the effect fires.
 * That keeps every `setState` inside an async callback — a synchronous
 * one in an effect costs a whole extra render pass — and has the better
 * property besides: last week's forecast can never be shown as "ready"
 * while this week's is still in flight.
 */
interface Loaded<T> {
  readonly key: string;
  readonly value: T;
  readonly failed: boolean;
}

const statusOf = (
  loaded: Loaded<unknown> | null,
  key: string,
  wanted: boolean
): FetchStatus => {
  if (!wanted) return "idle";
  if (loaded === null || loaded.key !== key) return "loading";
  return loaded.failed ? "error" : "ready";
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export interface WindFieldState {
  readonly windField: WindField;
  readonly status: FetchStatus;
}

const NO_FORECASTS: readonly ZoneWindForecast[] = [];

/**
 * The trip's wind, fetched once per date range.
 *
 * Deliberately independent of the plan: zones and dates are known before
 * any destination is picked, which is what lets the forecast feed back
 * into route ranking without the two chasing each other.
 */
export const useWindField = (
  zones: readonly WindZone[],
  startDate: IsoDate,
  days: number,
  enabled: boolean
): WindFieldState => {
  const [loaded, setLoaded] = useState<Loaded<readonly ZoneWindForecast[]> | null>(null);
  const key = `${startDate}:${days}`;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    fetch(`/api/wind?start=${startDate}&days=${days}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`wind request failed: ${response.status}`);
        return response.json() as Promise<WindResponse>;
      })
      .then((payload) => {
        setLoaded({ key, value: payload.zones ?? NO_FORECASTS, failed: false });
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setLoaded({ key, value: NO_FORECASTS, failed: true });
      });

    return () => controller.abort();
  }, [enabled, key, startDate, days]);

  const forecasts = loaded?.key === key ? loaded.value : NO_FORECASTS;

  const windField = useMemo(
    () =>
      !enabled || forecasts.length === 0 ? EMPTY_WIND_FIELD : createWindField(zones, forecasts),
    [enabled, zones, forecasts]
  );

  return { windField, status: statusOf(loaded, key, enabled) };
};

export interface PassCurrentsState {
  readonly currentsByPassId: ReadonlyMap<string, readonly CurrentEvent[]>;
  readonly status: FetchStatus;
}

const EMPTY_CURRENTS: ReadonlyMap<string, readonly CurrentEvent[]> = new Map();

/**
 * Predicted currents for exactly the passes a plan crosses.
 *
 * The pass ids are folded into a string key rather than compared by
 * reference, since the array is rebuilt on every re-plan and would
 * otherwise refetch on every keystroke that doesn't change which passes
 * are involved.
 */
export const usePassCurrents = (
  passIds: readonly string[],
  fromMs: number,
  toMs: number
): PassCurrentsState => {
  const [loaded, setLoaded] =
    useState<Loaded<ReadonlyMap<string, readonly CurrentEvent[]>> | null>(null);

  const ids = [...passIds].sort().join(",");
  const wanted = ids !== "" && Number.isFinite(fromMs) && Number.isFinite(toMs);
  const key = `${ids}:${fromMs}:${toMs}`;

  useEffect(() => {
    if (!wanted) return;

    const controller = new AbortController();

    fetch(`/api/currents?passes=${encodeURIComponent(ids)}&from=${fromMs}&to=${toMs}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`currents request failed: ${response.status}`);
        return response.json() as Promise<CurrentsResponse>;
      })
      .then((payload) => {
        setLoaded({
          key,
          value: new Map((payload.passes ?? []).map((p) => [p.passId, p.events] as const)),
          failed: false,
        });
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        setLoaded({ key, value: EMPTY_CURRENTS, failed: true });
      });

    return () => controller.abort();
  }, [wanted, key, ids, fromMs, toMs]);

  return {
    currentsByPassId: loaded?.key === key ? loaded.value : EMPTY_CURRENTS,
    status: statusOf(loaded, key, wanted),
  };
};
