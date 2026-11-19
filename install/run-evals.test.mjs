import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

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
