import React from 'react';
import {Box, Text} from 'ink';

export type Step = {
  name: string;
  status: 'ok' | 'failed' | 'skipped';
  seconds: number;
};

export const DeploySteps = ({steps}: {steps: readonly Step[]}) => (
  <Box flexDirection="column">
    {steps.map(step => (
      <Box key={step.name} gap={1}>
        <Box width={28}>
          <Text wrap="truncate">{step.name}</Text>
        </Box>
        <Text>{step.seconds.toFixed(1)}s</Text>
      </Box>
    ))}
  </Box>
);
