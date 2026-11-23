import React from 'react';
import {Box, Text} from 'ink';
import {hbar, percent} from './bar';

type Props = {label: string; value: number; max: number; width: number};

export const Gauge = ({label, value, max, width}: Props) => (
  <Box borderStyle="round" paddingX={1} gap={1}>
    <Box width={12}>
      <Text wrap="truncate">{label}</Text>
    </Box>
    <Text>{hbar(value, max, width)}</Text>
    <Text>{String(percent(value, max)).padStart(3)}%</Text>
  </Box>
);
