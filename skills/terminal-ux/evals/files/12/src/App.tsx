import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

const SERVICES = ['api', 'web', 'worker', 'billing'];

export default function App() {
  const {exit} = useApp();
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setUptime(seconds => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useInput(input => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color="cyan">DEPLOY WATCH</Text>
      {SERVICES.map(name => (
        <Text key={name}>{name.padEnd(10)} healthy</Text>
      ))}
      <Text dimColor>up {uptime}s - q to quit</Text>
    </Box>
  );
}
