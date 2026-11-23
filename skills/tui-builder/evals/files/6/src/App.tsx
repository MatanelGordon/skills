import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

const readSize = () => ({
  columns: process.stdout.columns ?? 80,
  rows: process.stdout.rows ?? 24,
});

export default function App() {
  const {exit} = useApp();
  const [paused, setPaused] = useState(false);
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
    if (input === 'p') setPaused(value => !value);
  });

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Text bold>queue-monitor{paused ? ' (paused)' : ''}</Text>
      <Text>{'='.repeat(size.columns)}</Text>
      <Box flexGrow={1} />
      <Text dimColor>p pause, q quit</Text>
    </Box>
  );
}
