import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNumberInput } from "../use-number-input";

function makeEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>;
}

describe("useNumberInput", () => {
  it("initialises the display string from the parent value", () => {
    const { result } = renderHook(() => useNumberInput(6, vi.fn()));
    expect(result.current.inputValue).toBe("6");
  });

  it("does not call onChange while the field is empty (mid-edit)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumberInput(6, onChange));

    act(() => result.current.onInputChange(makeEvent("")));

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe("");
  });

  it("calls onChange with the parsed number when the user types a valid value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumberInput(6, onChange));

    act(() => result.current.onInputChange(makeEvent("10")));

    expect(onChange).toHaveBeenCalledWith(10);
    expect(result.current.inputValue).toBe("10");
  });

  it("calls onChange with 5 for the partial decimal '5.'", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumberInput(6, onChange));

    act(() => result.current.onInputChange(makeEvent("5.")));

    expect(onChange).toHaveBeenCalledWith(5);
    expect(result.current.inputValue).toBe("5.");
  });

  it("does not call onChange when a valid mid-edit string parses to the current value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumberInput(5, onChange));

    act(() => result.current.onInputChange(makeEvent("5.")));

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe("5.");
  });

  it("resets the display to the last valid value on blur when empty", () => {
    const { result } = renderHook(() => useNumberInput(6, vi.fn()));

    act(() => result.current.onInputChange(makeEvent("")));
    act(() => result.current.onBlur());

    expect(result.current.inputValue).toBe("6");
  });

  it("resets on blur when the typed string is invalid", () => {
    const { result } = renderHook(() => useNumberInput(6, vi.fn()));

    act(() => result.current.onInputChange(makeEvent("abc")));
    act(() => result.current.onBlur());

    expect(result.current.inputValue).toBe("6");
  });

  it("does not reset on blur when a valid number has been typed", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumberInput(6, onChange));

    act(() => result.current.onInputChange(makeEvent("8")));
    act(() => result.current.onBlur());

    expect(result.current.inputValue).toBe("8");
  });

  it("syncs the display string when the parent value changes externally to 0 while field is empty", () => {
    let value = 6;
    const { result, rerender } = renderHook(() => useNumberInput(value, vi.fn()));

    act(() => result.current.onInputChange(makeEvent("")));
    expect(result.current.inputValue).toBe("");

    value = 0;
    rerender();

    expect(result.current.inputValue).toBe("0");
  });

  it("syncs the display string when the parent value changes externally", () => {
    let value = 6;
    const { result, rerender } = renderHook(() => useNumberInput(value, vi.fn()));

    value = 10;
    rerender();

    expect(result.current.inputValue).toBe("10");
  });

  it("does not overwrite a matching in-progress edit when the parent echoes back", () => {
    // Scenario: user types "5", onChange fires with 5, parent re-renders with
    // value=5 — local string "5" must not be replaced with "5" (no-op fine).
    const onChange = vi.fn();
    let value = 6;
    const { result, rerender } = renderHook(() => useNumberInput(value, onChange));

    act(() => result.current.onInputChange(makeEvent("5")));
    value = 5;
    rerender();

    expect(result.current.inputValue).toBe("5");
  });
});
