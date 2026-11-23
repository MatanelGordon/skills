import React from 'react';
import {render} from 'ink';
import App from './App.js';

process.stdout.write('\x1B[?1049h\x1B[?25l');
process.once('exit', () => process.stdout.write('\x1B[?25h\x1B[?1049l'));

// Resize listener A
const clearOnResize = () => process.stdout.write('\x1B[2J\x1B[H');
process.stdout.on('resize', clearOnResize);

const {waitUntilExit} = render(<App />);

await waitUntilExit();
process.stdout.off('resize', clearOnResize);
