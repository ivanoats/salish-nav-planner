"use client";

import { css } from "styled-system/css";

const buttonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  paddingX: "3",
  paddingY: "1.5",
  fontSize: "sm",
  fontWeight: "medium",
  borderWidth: "1px",
  borderColor: "border.default",
  borderRadius: "md",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
});

export function PrintButton() {
  return (
    <button
      type="button"
      data-print-button
      className={buttonStyle}
      onClick={() => window.print()}

    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={css({ width: "5", height: "5", flexShrink: 0 })}
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print / Save PDF
    </button>
  );
}
