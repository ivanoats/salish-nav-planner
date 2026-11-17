import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GpxExport } from "@/application/gpx-export";
import { DownloadGpx } from "../panels/download-gpx";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("downloads the latest ready snapshot and blocks unavailable plans", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:current-plan");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  const filenames: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    filenames.push(this.download);
  });

  const ready = (destination: string): GpxExport => ({
    status: "ready",
    routes: [{
      name: `Day 1: Start → ${destination}`,
      points: [{ coordinates: [-122, 48], name: "Start" }, { coordinates: [-123, 49], name: destination }],
    }],
  });
  const view = render(<DownloadGpx exportResult={ready("Previous stop")} />);
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Download GPX" });
  view.rerender(<DownloadGpx exportResult={{
    status: "unavailable", reason: "Day 1: Route geometry is loading.",
  }} />);
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(createObjectURL).not.toHaveBeenCalled();

  view.rerender(<DownloadGpx exportResult={ready("Current stop")} />);
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(filenames).toEqual(["salish-sea-itinerary.gpx"]);
  const blob = createObjectURL.mock.calls[0]?.[0];
  if (blob === undefined) throw new Error("No GPX file was generated");
  const xml = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob, "UTF-8");
  });
  expect(xml).toContain("Day 1: Start → Current stop");
  expect(xml).not.toContain("Previous stop");
  vi.runOnlyPendingTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:current-plan");
});
