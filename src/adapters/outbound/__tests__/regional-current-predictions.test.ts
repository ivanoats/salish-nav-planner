import { describe, expect, it, vi } from "vitest";
import { RegionalCurrentPredictions } from "../regional-current-predictions";
import type { CurrentPredictionsProvider } from "@/application/ports/current-predictions-provider";

const stub = (label: string): CurrentPredictionsProvider & { predictions: ReturnType<typeof vi.fn> } => ({
  predictions: vi.fn().mockResolvedValue([
    { type: "slack" as const, atMs: 0, speedKnots: 0, label },
  ]),
});

const window = { fromMs: 0, toMs: 1 };

describe("RegionalCurrentPredictions", () => {
  it("sends a US pass to NOAA", async () => {
    const noaa = stub("noaa");
    const chs = stub("chs");

    await new RegionalCurrentPredictions(noaa, chs).predictions({
      station: { source: "noaa", id: "PUG1701" },
      ...window,
    });

    expect(noaa.predictions).toHaveBeenCalledTimes(1);
    expect(chs.predictions).not.toHaveBeenCalled();
  });

  it("sends a Canadian pass to CHS", async () => {
    const noaa = stub("noaa");
    const chs = stub("chs");

    await new RegionalCurrentPredictions(noaa, chs).predictions({
      station: { source: "chs", id: "63aef1866a2b9417c035030f" },
      ...window,
    });

    expect(chs.predictions).toHaveBeenCalledTimes(1);
    expect(noaa.predictions).not.toHaveBeenCalled();
  });

  it("passes the request through untouched", async () => {
    const noaa = stub("noaa");
    const request = { station: { source: "noaa" as const, id: "PUG1701", bin: 33 }, ...window };

    await new RegionalCurrentPredictions(noaa, stub("chs")).predictions(request);

    expect(noaa.predictions).toHaveBeenCalledWith(request);
  });

  it("returns whichever agency's events came back", async () => {
    const chs = stub("chs");

    const events = await new RegionalCurrentPredictions(stub("noaa"), chs).predictions({
      station: { source: "chs", id: "x" },
      ...window,
    });

    expect(events).toHaveLength(1);
  });
});
