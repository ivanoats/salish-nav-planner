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
  // Store both the last committed external value and the displayed string so
  // we can detect external changes without an effect or reading refs in render.
  const [state, setState] = useState({ committedValue: value, inputValue: String(value) });

  // Derived-state update: when `value` changes from outside, reset the string
  // unless it already represents the same number and the field isn't empty.
  // React supports calling setState during render for derived-state (equivalent
  // to the class-based getDerivedStateFromProps pattern). Storing committedValue
  // in state ensures this only fires once per distinct incoming value, preventing
  // any render loop.
  let inputValue = state.inputValue;
  if (state.committedValue !== value) {
    const next =
      state.inputValue === "" || Number(state.inputValue) !== value
        ? String(value)
        : state.inputValue;
    setState({ committedValue: value, inputValue: next });
    inputValue = next;
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setState((prev) => ({ ...prev, inputValue: raw }));
    const parsed = Number(raw);
    if (raw !== "" && Number.isFinite(parsed)) {
      onChange(parsed);
    }
  }

  function onBlur() {
    const parsed = Number(inputValue);
    if (inputValue === "" || !Number.isFinite(parsed)) {
      // Reset display to last valid committed value.
      setState((prev) => ({ ...prev, inputValue: String(value) }));
    }
  }

  return { inputValue, onInputChange, onBlur };
}
