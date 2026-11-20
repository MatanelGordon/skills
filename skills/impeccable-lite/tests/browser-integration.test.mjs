import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../scripts/impeccable-lite.mjs', import.meta.url));
const skillRoot = dirname(dirname(cli));

const run = (root, args) => spawnSync(process.execPath, [cli, ...args], {
  cwd: root,
  encoding: 'utf8',
});

const pageHtml = `<!doctype html>
    <html lang="en"><head><meta name="viewport" content="width=device-width"><title>Seed library</title>
    <style>a:focus-visible{outline:2px solid currentColor}</style></head>
    <body><main><h1>Borrow a season</h1><a href="#catalog">Browse seeds</a></main></body></html>`;

const writeBriefAndPage = async (root) => {
  await writeFile(join(root, 'brief.json'), JSON.stringify({
    goal: 'Invite neighbors to exchange seeds.',
    audience: 'Urban gardeners',
    artifact: 'index.html',
    mode: 'persuade',
    scope: 'new',
    thesis: 'A seed packet index made architectural.',
    hierarchy: 'Season, seed, exchange.',
    constraints: ['No external assets'],
  }), 'utf8');
  await writeFile(join(root, 'index.html'), pageHtml, 'utf8');
};

test('doctor reports the isolated browser-capture runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-doctor-'));
  const checked = run(root, ['doctor', '--json', 'true']);
  assert.equal(checked.status, 0, checked.stderr);
  const report = JSON.parse(checked.stdout);
  assert.equal(report.captureAvailable, true);
  assert.equal(report.nodeCompatible, true);
  assert.match(report.dependency, /^puppeteer-core@/);
  assert.ok(report.enforcement.some((item) => /deny proxy/i.test(item)));
});

test('capture delegates to browser-capture while preserving Impeccable defaults', {
  timeout: 30_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-capture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), pageHtml, 'utf8');
  const captured = run(root, ['capture', '--entry', 'index.html']);
  if (captured.status === 64 && /No supported local Chrome/i.test(captured.stderr)) t.skip('Chrome is not installed.');
  assert.equal(captured.status, 0, captured.stderr);
  const report = JSON.parse(captured.stdout);
  assert.equal(report.producer, 'browser-capture');
  assert.deepEqual(report.captures.map(({ name, width, height }) => ({ name, width, height })), [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
  assert.equal(report.reportPath, 'capture.json');
});

test('a copied skill keeps a built-ins capture-to-completion path', {
  timeout: 45_000,
}, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'impeccable-lite-copy-'));
  const copiedSkill = join(temporary, 'impeccable-lite');
  const root = join(temporary, 'project');
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await cp(skillRoot, copiedSkill, { recursive: true });
  await mkdir(root);
  await writeBriefAndPage(root);
  const copiedCli = join(copiedSkill, 'scripts', 'impeccable-lite.mjs');
  const copiedRun = (args) => spawnSync(process.execPath, [copiedCli, ...args], { cwd: root, encoding: 'utf8' });

  const doctor = copiedRun(['doctor', '--json', 'true']);
  assert.equal(doctor.status, 0, doctor.stderr);
  const doctorReport = JSON.parse(doctor.stdout);
  assert.equal(doctorReport.captureAvailable, true);
  assert.equal(doctorReport.dependency, 'Node.js built-ins only');

  const captured = copiedRun(['capture', '--entry', 'index.html']);
  assert.equal(captured.status, 0, captured.stderr);
  const captureReport = JSON.parse(captured.stdout);
  assert.equal(captureReport.producer, 'browser-capture');
  const generationRoot = `.impeccable-lite/evidence/${captureReport.generation}`;

  assert.equal(copiedRun(['init', '--brief', 'brief.json']).status, 0);
  assert.equal(copiedRun(['advance', '--to', 'direction']).status, 0);
  assert.equal(copiedRun(['advance', '--to', 'build']).status, 0);
  assert.equal(copiedRun(['audit']).status, 0);
  assert.equal(copiedRun([
    'advance', '--to', 'audit', '--evidence', '.impeccable-lite/reports/audit.json',
  ]).status, 0);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  await writeFile(join(root, 'review.md'), `disposition: ship
material_findings: none
keep: the hierarchy
session_id: ${state.sessionId}
evidence_generation: ${captureReport.generation}
`, 'utf8');
  const complete = copiedRun([
    'advance', '--to', 'complete',
    '--evidence', '.impeccable-lite/reports/audit.json',
    '--evidence', `${generationRoot}/desktop.png`,
    '--evidence', `${generationRoot}/mobile.png`,
    '--evidence', `${generationRoot}/capture.json`,
    '--review', 'review.md',
  ]);
  assert.equal(complete.status, 0, complete.stderr);
  assert.equal(JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8')).phase, 'complete');
});
