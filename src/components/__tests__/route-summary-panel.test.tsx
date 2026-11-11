import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DayConditions, PassTransitConditions } from "@/application/day-conditions";
import type { TripDay } from "@/domain/trip";
import { RouteSummaryPanel } from "../panels/route-summary-panel";

const firstDay: TripDay = {
  dayNumber: 1,
  fromSlug: "start",
  toSlug: "finish",
  source: "manual",
  route: {
    legs: [{ from: "start", to: "finish", nm: 12, hrMin: "2:00", via: [] }],
    totalNm: 12,
    totalHrMin: "2:00",
  },
};

const passConditions: PassTransitConditions = {
  transit: {
    pass: {
      id: "deception-pass",
      name: "Deception Pass",
      lat: 48.407,
      lon: -122.644,
      station: { source: "noaa", id: "test-station" },
      stationName: "Deception Pass",
      floodDirectionDegrees: 90,
      maxKnots: 8,
    },
    detection: "named",
    alongRouteNm: 6,
    offRouteNm: 0,
    courseDegrees: 90,
    etaMinutes: 540,
  },
  advice: {
    signedKnots: 2.4,
    verdict: "fair",
    setsWithYou: true,
    nearestSlack: null,
    nextSlack: null,
    minutesToNextSlack: null,
  },
};

const stationConditions: DayConditions = {
  dayNumber: 1,
  date: "2026-11-11",
  wind: null,
  passes: [passConditions],
};

const renderSummary = (tripDays: readonly TripDay[], dayConditions: readonly DayConditions[] = []) =>
  render(
    <RouteSummaryPanel
      tripDays={tripDays}
      totalNm={12}
      speedKnots={6}
      departureMinutes={480}
      mastHeightFeet={45}
      locationsBySlug={new Map()}
      dayConditions={dayConditions}
      currentsLoading={false}
      obstructionsFor={() => []}
    />
  );

const forecastLinkName = /regional surface-current forecast on NANOOS Boaters/i;

describe("regional surface-current forecast in the route summary", () => {
  it("links once to the verified forecast viewer for a multi-day route without pass stations", () => {
    renderSummary([firstDay, { ...firstDay, dayNumber: 2 }]);

    const link = screen.getByRole("link", { name: forecastLinkName });
    expect(link.getAttribute("href")).toBe("https://nvs.nanoos.org/Boaters");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText(/Forecast Arrows → Currents \(Surface\)/u)).toBeDefined();
  });

  it("shows station timing and the regional forecast link together", () => {
    renderSummary([firstDay], [stationConditions]);

    expect(screen.getByText(/2\.4 kt flood · fair current/)).toBeDefined();
    expect(screen.getByRole("link", { name: forecastLinkName })).toBeDefined();
  });

  it("explains how to find the nearest forecast and check its timestamp when the selected time has no overlay", () => {
    renderSummary([firstDay]);

    expect(screen.getByText(/if no overlay appears, use select closest data point and check its timestamp/i)).toBeDefined();
  });

  it("keeps missing station advice visible alongside the regional forecast link", () => {
    renderSummary([firstDay], [
      { ...stationConditions, passes: [{ ...passConditions, advice: null }] },
    ]);

    expect(screen.getByText("no current prediction for this time")).toBeDefined();
    expect(screen.getByRole("link", { name: forecastLinkName })).toBeDefined();
  });

  it("keeps the route summary empty when there is no plotted route", () => {
    const { container } = renderSummary([{ ...firstDay, route: null }]);

    expect(container.firstChild).toBeNull();
  });
});
