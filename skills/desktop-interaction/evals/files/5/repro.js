const { _electron: electron } = require('playwright');

const INSTALLED = '/Applications/Acme Notes.app/Contents/MacOS/Acme Notes';
const useInstalled = process.env.TARGET === 'installed';

(async () => {
  const options = useInstalled ? { executablePath: INSTALLED } : { args: ['.'] };
  console.log(`launching: ${useInstalled ? INSTALLED : 'dev build (electron .)'}`);
  const app = await electron.launch(options);
  const win = await app.firstWindow();
  console.log(`window title: ${await win.title()}`);
  await win.click('text=Export');
  await win.screenshot({ path: 'export.png' });
  console.log('clicked Export, wrote export.png');
  await app.close();
})();
