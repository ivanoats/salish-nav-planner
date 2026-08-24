import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedTripState } from "@/application/shareable-trip-url";
import {
  SharedTripWarning,
  ShareRouteControls,
} from "../panels/share-route-controls";
import {
  canonicalSharedTripUrl,
  useShareableTripUrl,
} from "../use-shareable-trip-url";

const sharedTrip: SharedTripState = {
  version: 1,
  days: 2,
  minHours: 3,
  maxHours: 8,
  speedKnots: 6,
  startSlug: "home",
  firstDestinationSlug: "first",
  startDate: "2026-08-24",
  departureMinutes: 480,
  mastHeightFeet: 50,
  windAware: true,
  roundTrip: false,
  customEndSlug: null,
  stopSlugs: ["home", "first", "auto"],
  pinnedDays: [],
};

beforeEach(() => {
  window.history.replaceState({}, "", "/?campaign=summer#map");
  vi.restoreAllMocks();
});

describe("shared trip URL synchronization", () => {
  it("builds one canonical absolute URL at the current path", () => {
    const url = canonicalSharedTripUrl(
      "https://example.test/cruise?campaign=summer#map",
      sharedTrip
    );

    expect(url).toBe(
      "https://example.test/cruise?" +
        "v=1&days=2&min-hours=3&max-hours=8&speed=6&start=home&first=first" +
        "&date=2026-08-24&depart=08%3A00&mast=50&wind=1&round=0&end=-" +
        "&stops=home%2Cfirst%2Cauto&pins=-"
    );
  });

  it("replaces the current URL without adding history or repeating the same write", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const historyLength = window.history.length;
    const { rerender } = renderHook(
      ({ state }) => useShareableTripUrl(state, false),
      { initialProps: { state: sharedTrip as SharedTripState | null } }
    );

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("v=1");
    expect(window.history.length).toBe(historyLength);

    rerender({ state: { ...sharedTrip } });
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("clears its canonical parameters if the plotted trip is removed", () => {
    const { rerender } = renderHook(
      ({ state }) => useShareableTripUrl(state, false),
      { initialProps: { state: sharedTrip as SharedTripState | null } }
    );

    rerender({ state: null });

    expect(window.location.search).toBe("");
  });

  it("removes malformed planner parameters when no valid trip could load", () => {
    window.history.replaceState({}, "", "/?v=99&days=nope&campaign=summer");
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderHook(() => useShareableTripUrl(null, true));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?campaign=summer");
  });
});

describe("ShareRouteControls", () => {
  it("shows a visible alert when an incoming shared link is malformed", () => {
    render(
      <SharedTripWarning
        issues={[
          {
            code: "unsupported-version",
            parameter: "v",
            message: "Shared trip version is not supported.",
          },
        ]}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "This shared link couldn’t be loaded."
    );
  });

  it("copies the canonical URL and announces success", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ShareRouteControls state={sharedTrip} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      await writeText.mock.results[0]?.value;
    });

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("?v=1&days=2")
    );
    expect(screen.getByRole("status").textContent).toBe("Link copied.");
  });

  it("announces a clipboard failure without claiming success", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ShareRouteControls state={sharedTrip} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Couldn’t copy the link. Copy it from the address bar."
      )
    );
  });
});
