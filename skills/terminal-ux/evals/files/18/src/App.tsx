import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import StatusBar from './StatusBar.js';

const readSize = () => ({
  columns: process.stdout.columns ?? 80,
  rows: process.stdout.rows ?? 24,
});

export default function App() {
  const {exit} = useApp();
  const [size, setSize] = useState(readSize);

  // Resize listener B
  useEffect(() => {
    const onResize = () => {
      process.stdout.write('\x1B[2J\x1B[H');
      setSize(readSize());
    };
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
      <Text bold>release-board</Text>
      <Text>{'-'.repeat(size.columns)}</Text>
      <Text>3 releases waiting for sign-off</Text>
      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
