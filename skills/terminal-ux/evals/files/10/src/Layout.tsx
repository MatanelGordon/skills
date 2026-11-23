import React from 'react';
import {Box, Text} from 'ink';

export type Job = {id: string; title: string; owner: string; state: string};

const WIDTH = 100;
const SIDEBAR = 28;

type Props = {jobs: readonly Job[]; selected: Job};

export const Layout = ({jobs, selected}: Props) => (
  <Box width={WIDTH}>
    <Box flexDirection="column" width={SIDEBAR} borderStyle="single">
      {jobs.map(job => (
        <Text key={job.id}>{job.title}</Text>
      ))}
    </Box>
    <Box flexDirection="column" width={WIDTH - SIDEBAR} borderStyle="single" paddingX={1}>
      <Text bold>{selected.title}</Text>
      <Text>owner {selected.owner}</Text>
      <Text>state {selected.state}</Text>
    </Box>
  </Box>
);
