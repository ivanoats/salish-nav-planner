import { useId } from "react";
import { css } from "styled-system/css";
import { GPX_DESCRIPTION, type GpxExport } from "@/application/gpx-export";
import { serializeGpx } from "@/adapters/outbound/gpx-serializer";

export function DownloadGpx({ exportResult }: { readonly exportResult: GpxExport }) {
  const descriptionId = useId();

  const download = () => {
    if (exportResult.status !== "ready") return;
    const file = new Blob([serializeGpx(exportResult.routes)], {
      type: "application/gpx+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "salish-sea-itinerary.gpx";
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Give the browser time to start reading the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  };

  return (
    <div data-print-hide>
      <button
        type="button"
        disabled={exportResult.status !== "ready"}
        aria-describedby={descriptionId}
        onClick={download}
        className={css({
          minHeight: "10",
          paddingX: "3",
          borderWidth: "1px",
          borderColor: "border.default",
          borderRadius: "md",
          backgroundColor: "bg.default",
          fontSize: "sm",
          fontWeight: "medium",
          cursor: "pointer",
          _hover: { backgroundColor: "colorPalette.3" },
          _disabled: { cursor: "default", color: "fg.muted", backgroundColor: "bg.default" },
        })}
      >
        Download GPX
      </button>
      <div id={descriptionId} className={css({ marginTop: "1.5", fontSize: "xs", color: "fg.muted" })}>
        <p>{GPX_DESCRIPTION}</p>
        <p aria-live="polite">
          {exportResult.status === "unavailable" ? exportResult.reason : null}
        </p>
      </div>
    </div>
  );
}
