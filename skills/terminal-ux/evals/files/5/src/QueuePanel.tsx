import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';

export type Queue = {name: string; depth: number; limit: number; lastError: string};

const WIDTH = 80;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const pad = (text: string, size: number): string =>
  text + ' '.repeat(Math.max(0, size - text.length));

type Props = {queues: readonly Queue[]; log: readonly string[]};

// `log` only ever grows: one line is appended for every message that is retried.
export const QueuePanel = ({queues, log}: Props) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(current => (current + 1) % SPINNER.length), 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" width={WIDTH}>
      <Text bold>
        {SPINNER[frame]} Queues
      </Text>
      {queues.map(queue => (
        <Text key={queue.name} color={queue.depth > queue.limit ? 'red' : 'green'}>
          {pad(queue.name, 24)}
          {String(queue.depth).padStart(7)}
          {'  '}
          {queue.lastError}
        </Text>
      ))}
      <Text>{'─'.repeat(WIDTH)}</Text>
      {log.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </Box>
  );
};
