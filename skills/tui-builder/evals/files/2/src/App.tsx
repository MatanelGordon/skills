import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

const readSize = () => ({
  columns: process.stdout.columns ?? 80,
  rows: process.stdout.rows ?? 24,
});

// Placeholder that fills the window. The log list, the filter bar and the detail pane come later.
export default function App() {
  const {exit} = useApp();
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    const onResize = () => setSize(readSize());
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  useInput(input => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Text bold>logbrowse</Text>
      <Text dimColor>no log source connected yet</Text>
      <Box flexGrow={1} />
      <Text inverse> q quit </Text>
    </Box>
  );
}
