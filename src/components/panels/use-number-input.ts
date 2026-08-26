"use client";

import { useState } from "react";

/**
 * Manages a number input's local string value so mid-edit states (empty
 * field, partial decimals like "5.") don't immediately snap the controlled
 * value back to 0 or the previous number.
 *
 * - While the user is typing, the raw string is kept locally.
 * - `onChange` is called only when the typed string parses to a finite number.
 * - On blur, if the field is empty or invalid the display resets to the last
 *   committed `value` from the parent.
 * - If the parent's `value` changes from outside, the local string is updated
 *   (unless the field currently holds a valid in-progress edit that already
 *   matches — this avoids clobbering "5." with "5" mid-type).
 */
export function useNumberInput(
  value: number,
  onChange: (n: number) => void
): {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
} {
  const [inputValue, setInputValue] = useState(String(value));
  const [lastCommittedValue, setLastCommittedValue] = useState(value);

  // Keep local string in sync when the parent value changes externally
  // (e.g. URL hydration, clamping feedback from the hook).
  if (value !== lastCommittedValue) {
    setLastCommittedValue(value);
    // Overwrite if the current string is empty (mid-delete), or if it no
    // longer represents the same number — avoids stomping "5." while the user
    // is mid-typing, but also handles the edge case where value is 0 and the
    // field has been cleared (Number("") === 0 would otherwise skip the sync).
    if (inputValue === "" || Number(inputValue) !== value) {
      setInputValue(String(value));
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setInputValue(raw);
    const parsed = Number(raw);
    if (raw !== "" && Number.isFinite(parsed) && parsed !== value) {
      onChange(parsed);
    }
  }

  function onBlur() {
    const parsed = Number(inputValue);
    if (inputValue === "" || !Number.isFinite(parsed)) {
      // Reset display to last valid committed value.
      setInputValue(String(value));
    }
  }

  return { inputValue, onInputChange, onBlur };
}
