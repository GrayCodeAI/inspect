import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  focus?: boolean;
  color?: string;
  cursorColor?: string;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  focus = true,
  color = "white",
  cursorColor = "magenta",
}: TextInputProps): React.ReactElement {
  const [cursorPos, setCursorPos] = useState(value.length);

  // Keep cursor within bounds
  const clamp = (pos: number) => Math.max(0, Math.min(pos, value.length));

  const insert = useCallback((char: string) => {
    const pos = clamp(cursorPos);
    const newVal = value.slice(0, pos) + char + value.slice(pos);
    onChange(newVal);
    setCursorPos(pos + char.length);
  }, [value, cursorPos, onChange]);

  const deleteRange = useCallback((start: number, end: number) => {
    const newVal = value.slice(0, start) + value.slice(end);
    onChange(newVal);
    setCursorPos(start);
  }, [value, onChange]);

  // Find word boundary backward from pos
  const wordBoundaryBack = useCallback((pos: number): number => {
    let i = pos - 1;
    // Skip whitespace
    while (i >= 0 && /\s/.test(value[i]!)) i--;
    // Skip word chars
    while (i >= 0 && !/\s/.test(value[i]!)) i--;
    return i + 1;
  }, [value]);

  // Find word boundary forward from pos
  const wordBoundaryForward = useCallback((pos: number): number => {
    let i = pos;
    // Skip word chars
    while (i < value.length && !/\s/.test(value[i]!)) i++;
    // Skip whitespace
    while (i < value.length && /\s/.test(value[i]!)) i++;
    return i;
  }, [value]);

  useInput((input, key) => {
    if (!focus) return;

    const pos = clamp(cursorPos);

    // Submit
    if (key.return) {
      onSubmit?.();
      return;
    }

    // Navigation
    if (key.leftArrow && !key.meta) {
      setCursorPos(clamp(pos - 1));
      return;
    }
    if (key.rightArrow && !key.meta) {
      setCursorPos(clamp(pos + 1));
      return;
    }

    // Ctrl shortcuts
    if (key.ctrl) {
      switch (input) {
        case "a": // Move to start
          setCursorPos(0);
          return;
        case "e": // Move to end
          setCursorPos(value.length);
          return;
        case "b": // Back one char
          setCursorPos(clamp(pos - 1));
          return;
        case "f": // Forward one char
          setCursorPos(clamp(pos + 1));
          return;
        case "w": // Delete word backward
          deleteRange(wordBoundaryBack(pos), pos);
          return;
        case "k": // Delete to end of line
          deleteRange(pos, value.length);
          return;
        case "u": // Delete to start of line
          deleteRange(0, pos);
          return;
        case "d": // Delete char at cursor
          if (pos < value.length) {
            deleteRange(pos, pos + 1);
          }
          return;
        case "t": { // Transpose chars
          if (pos >= 2) {
            const newVal =
              value.slice(0, pos - 2) +
              value[pos - 1] +
              value[pos - 2] +
              value.slice(pos);
            onChange(newVal);
          }
          return;
        }
      }
    }

    // Meta (Alt) shortcuts
    if (key.meta) {
      if (input === "b" || key.leftArrow) {
        // Alt+B or Alt+Left - word back
        setCursorPos(wordBoundaryBack(pos));
        return;
      }
      if (input === "f" || key.rightArrow) {
        // Alt+F or Alt+Right - word forward
        setCursorPos(wordBoundaryForward(pos));
        return;
      }
    }

    // Backspace
    if (key.backspace || key.delete) {
      if (pos > 0) {
        deleteRange(pos - 1, pos);
      }
      return;
    }

    // Regular character input
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      insert(input);
    }
  }, { isActive: focus });

  // Render text with cursor
  const pos = clamp(cursorPos);
  const before = value.slice(0, pos);
  const cursorChar = value[pos] ?? " ";
  const after = value.slice(pos + 1);

  if (!value && !focus) {
    return <Text color="gray" dimColor>{placeholder ?? ""}</Text>;
  }

  if (!value && focus) {
    return (
      <Box>
        <Text color="gray" dimColor>{placeholder ?? ""}</Text>
        <Text backgroundColor={cursorColor} color="white">{" "}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={color}>{before}</Text>
      {focus ? (
        <Text backgroundColor={cursorColor} color="white">{cursorChar}</Text>
      ) : (
        <Text color={color}>{cursorChar}</Text>
      )}
      <Text color={color}>{after}</Text>
    </Box>
  );
}
