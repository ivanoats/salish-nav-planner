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

type ActionStatus = {
  readonly result: "shared" | "copied" | "error";
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

const buttonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5",
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
});

export function ShareRouteControls({ state }: ShareRouteControlsProps) {
  const [status, setStatus] = useState<ActionStatus>(null);
  const encodedState = encodeSharedTrip(state).toString();
  const currentResult = status?.encodedState === encodedState ? status.result : null;

  const getShareUrl = () => canonicalSharedTripUrl(window.location.href, state);

  const shareLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.share({ title: "Salish Sea Nav Planner", url });
      setStatus({ result: "shared", encodedState });
    } catch (err) {
      // User cancelled the share sheet — not an error worth surfacing
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus({ result: "error", encodedState });
    }
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(getShareUrl());
      setStatus({ result: "copied", encodedState });
    } catch {
      setStatus({ result: "error", encodedState });
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      data-print-hide
      className={css({ display: "flex", flexDirection: "column", gap: "1.5" })}
    >
      <div className={css({ display: "flex", gap: "2" })}>
        {canNativeShare ? (
          <button type="button" onClick={shareLink} className={buttonStyle}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={css({ width: "4", height: "4", flexShrink: 0 })}
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        ) : null}
        <button type="button" onClick={copyLink} className={buttonStyle}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={css({ width: "4", height: "4", flexShrink: 0 })}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy link
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={css({
          fontSize: "xs",
          color: currentResult === "error" ? "fg.error" : "fg.muted",
        })}
      >
        {currentResult === "shared"
          ? "Route shared."
          : currentResult === "copied"
            ? "Link copied."
            : currentResult === "error"
              ? "Couldn’t complete that action. Copy the link from the address bar."
              : null}
      </p>
    </div>
  );
}
