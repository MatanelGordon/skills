import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const cli = fileURLToPath(new URL('../scripts/impeccable-lite.mjs', import.meta.url));

const run = (root, args) => spawnSync(process.execPath, [cli, ...args], {
  cwd: root,
  encoding: 'utf8',
});

const runAsync = (root, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: 'ignore' });
  child.once('error', rejectRun);
  child.once('close', (status) => resolveRun(status));
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

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return chunk;
};
const createPng = (width, height) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = (width * 4) + 1;
  const pixels = Buffer.alloc(stride * height);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const writeCaptureEvidence = async (
  root,
  { entry = 'index.html', generation = 'capture-test', resources = ['index.html'] } = {},
) => {
  const directory = join(root, '.impeccable-lite', 'evidence', generation);
  await mkdir(directory, { recursive: true });
  const desktop = join(directory, 'desktop.png');
  const mobile = join(directory, 'mobile.png');
  const manifest = join(directory, 'capture.json');
  const desktopPng = createPng(1440, 1000);
  const mobilePng = createPng(390, 844);
  await writeFile(desktop, desktopPng);
  await writeFile(mobile, mobilePng);
  const artifactHash = sha256(await readFile(join(root, 'index.html')));
  const capturedResources = await Promise.all(resources.map(async (path) => ({
    path,
    sha256: sha256(await readFile(join(root, path))),
  })));
  await writeFile(manifest, `${JSON.stringify({
    ok: true,
    entry,
    artifactHash,
    generation,
    reportPath: manifest,
    resources: capturedResources,
    captures: [
      {
        name: 'desktop', width: 1440, height: 1000, cssWidth: 1440, cssHeight: 1000,
        path: desktop, sha256: sha256(desktopPng), overflow: false, blockedRequests: [],
      },
      {
        name: 'mobile', width: 390, height: 844, cssWidth: 390, cssHeight: 844,
        path: mobile, sha256: sha256(mobilePng), overflow: false, blockedRequests: [],
      },
    ],
  })}\n`, 'utf8');
  return Object.freeze({
    desktop: `.impeccable-lite/evidence/${generation}/desktop.png`,
    mobile: `.impeccable-lite/evidence/${generation}/mobile.png`,
    manifest: `.impeccable-lite/evidence/${generation}/capture.json`,
  });
};

test('CLI initializes, advances, emits a packet, and audits without dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-'));
  await writeBriefAndPage(root);

  const initialized = run(root, ['init', '--brief', 'brief.json']);
  assert.equal(initialized.status, 0, initialized.stderr);

  const statePath = join(root, '.impeccable-lite', 'session.json');
  const initializedState = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(initializedState.phase, 'brief');

  const packet = run(root, ['packet', '--role', 'direction']);
  assert.equal(packet.status, 0, packet.stderr);
  assert.match(packet.stdout, /Direction explorer/);
  assert.doesNotMatch(packet.stdout, /https?:\/\//);

  const advanced = run(root, ['advance', '--to', 'direction', '--note', 'Chose the seed index.']);
  assert.equal(advanced.status, 0, advanced.stderr);

  const audited = run(root, ['audit']);
  assert.equal(audited.status, 0, audited.stderr);
  const report = JSON.parse(await readFile(join(root, '.impeccable-lite', 'reports', 'audit.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(dirname(join(root, '.impeccable-lite', 'reports', 'audit.json')), join(root, '.impeccable-lite', 'reports'));
});

test('CLI never creates output directories through an outside symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-outside-'));
  await writeBriefAndPage(root);
  assert.equal(run(root, ['init', '--brief', 'brief.json']).status, 0);
  await symlink(outside, join(root, 'escape'));

  const attempted = run(root, [
    'packet', '--role', 'direction', '--out', 'escape/created/packet.md',
  ]);

  assert.notEqual(attempted.status, 0);
  assert.match(attempted.stderr, /symlink|escapes|unsafe/i);
  await assert.rejects(access(join(outside, 'created')));
});

test('concurrent initialization is serialized and never overwrites state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-lock-'));
  await writeBriefAndPage(root);

  const statuses = await Promise.all([
    runAsync(root, ['init', '--brief', 'brief.json']),
    runAsync(root, ['init', '--brief', 'brief.json']),
  ]);

  assert.equal(statuses.filter((status) => status === 0).length, 1);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  assert.equal(state.phase, 'brief');
  assert.equal(state.history.length, 1);
});

test('initialization recovers a lock left by a dead process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-stale-lock-'));
  await writeBriefAndPage(root);
  await mkdir(join(root, '.impeccable-lite'), { recursive: true });
  await writeFile(
    join(root, '.impeccable-lite', 'session.json.lock'),
    '999999 11111111-1111-4111-8111-111111111111 2020-01-01T00:00:00.000Z\n',
    'utf8',
  );

  const initialized = run(root, ['init', '--brief', 'brief.json']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  assert.equal(state.phase, 'brief');
});

test('concurrent stale-lock recovery preserves mutual exclusion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-stale-race-'));
  await writeBriefAndPage(root);
  await mkdir(join(root, '.impeccable-lite'), { recursive: true });
  await writeFile(
    join(root, '.impeccable-lite', 'session.json.lock'),
    '999999 11111111-1111-4111-8111-111111111111 2020-01-01T00:00:00.000Z\n',
    'utf8',
  );

  const statuses = await Promise.all([
    runAsync(root, ['init', '--brief', 'brief.json']),
    runAsync(root, ['init', '--brief', 'brief.json']),
  ]);

  assert.equal(statuses.filter((status) => status === 0).length, 1);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  assert.equal(state.phase, 'brief');
  assert.equal(state.history.length, 1);
});

test('initialization never removes an unpublished or malformed lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-incomplete-lock-'));
  await writeBriefAndPage(root);
  await mkdir(join(root, '.impeccable-lite'), { recursive: true });
  const lockPath = join(root, '.impeccable-lite', 'session.json.lock');
  await writeFile(lockPath, '', 'utf8');

  const initialized = run(root, ['init', '--brief', 'brief.json']);
  assert.notEqual(initialized.status, 0);
  assert.match(initialized.stderr, /locked by another process/i);
  assert.equal(await readFile(lockPath, 'utf8'), '');
});

test('CLI gates audit, review, and completion on validated local evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-flow-'));
  await writeBriefAndPage(root);
  assert.equal(run(root, ['init', '--brief', 'brief.json']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'direction']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'build']).status, 0);

  const missingAudit = run(root, ['advance', '--to', 'audit']);
  assert.notEqual(missingAudit.status, 0);
  assert.match(missingAudit.stderr, /passing audit evidence/i);

  assert.equal(run(root, ['audit', '--out', 'reports/custom-check']).status, 0);
  const forgedAudit = JSON.parse(await readFile(join(root, 'reports', 'custom-check.json'), 'utf8'));
  await writeFile(
    join(root, 'reports', 'wrong-artifact.json'),
    JSON.stringify({ ...forgedAudit, source: 'other.html' }),
    'utf8',
  );
  const wrongAudit = run(root, [
    'advance', '--to', 'audit', '--evidence', 'reports/wrong-artifact.json',
  ]);
  assert.notEqual(wrongAudit.status, 0);
  assert.match(wrongAudit.stderr, /index\.html/);
  assert.equal(run(root, [
    'advance', '--to', 'audit', '--evidence', 'reports/custom-check.json',
  ]).status, 0);

  const missingCaptures = run(root, [
    'advance', '--to', 'review', '--evidence', 'reports/custom-check.json',
  ]);
  assert.notEqual(missingCaptures.status, 0);
  assert.match(missingCaptures.stderr, /desktop\.png.*mobile\.png/i);

  const unrelatedCapture = await writeCaptureEvidence(root, { entry: 'other.html', generation: 'capture-other' });
  const unrelated = run(root, [
    'packet', '--role', 'reviewer',
    '--audit', 'reports/custom-check.json',
    '--evidence', unrelatedCapture.desktop,
    '--evidence', unrelatedCapture.mobile,
    '--evidence', unrelatedCapture.manifest,
  ]);
  assert.notEqual(unrelated.status, 0);
  assert.match(unrelated.stderr, /does not belong to `index\.html`/);

  const capture = await writeCaptureEvidence(root);
  assert.equal(run(root, [
    'advance', '--to', 'review',
    '--evidence', 'reports/custom-check.json',
    '--evidence', capture.desktop,
    '--evidence', capture.mobile,
    '--evidence', capture.manifest,
  ]).status, 0);

  const missingDisposition = run(root, ['advance', '--to', 'complete']);
  assert.notEqual(missingDisposition.status, 0);
  assert.match(missingDisposition.stderr, /review/i);

  await writeFile(join(root, 'review-bad.md'), 'Verdict: PASS\n', 'utf8');
  const wrongDisposition = run(root, ['advance', '--to', 'complete', '--review', 'review-bad.md']);
  assert.notEqual(wrongDisposition.status, 0);
  assert.match(wrongDisposition.stderr, /disposition: ship/i);

  const reviewState = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  await writeFile(join(root, 'review.md'), `disposition: ship
material_findings: none
keep: the hierarchy
session_id: ${reviewState.sessionId}
evidence_generation: capture-test
`, 'utf8');

  await writeFile(join(root, 'index.html'), `${pageHtml}\n<!-- changed after capture -->\n`, 'utf8');
  const staleEvidence = run(root, ['advance', '--to', 'complete', '--review', 'review.md']);
  assert.notEqual(staleEvidence.status, 0);
  assert.match(staleEvidence.stderr, /passing audit evidence|capture evidence/i);
  await writeFile(join(root, 'index.html'), pageHtml, 'utf8');

  assert.equal(run(root, [
    'advance', '--to', 'complete', '--review', 'review.md', '--note', 'No material findings.',
  ]).status, 0);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  assert.equal(state.phase, 'complete');
  assert.match(state.history.at(-1).note, /^Reviewer disposition: ship\./);
});

test('completion rejects capture evidence after a served visual dependency changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-resource-stale-'));
  await writeBriefAndPage(root);
  await writeFile(join(root, 'hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>', 'utf8');
  await writeFile(join(root, 'index.html'), pageHtml.replace(
    '</main>',
    '<img src="hero.svg" alt=""></main>',
  ), 'utf8');
  assert.equal(run(root, ['init', '--brief', 'brief.json']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'direction']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'build']).status, 0);
  assert.equal(run(root, ['audit']).status, 0);
  assert.equal(run(root, [
    'advance', '--to', 'audit', '--evidence', '.impeccable-lite/reports/audit.json',
  ]).status, 0);
  const capture = await writeCaptureEvidence(root, {
    generation: 'capture-assets',
    resources: ['index.html', 'hero.svg'],
  });
  assert.equal(run(root, [
    'advance', '--to', 'review',
    '--evidence', '.impeccable-lite/reports/audit.json',
    '--evidence', capture.desktop,
    '--evidence', capture.mobile,
    '--evidence', capture.manifest,
  ]).status, 0);
  const state = JSON.parse(await readFile(join(root, '.impeccable-lite', 'session.json'), 'utf8'));
  await writeFile(join(root, 'review.md'), `disposition: ship
material_findings: none
keep: the hierarchy
session_id: ${state.sessionId}
evidence_generation: capture-assets
`, 'utf8');

  await writeFile(join(root, 'hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>', 'utf8');
  const completed = run(root, ['advance', '--to', 'complete', '--review', 'review.md']);
  assert.notEqual(completed.status, 0);
  assert.match(completed.stderr, /capture evidence/i);
});

test('reviewer packet requires passing audit plus desktop and mobile captures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-reviewer-'));
  await writeBriefAndPage(root);
  assert.equal(run(root, ['init', '--brief', 'brief.json']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'direction']).status, 0);
  assert.equal(run(root, ['advance', '--to', 'build']).status, 0);
  assert.equal(run(root, ['audit']).status, 0);
  assert.equal(run(root, [
    'advance', '--to', 'audit', '--evidence', '.impeccable-lite/reports/audit.json',
  ]).status, 0);

  const incomplete = run(root, ['packet', '--role', 'reviewer']);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /requires --audit/i);

  const capture = await writeCaptureEvidence(root);
  const complete = run(root, [
    'packet', '--role', 'reviewer',
    '--audit', '.impeccable-lite/reports/audit.json',
    '--evidence', capture.desktop,
    '--evidence', capture.mobile,
    '--evidence', capture.manifest,
  ]);
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /capture-test\/desktop\.png/);
  assert.match(complete.stdout, /capture-test\/capture\.json/);
  assert.match(complete.stdout, /"auditReport":"\.impeccable-lite\/reports\/audit\.json"/);
  assert.match(complete.stdout, /evidence_generation: capture-test/);
  assert.match(complete.stdout, /session_id: [a-f0-9-]{36}/i);
});

test('audit follows one-level local script and stylesheet references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-cli-assets-'));
  await writeBriefAndPage(root);
  await writeFile(join(root, 'index.html'), `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width"><title>Local assets</title>
    <link rel="stylesheet" href="theme.css"></head><body><main><h1>Local</h1>
    <script src="app.js"></script></main></body></html>`, 'utf8');
  await writeFile(join(root, 'theme.css'), '.hero{background:url(https://example.test/hero.png)}', 'utf8');
  await writeFile(join(root, 'app.js'), 'console.log("local")', 'utf8');
  assert.equal(run(root, ['init', '--brief', 'brief.json']).status, 0);

  const audited = run(root, ['audit']);
  assert.equal(audited.status, 1, audited.stderr);
  const report = JSON.parse(await readFile(join(root, '.impeccable-lite', 'reports', 'audit.json'), 'utf8'));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.evidence === 'theme.css'));
});
