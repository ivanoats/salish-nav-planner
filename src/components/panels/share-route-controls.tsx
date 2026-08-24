"use client";

import { useState } from "react";
import { css } from "styled-system/css";
import {
  encodeSharedTrip,
  type SharedTripIssue,
  type SharedTripState,
} from "@/application/shareable-trip-url";
import { canonicalSharedTripUrl } from "@/components/use-shareable-trip-url";

interface ShareRouteControlsProps {
  readonly state: SharedTripState;
}

type CopyStatus = {
  readonly result: "copied" | "error";
  readonly encodedState: string;
} | null;

export function SharedTripWarning({
  issues,
}: {
  readonly issues: readonly SharedTripIssue[];
}) {
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      className={css({
        padding: "3",
        borderWidth: "1px",
        borderColor: "colorPalette.7",
        borderRadius: "md",
        backgroundColor: "colorPalette.2",
        color: "fg.default",
        fontSize: "sm",
      })}
    >
      <strong>Shared link problem.</strong>{" "}
      This shared link couldn’t be loaded. The planner is using safe defaults instead.
    </div>
  );
}

export function ShareRouteControls({ state }: ShareRouteControlsProps) {
  const [status, setStatus] = useState<CopyStatus>(null);
  const encodedState = encodeSharedTrip(state).toString();
  const currentResult = status?.encodedState === encodedState ? status.result : null;

  const copyLink = async () => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(canonicalSharedTripUrl(window.location.href, state));
      setStatus({ result: "copied", encodedState });
    } catch {
      setStatus({ result: "error", encodedState });
    }
  };

  return (
    <div
      data-print-hide
      className={css({ display: "flex", flexDirection: "column", gap: "1.5" })}
    >
      <button
        type="button"
        onClick={copyLink}
        className={css({
          minHeight: "10",
          paddingX: "3",
          borderWidth: "1px",
          borderColor: "border.default",
          borderRadius: "md",
          backgroundColor: "bg.default",
          color: "fg.default",
          fontSize: "sm",
          fontWeight: "medium",
          cursor: "pointer",
          transitionProperty: "transform, background-color, border-color",
          transitionDuration: "200ms",
          transitionTimingFunction: "ease-out",
          _hover: { backgroundColor: "colorPalette.3" },
          _active: { transform: "scale(0.97)" },
          _focusVisible: {
            outline: "2px solid",
            outlineColor: "colorPalette.9",
            outlineOffset: "2px",
          },
        })}
      >
        Copy link
      </button>
      <p
        role="status"
        aria-live="polite"
        className={css({
          fontSize: "xs",
          color: currentResult === "error" ? "fg.error" : "fg.muted",
        })}
      >
        {currentResult === "copied"
          ? "Link copied."
          : currentResult === "error"
            ? "Couldn’t copy the link. Copy it from the address bar."
            : null}
      </p>
    </div>
  );
}
