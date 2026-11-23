import React, {useEffect, useState} from 'react';
import {Text} from 'ink';

export default function StatusBar() {
  const [columns, setColumns] = useState(process.stdout.columns ?? 80);

  // Resize listener C
  useEffect(() => {
    const onResize = () => {
      process.stdout.write('\x1B[2K');
      setColumns(process.stdout.columns ?? 80);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return <Text inverse>{' q quit'.padEnd(columns)}</Text>;
}
