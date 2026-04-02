"use client";

import { useEffect, useState } from "react";

export const useDelayedFlag = (trigger: boolean, delayMs: number, resetKey = 0): boolean => {
  const [state, setState] = useState({
    value: false,
    resetKey,
  });

  if (state.resetKey !== resetKey) {
    setState({ value: false, resetKey });
  }

  const value = state.resetKey === resetKey ? state.value : false;

  useEffect(() => {
    if (!trigger || value) return;
    const timer = window.setTimeout(
      () =>
        setState({
          value: true,
          resetKey,
        }),
      delayMs,
    );
    return () => window.clearTimeout(timer);
  }, [trigger, value, delayMs, resetKey]);

  return value;
};
