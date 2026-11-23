import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export const Counter = ({step = 1}: {step?: number}) => {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === '+' || key.upArrow) setCount(current => current + step);
    if (input === '-' || key.downArrow) setCount(current => current - step);
  });

  return (
    <Box borderStyle="round" paddingX={1}>
      <Text>Count: {count}</Text>
    </Box>
  );
};
