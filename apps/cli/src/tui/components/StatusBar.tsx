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
    <Box
      marginTop={1}
      paddingTop={0}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
    >
      <Box gap={1} paddingTop={0}>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <Box>
              <Text color="gray" bold>{item.label}</Text>
              <Text color="gray" dimColor> {item.value}</Text>
            </Box>
            {index < items.length - 1 && <Text color="gray" dimColor>{"  "}</Text>}
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
}
