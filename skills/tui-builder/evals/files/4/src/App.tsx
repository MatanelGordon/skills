import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

const TABS = ['Builds', 'Deploys', 'Alerts'];
const readSize = () => ({
  columns: process.stdout.columns ?? 80,
  rows: process.stdout.rows ?? 24,
});

export default function App() {
  const {exit} = useApp();
  const [active, setActive] = useState(0);
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    const onResize = () => setSize(readSize());
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  // Wipe the screen when the terminal is resized so no rows from the old size are left behind.
  useEffect(() => {
    const clearOnResize = () => process.stdout.write('\x1B[2J\x1B[H');
    process.stdout.on('resize', clearOnResize);
    return () => {
      process.stdout.off('resize', clearOnResize);
    };
  }, []);

  useInput((input, key) => {
    if (input === 'q') exit();
    if (key.rightArrow) setActive(index => (index + 1) % TABS.length);
    if (key.leftArrow) setActive(index => (index + TABS.length - 1) % TABS.length);
  });

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Box>
        {TABS.map((tab, index) => (
          <Text key={tab} inverse={index === active}> {tab} </Text>
        ))}
      </Box>
      <Text>Showing {TABS[active].toLowerCase()} for the last 24 hours.</Text>
      <Box flexGrow={1} />
      <Text dimColor>left/right to switch tabs, q to quit</Text>
    </Box>
  );
}
