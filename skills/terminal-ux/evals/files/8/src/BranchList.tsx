import React, {useState} from 'react';
import {Box, Text} from 'ink';

export type Branch = {name: string; ahead: number; behind: number};

type Props = {
  branches: readonly Branch[];
  onCheckout: (name: string) => void;
  onDelete: (name: string) => void;
};

export const BranchList = ({branches, onCheckout, onDelete}: Props) => {
  const [selected, setSelected] = useState(0);

  return (
    <Box flexDirection="column">
      <Text bold>Branches</Text>
      {branches.map((branch, index) => (
        <Text key={branch.name} inverse={index === selected}>
          {branch.name} +{branch.ahead} -{branch.behind}
        </Text>
      ))}
    </Box>
  );
};
