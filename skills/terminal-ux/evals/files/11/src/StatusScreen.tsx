import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';

export type Check = {name: string; state: 'running' | 'passed' | 'failed'};

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const COLORS = {running: 'yellow', passed: 'green', failed: 'red'} as const;

export const StatusScreen = ({checks}: {checks: readonly Check[]}) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(current => (current + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Checks</Text>
      {checks.map(check => (
        <Box key={check.name} gap={1}>
          <Text color={COLORS[check.state]}>
            {check.state === 'running' ? FRAMES[frame] : '●'}
          </Text>
          <Text>{check.name}</Text>
        </Box>
      ))}
    </Box>
  );
};
