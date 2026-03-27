import React from "react";
import { Box, Text } from "ink";

interface StatusBarItem {
  label: string;
  value: string;
}

interface StatusBarProps {
  items: StatusBarItem[];
}

export function StatusBar({ items }: StatusBarProps): React.ReactElement {
  return (
    <Box marginTop={1} paddingX={1}>
      <Box gap={2}>
        {items.map((item, index) => (
          <Box key={index} gap={0}>
            <Text backgroundColor="#333333" color="white" bold>
              {" "}{item.label}{" "}
            </Text>
            <Text color="#888888">
              {" "}{item.value}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
