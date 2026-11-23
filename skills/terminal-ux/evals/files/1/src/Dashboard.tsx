import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import type {EventEmitter} from 'node:events';

// `source` emits:
//   'sample'  about 200 times a second  -> {rps, p99}
//   'event'   a few times a minute      -> {id, line}
export type Sample = {rps: number; p99: number};
export type LogEvent = {id: number; line: string};

const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const HISTORY = 60;

export const Dashboard = ({source}: {source: EventEmitter}) => {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);

  useEffect(() => {
    const onSample = (sample: Sample) =>
      setSamples(previous => [...previous, sample].slice(-HISTORY));
    const onEvent = (event: LogEvent) => setEvents(previous => [...previous, event]);
    source.on('sample', onSample);
    source.on('event', onEvent);
    return () => {
      source.off('sample', onSample);
      source.off('event', onEvent);
    };
  }, [source]);

  const rps = samples.map(sample => sample.rps);
  const p99 = samples.map(sample => sample.p99);

  let rpsChart = '';
  const rpsMin = Math.min(...rps);
  const rpsMax = Math.max(...rps);
  for (const value of rps) {
    rpsChart += BLOCKS[Math.round(((value - rpsMin) / (rpsMax - rpsMin)) * 8)];
  }

  let p99Chart = '';
  const p99Min = Math.min(...p99);
  const p99Max = Math.max(...p99);
  for (const value of p99) {
    p99Chart += BLOCKS[Math.round(((value - p99Min) / (p99Max - p99Min)) * 8)];
  }

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Requests/s</Text>
          <Text>{rpsChart}</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>p99 ms</Text>
          <Text>{p99Chart}</Text>
        </Box>
      </Box>
      <Text bold>Events</Text>
      {events.map(event => (
        <Text key={event.id} dimColor>
          {event.line}
        </Text>
      ))}
    </Box>
  );
};
