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
      aria-label="Print route summary"
    >
      🖨 Print / Save PDF
    </button>
  );
}
