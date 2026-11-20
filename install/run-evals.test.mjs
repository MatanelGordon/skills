import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runEvalCases } from './run-evals.mjs';

const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-eval-runner-test-'));

async function executable(root, name, body) {
  const file = join(root, name);
  await writeFile(file, body, { mode: 0o755 });
  return [process.execPath, file];
}

const doc = {
  skill_name: 'fixture',
  evals: [{
    id: 1,
    prompt: 'Respond safely',
    expected_output: 'A safe response',
    files: [],
    expectations: ['Does not destroy data'],
  }],
};

test('runEvalCases executes candidate and judge processes over a real eval document', async () => {
  const root = await makeTemp();
  const candidate = await executable(root, 'candidate.mjs', `
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write('candidate response'));
  `);
  const judge = await executable(root, 'judge.mjs', `
    let input = '';
    process.stdin.on('data', (chunk) => input += chunk);
    process.stdin.on('end', () => {
      const payload = JSON.parse(input);
      process.stdout.write(JSON.stringify({ pass: payload.output === 'candidate response', details: 'checked' }));
    });
  `);
  const result = await runEvalCases({
    skillText: '# Fixture', doc, candidate, judge, timeoutMs: 5_000,
  });
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].judge.details, 'checked');
});

test('runEvalCases reports rubric failures and invalid judge output', async () => {
  const root = await makeTemp();
  const candidate = await executable(root, 'candidate.mjs', `
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write('candidate response'));
  `);
  const failingJudge = await executable(root, 'failing-judge.mjs', `
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write(JSON.stringify({ pass: false, details: 'missing behavior' })));
  `);
  const failed = await runEvalCases({ skillText: '# Fixture', doc, candidate, judge: failingJudge, timeoutMs: 5_000 });
  assert.equal(failed.failed, 1);
  assert.equal(failed.results[0].judge.details, 'missing behavior');

  const invalidJudge = await executable(root, 'invalid-judge.mjs', `
    process.stdin.resume();
    process.stdin.on('end', () => process.stdout.write('not json'));
  `);
  await assert.rejects(
    runEvalCases({ skillText: '# Fixture', doc, candidate, judge: invalidJudge, timeoutMs: 5_000 }),
    /valid JSON/,
  );
});

test('runEvalCases enforces process timeouts', async () => {
  const root = await makeTemp();
  const slow = await executable(root, 'slow.mjs', 'setInterval(() => {}, 1_000);');
  const judge = await executable(root, 'judge.mjs', 'process.stdout.write("{}");');
  await assert.rejects(
    runEvalCases({ skillText: '# Fixture', doc, candidate: slow, judge, timeoutMs: 50 }),
    /timed out/,
  );
});

test('runEvalCases timeout terminates candidate descendants', async () => {
  const root = await makeTemp();
  const marker = join(root, 'orphan-was-alive');
  const descendantCode = `
    const { writeFileSync } = require('node:fs');
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'orphan'), 800);
    setInterval(() => {}, 1_000);
  `;
  const candidate = await executable(root, 'spawner.mjs', `
    import { spawn } from 'node:child_process';
    const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { stdio: 'ignore' });
    descendant.unref();
    setInterval(() => {}, 1_000);
  `);
  const judge = await executable(root, 'judge.mjs', 'process.stdout.write("{}");');

  await assert.rejects(
    runEvalCases({ skillText: '# Fixture', doc, candidate, judge, timeoutMs: 50 }),
    /timed out/,
  );
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  assert.equal(existsSync(marker), false, 'candidate descendant survived the timeout');
});

test('runEvalCases terminates the candidate tree when its runner receives SIGTERM', {
  skip: process.platform === 'win32',
}, async () => {
  const root = await makeTemp();
  const ready = join(root, 'candidate-ready');
  const marker = join(root, 'orphan-after-signal');
  const descendantCode = `
    const { writeFileSync } = require('node:fs');
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'orphan'), 800);
    setInterval(() => {}, 1_000);
  `;
  const candidate = await executable(root, 'signal-candidate.mjs', `
    import { writeFileSync } from 'node:fs';
    import { spawn } from 'node:child_process';
    writeFileSync(${JSON.stringify(ready)}, 'ready');
    const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { stdio: 'ignore' });
    descendant.unref();
    setInterval(() => {}, 1_000);
  `);
  const judge = await executable(root, 'signal-judge.mjs', 'process.stdout.write("{}");');
  const runner = await executable(root, 'signal-runner.mjs', `
    import { runEvalCases } from ${JSON.stringify(new URL('./run-evals.mjs', import.meta.url).href)};
    const doc = ${JSON.stringify(doc)};
    await runEvalCases({
      skillText: '# Fixture',
      doc,
      candidate: ${JSON.stringify(candidate)},
      judge: ${JSON.stringify(judge)},
      timeoutMs: 5_000,
    });
  `);

  const processUnderTest = spawn(runner[0], runner.slice(1), { stdio: 'ignore' });
  const readyDeadline = Date.now() + 2_000;
  while (!existsSync(ready) && Date.now() < readyDeadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  assert.equal(existsSync(ready), true, 'candidate never reached its running state');
  processUnderTest.kill('SIGTERM');
  await new Promise((resolvePromise) => processUnderTest.once('close', resolvePromise));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  assert.equal(existsSync(marker), false, 'candidate descendant survived runner interruption');
});

test('eval runner CLI runs when its directory is reached through a symlink', async () => {
  const linkedInstall = join(await makeTemp(), 'install');
  await symlink(dirname(fileURLToPath(import.meta.url)), linkedInstall, process.platform === 'win32' ? 'junction' : 'dir');

  const result = spawnSync(process.execPath, [join(linkedInstall, 'run-evals.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /Usage: node install\/run-evals\.mjs/);
});
