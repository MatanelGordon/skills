import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

const STATE_COLUMN = 10;
const JOBS = [
  {name: 'nightly-backup-eu-west', state: 'running'},
  {name: 'reindex-search', state: 'queued'},
  {name: 'rotate-certificates', state: 'done'},
];

export default function App() {
  const {exit} = useApp();
  const [selected, setSelected] = useState(0);
  const [rows, setRows] = useState(process.stdout.rows ?? 24);
  const width = process.stdout.columns ?? 80;
  const nameColumn = width - STATE_COLUMN;

  useEffect(() => {
    const onResize = () => setRows(process.stdout.rows ?? 24);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  useInput((input, key) => {
    if (input === 'q') exit();
    if (key.downArrow) setSelected(index => Math.min(index + 1, JOBS.length - 1));
    if (key.upArrow) setSelected(index => Math.max(index - 1, 0));
  });

  return (
    <Box flexDirection="column" height={rows}>
      <Text bold>Jobs</Text>
      <Text>{'─'.repeat(width)}</Text>
      {JOBS.map((job, index) => (
        <Text key={job.name} inverse={index === selected}>
          {job.name.padEnd(nameColumn).slice(0, nameColumn)}
          {job.state.padStart(STATE_COLUMN)}
        </Text>
      ))}
      <Text>{'─'.repeat(width)}</Text>
      <Box flexGrow={1} />
      <Text dimColor>up/down to select, q to quit</Text>
    </Box>
  );
}
