import React from 'react';
import {render} from 'ink';
import App from './App.js';

process.stdout.write('\x1B[?1049h');

const resetOnResize = () => process.stdout.write('\x1Bc');
process.stdout.on('resize', resetOnResize);

const {waitUntilExit} = render(<App />);

await waitUntilExit();
process.stdout.off('resize', resetOnResize);
process.stdout.write('\x1B[?1049l');
