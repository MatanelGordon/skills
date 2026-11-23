import React from 'react';
import {render} from 'ink';
import App from './App.js';

// Full screen: draw in the alternate screen buffer and put the terminal back on exit.
process.stdout.write('\x1B[?1049h\x1B[?25l');
const restoreTerminal = () => process.stdout.write('\x1B[?25h\x1B[?1049l');
process.once('exit', restoreTerminal);

const {waitUntilExit} = render(<App />);

await waitUntilExit();
