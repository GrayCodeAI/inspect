import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

const DOTS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BOUNCE = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"];

interface SpinnerProps {
  label?: string;
  color?: string;
  variant?: "dots" | "bounce";
}

export function Spinner({
  label,
  color = "magenta",
  variant = "dots",
}: SpinnerProps): React.ReactElement {
  const [frame, setFrame] = useState(0);
  const frames = variant === "bounce" ? BOUNCE : DOTS;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((i) => (i + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, [frames.length]);

  return (
    <Box>
      <Text color={color}>{frames[frame]}</Text>
      {label && <Text color="white"> {label}</Text>}
    </Box>
  );
}
