import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compilePattern,
  finalReply,
  parseArgs,
  renderMarkdown,
  scoreRun,
  scoreTrial,
  skillLoad,
  summarise,
} from './score.mjs';

const userStep = (message) => ({ source: 'user', message });
const agentStep = (message, toolCalls = []) => ({
  source: 'agent',
  message,
  tool_calls: toolCalls.map(([name, args], index) => ({ tool_call_id: `call_${index}`, function_name: name, arguments: args })),
});
const failedStep = (name, args) => ({
  ...agentStep('', [[name, args]]),
  observation: { results: [{ source_call_id: 'call_0', content: 'failed', extra: { tool_result_is_error: true } }] },
});
const trajectoryOf = (...steps) => ({ schema_version: 'ATIF-v1.7', steps });

const planningCase = {
  id: 6,
  prompt: 'Plan the invoice download.',
  checks: [
    { type: 'output_matches', pattern: '(?i)docgen|render_jobs' },
    { type: 'output_contains', text: 'ADR-0003' },
  ],
  trajectory_checks: [{ name: 'opened .adr/', pattern: '\\.adr\\b' }],
};

const goodRun = trajectoryOf(
  userStep('Plan the invoice download.'),
  agentStep('I will look for recorded decisions about docgen first.', [['Skill', { skill: 'adr' }]]),
  userStep('Base directory for this skill: /root/.claude/skills/adr\n\n# Architectural Decision Records'),
  agentStep('', [['Bash', { command: 'ls .adr/ && cat .adr/0003-documents-come-from-docgen.md' }]]),
  agentStep('Plan: queue a row in render_jobs for DocGen. This follows ADR-0003.'),
);

test('compilePattern reads a leading (?i) as the case-insensitive flag', () => {
  assert.equal(compilePattern('(?i)docgen').test('DocGen'), true);
  assert.equal(compilePattern('docgen').test('DocGen'), false);
});

test('compilePattern refuses inline flags JavaScript cannot express', () => {
  assert.throws(() => compilePattern('(?s)a.b'), /inline flag/);
  assert.throws(() => compilePattern('a(?i)b'), /inline flag/);
});

test('finalReply is the last agent message that has text, not an earlier remark', () => {
  assert.equal(finalReply(goodRun), 'Plan: queue a row in render_jobs for DocGen. This follows ADR-0003.');
  assert.equal(finalReply(trajectoryOf(userStep('hi'), agentStep('', [['Bash', { command: 'ls' }]]))), '');
});

test('skillLoad reports how the skill reached the agent', () => {
  assert.deepEqual(skillLoad(goodRun, 'adr'), { loaded: true, via: 'Skill tool' });

  const readDirectly = trajectoryOf(agentStep('', [['Read', { file_path: '/workspace/skills/adr/SKILL.md' }]]));
  assert.deepEqual(skillLoad(readDirectly, 'adr'), { loaded: true, via: 'read SKILL.md' });

  const otherSkill = trajectoryOf(agentStep('', [['Skill', { skill: 'claude-api' }]]), agentStep('done'));
  assert.deepEqual(skillLoad(otherSkill, 'adr'), { loaded: false, via: null });
});

test('skillLoad sees a skill loaded by a slash command, which leaves no tool call', () => {
  const slashCommand = trajectoryOf(
    userStep('<command-message>adr</command-message>\n<command-name>/adr</command-name>\n<command-args>Plan it.</command-args>'),
    userStep('Base directory for this skill: /logs/agent/sessions/skills/adr\n\n# Architectural Decision Records'),
    agentStep('Plan: see ADR-0005.'),
  );
  assert.deepEqual(skillLoad(slashCommand, 'adr'), { loaded: true, via: 'skill text injected' });

  const otherSkillText = trajectoryOf(
    userStep('Base directory for this skill: /logs/agent/sessions/skills/adr-extras\n\n# Something else'),
    agentStep('done'),
  );
  assert.deepEqual(skillLoad(otherSkillText, 'adr'), { loaded: false, via: null }, 'a skill whose name only starts the same');
});

test('scoreTrial passes a trial whose reply reflects every planted fact', () => {
  const scored = scoreTrial({ trajectory: goodRun, evalCase: planningCase, skillName: 'adr', arm: 'with-skill' });

  assert.equal(scored.status, 'scored');
  assert.equal(scored.loaded, true);
  assert.equal(scored.factsReflected, true);
  assert.equal(scored.sourceConsulted, true);
  assert.deepEqual(scored.facts.map((fact) => fact.passed), [true, true]);
});

test('scoreTrial fails a reply that misses one planted fact, and says which', () => {
  const run = trajectoryOf(
    userStep('Plan the invoice download.'),
    agentStep('', [['Bash', { command: 'ls -la && cat src/server.js' }]]),
    agentStep('Plan: render the PDF with a headless browser inside the API. See ADR-0003.'),
  );

  const scored = scoreTrial({ trajectory: run, evalCase: planningCase, skillName: 'adr', arm: 'without-skill' });

  assert.equal(scored.factsReflected, false);
  assert.deepEqual(scored.facts.map((fact) => fact.passed), [false, true]);
  assert.equal(scored.sourceConsulted, false, 'listing the directory is not opening .adr/');
  assert.equal(scored.loaded, null, 'the baseline arm has no skill to load');
});

test('scoreTrial marks an attempt with no reply as invalid, not as a failure', () => {
  const run = trajectoryOf(userStep('Plan it.'), agentStep('', [['Bash', { command: 'ls' }]]));

  const scored = scoreTrial({ trajectory: run, evalCase: planningCase, skillName: 'adr', arm: 'with-skill' });

  assert.equal(scored.status, 'invalid');
  assert.match(scored.reason, /no reply/);
  assert.equal(scored.factsReflected, null);
});

test('scoreTrial leaves a case without mechanical checks unscored', () => {
  const judgedOnly = { id: 1, prompt: 'Record this decision.' };

  const scored = scoreTrial({ trajectory: goodRun, evalCase: judgedOnly, skillName: 'adr', arm: 'with-skill' });

  assert.equal(scored.status, 'no-checks');
  assert.equal(scored.factsReflected, null);
});

test('scoreTrial counts only reply checks, and reports the ones it cannot make', () => {
  const withFileCheck = { ...planningCase, checks: [...planningCase.checks, { type: 'file_exists', path: 'PLAN.md' }] };

  const scored = scoreTrial({ trajectory: goodRun, evalCase: withFileCheck, skillName: 'adr', arm: 'with-skill' });

  assert.equal(scored.factsReflected, true);
  assert.equal(scored.facts.length, 2);
  assert.deepEqual(scored.skippedChecks, ['file_exists']);
});

const trial = (caseId, arm, factsReflected, extra = {}) => ({
  caseId,
  arm,
  status: 'scored',
  factsReflected,
  sourceConsulted: factsReflected,
  loaded: arm === 'with-skill' ? true : null,
  ...extra,
});

test('summarise counts attempts per case and arm and keeps invalid ones out of the rate', () => {
  const summary = summarise([
    trial('6', 'with-skill', true),
    trial('6', 'with-skill', true, { loaded: false }),
    trial('6', 'with-skill', false, { loaded: false }),
    { caseId: '6', arm: 'with-skill', status: 'invalid', factsReflected: null, sourceConsulted: null, loaded: null },
    trial('6', 'without-skill', false),
    trial('6', 'without-skill', false),
    trial('6', 'without-skill', true),
  ]);

  const withSkill = summary.cases.find((row) => row.caseId === '6' && row.arm === 'with-skill');
  assert.deepEqual(
    { scored: withSkill.scored, invalid: withSkill.invalid, facts: withSkill.factsReflected, loaded: withSkill.loaded },
    { scored: 3, invalid: 1, facts: 2, loaded: 1 },
  );
  assert.equal(summary.totals['with-skill'].factsReflected, 2);
  assert.equal(summary.totals['without-skill'].factsReflected, 1);
  assert.deepEqual(
    { scored: summary.totals['with-skill, loaded'].scored, facts: summary.totals['with-skill, loaded'].factsReflected },
    { scored: 1, facts: 1 },
    'the loaded-only row holds the with-skill attempts in which the skill was loaded',
  );
});

test('summarise leaves unscored cases out of the tables', () => {
  const summary = summarise([{ caseId: '1', arm: 'with-skill', status: 'no-checks', factsReflected: null }]);

  assert.deepEqual(summary.cases, []);
  assert.equal(summary.totals['with-skill'].scored, 0);
});

async function writeRun(root, trials, dataset = [{ ...planningCase, id: '6', evaluated_skill: 'adr' }]) {
  await writeFile(join(root, 'dataset_snapshot.json'), JSON.stringify({ dataset }));
  for (const [arm, name, trajectory, extraFiles = {}] of trials) {
    const directory = join(root, 'claude-code', arm, 'trials', name);
    await mkdir(directory, { recursive: true });
    if (trajectory) await writeFile(join(directory, 'trajectory.json'), JSON.stringify(trajectory));
    for (const [file, content] of Object.entries(extraFiles)) {
      await writeFile(join(directory, file), typeof content === 'string' ? content : JSON.stringify(content));
    }
  }
}

test('scoreRun reads a Tier 3 run folder, one trial per attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  const missed = trajectoryOf(userStep('Plan it.'), agentStep('Plan: use a PDF library.'));
  await writeRun(root, [
    ['with-skill', '6__aaaaaaa', goodRun],
    ['with-skill', '6__bbbbbbb', missed],
    ['without-skill', '6__ccccccc', missed],
    ['without-skill', '6__ddddddd', null],
  ]);

  const report = await scoreRun(root);

  assert.equal(report.skill, 'adr');
  assert.equal(report.trials.length, 4);
  assert.equal(report.summary.totals['with-skill'].factsReflected, 1);
  assert.equal(report.summary.totals['with-skill'].scored, 2);
  assert.equal(report.summary.totals['without-skill'].invalid, 1, 'a trial without a trajectory is invalid');

  const markdown = renderMarkdown(report);
  assert.ok(markdown.includes('| 6 | with-skill | 2 | 1/2 | 1/2 | 1/2 | 0 |'));
  assert.ok(markdown.includes('| 6 | without-skill | 1 | n/a | 0/1 | 0/1 | 1 |'), 'the invalid attempt has its own column');
  assert.ok(
    markdown.includes('| 6 | `(?i)docgen\\|render_jobs` | 1/2 | 0/1 |'),
    'each reply check is listed with its count per arm, with table pipes escaped',
  );
  assert.ok(markdown.includes('| 6 | `ADR-0003` | 1/2 | 0/1 |'));
});

test('scoreRun can score a finished run again with newer cases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]]);
  const casesPath = join(root, 'evals.json');
  const stricter = { ...planningCase, checks: [{ type: 'output_contains', text: 'not in the reply' }] };
  await writeFile(casesPath, JSON.stringify({ skill_name: 'adr', evals: [stricter] }));

  const report = await scoreRun(root, { casesPath });

  assert.equal(report.summary.totals['with-skill'].factsReflected, 0);
});

test('scoreRun fails loudly on a trial whose case is not in the dataset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '9__aaaaaaa', goodRun]]);

  await assert.rejects(scoreRun(root), /case 9 .* not in the dataset/);
});

test('parseArgs takes run folders, with --cases and --json in any position', () => {
  assert.deepEqual(parseArgs(['runs/adr/1']), { runDirs: ['runs/adr/1'], casesPath: undefined, asJson: false });
  assert.deepEqual(
    parseArgs(['--json', 'runs/a', '--cases', 'skills/adr/evals/evals.json', 'runs/b']),
    { runDirs: ['runs/a', 'runs/b'], casesPath: 'skills/adr/evals/evals.json', asJson: true },
  );
});

test('parseArgs refuses a call it cannot act on', () => {
  assert.throws(() => parseArgs([]), /run folder/);
  assert.throws(() => parseArgs(['runs/a', '--cases']), /--cases needs a path/);
  assert.throws(() => parseArgs(['runs/a', '--josn']), /unknown flag '--josn'/);
});

test('a case with reply checks and no trajectory checks shows its source column as n/a', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]]);
  const casesPath = join(root, 'evals.json');
  const { trajectory_checks: _dropped, ...replyChecksOnly } = planningCase;
  await writeFile(casesPath, JSON.stringify({ skill_name: 'adr', evals: [replyChecksOnly] }));

  const report = await scoreRun(root, { casesPath });

  assert.equal(report.summary.totals['with-skill'].consultable, 0);
  assert.ok(renderMarkdown(report).includes('| 6 | with-skill | 1 | 1/1 | n/a | 1/1 | 0 |'));
});

test('the command prints its table when started through a symlink', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]]);
  const link = join(root, 'score-link.mjs');
  await symlink(fileURLToPath(new URL('./score.mjs', import.meta.url)), link);

  const result = spawnSync(process.execPath, [link, root], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| 6 \| with-skill \| 1 \|/);
});

test('the command exits 2 with the usage line when given nothing to score', () => {
  const script = fileURLToPath(new URL('./score.mjs', import.meta.url));

  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: node tools\/planning-eval\/score\.mjs/);
});

// Review findings on 2d92259.

const halfRight = trajectoryOf(userStep('Plan it.'), agentStep('Plan: queue a docgen job; no record applies.'));

test('each reply check row counts that check, not the first one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', halfRight], ['without-skill', '6__bbbbbbb', halfRight]]);

  const markdown = renderMarkdown(await scoreRun(root));

  assert.ok(markdown.includes('| 6 | `(?i)docgen\\|render_jobs` | 1/1 | 1/1 |'));
  assert.ok(markdown.includes('| 6 | `ADR-0003` | 0/1 | 0/1 |'));
  assert.ok(markdown.includes('| 6 | with-skill | 1 | 0/1 | 0/1 | 0/1 | 0 |'), 'one passed check is not a reflected fact');
});

test('an attempt SkillEvaluator recorded as failed is invalid even when it left a trajectory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  const failure = { status: 'unscored', error: { type: 'RuntimeError', message: 'Docker compose command failed' } };
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun, { 'failure.json': failure }]]);

  const report = await scoreRun(root);

  assert.equal(report.trials[0].status, 'invalid');
  assert.match(report.trials[0].reason, /RuntimeError/);
  assert.equal(report.summary.totals['with-skill'].scored, 0);
});

test('an unreadable trajectory makes that attempt invalid instead of stopping the run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', null, { 'trajectory.json': '{"steps": [' }], ['with-skill', '6__bbbbbbb', goodRun]]);

  const report = await scoreRun(root);

  assert.deepEqual(report.trials.map((trial) => trial.status), ['invalid', 'scored']);
  assert.match(report.trials[0].reason, /trajectory\.json/);
});

test('the case id comes from the trial config, not from the folder name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  const longId = 'plan-invoice-pdf__with-a-name-longer-than-harbor-keeps';
  const config = { task: { path: `/runs/_harbor-tasks/claude-code/with/${longId}`, source: 'with' } };
  await writeRun(
    root,
    [['with-skill', 'plan-invoice-pdf__with-a-name-lo__zzzzzzz', goodRun, { 'config.json': config }]],
    [{ ...planningCase, id: longId, evaluated_skill: 'adr' }],
  );

  const report = await scoreRun(root);

  assert.equal(report.trials[0].caseId, longId);
  assert.equal(report.trials[0].status, 'scored');
});

test('negative cases are scored but kept out of the totals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  const negative = { id: '7', prompt: 'Rename a constant.', expected_skill: null, checks: [{ type: 'output_contains', text: 'RENAMED' }] };
  const falseTrigger = trajectoryOf(
    userStep('Rename a constant.'),
    agentStep('', [['Skill', { skill: 'adr' }]]),
    agentStep('RENAMED it.'),
  );
  await writeRun(root, [['with-skill', '6__aaaaaaa', halfRight], ['with-skill', '7__bbbbbbb', falseTrigger]], [
    { ...planningCase, id: '6', evaluated_skill: 'adr' },
    { ...negative, evaluated_skill: 'adr' },
  ]);

  const report = await scoreRun(root);

  assert.equal(report.summary.cases.length, 2, 'both cases keep their own rows');
  assert.equal(report.summary.totals['with-skill'].scored, 1);
  assert.equal(report.summary.totals['with-skill, loaded'].scored, 0, 'a false trigger is not a loaded attempt that helped');
  assert.match(renderMarkdown(report), /negative case/);
});

test('the report says which checks it could not make', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  const withFileCheck = { ...planningCase, id: '6', evaluated_skill: 'adr', checks: [...planningCase.checks, { type: 'file_exists', path: 'a.js' }] };
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]], [withFileCheck]);

  assert.match(renderMarkdown(await scoreRun(root)), /case 6: `file_exists` not checked/);
});

test('scoreRun refuses a cases file written for another skill', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]]);
  const casesPath = join(root, 'evals.json');
  await writeFile(casesPath, JSON.stringify({ skill_name: 'bookkeeper', evals: [planningCase] }));

  await assert.rejects(scoreRun(root, { casesPath }), /bookkeeper.*adr|adr.*bookkeeper/);
});

test('scoreRun names the file when a cases file has no evals list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planning-eval-test-'));
  await writeRun(root, [['with-skill', '6__aaaaaaa', goodRun]]);
  const casesPath = join(root, 'evals.json');
  await writeFile(casesPath, JSON.stringify({ skill_name: 'adr' }));

  await assert.rejects(scoreRun(root, { casesPath }), /evals\.json/);
});

test('skillLoad does not count near misses', () => {
  const notLoaded = (trajectory) => assert.deepEqual(skillLoad(trajectory, 'adr'), { loaded: false, via: null });

  notLoaded(trajectoryOf(agentStep('', [['Read', { file_path: '/workspace/skills/bookkeeper/SKILL.md' }]])));
  notLoaded(trajectoryOf(agentStep('', [['Skill', { skill: 'my-adr' }]])));
  notLoaded(trajectoryOf(agentStep('', [['Task', { skill: 'adr' }]])));
  notLoaded(trajectoryOf(failedStep('Skill', { skill: 'adr' })));
  notLoaded(trajectoryOf(agentStep('', [['Write', { file_path: 'notes.md', content: 'see skills/adr/SKILL.md' }]])));
  notLoaded(trajectoryOf(agentStep('Base directory for this skill: /logs/agent/sessions/skills/adr\n')));
});

test('skillLoad counts the plugin-qualified name and a SKILL.md read through Bash', () => {
  assert.equal(skillLoad(trajectoryOf(agentStep('', [['Skill', { skill: 'skills:adr' }]])), 'adr').loaded, true);
  assert.equal(skillLoad(trajectoryOf(agentStep('', [['Bash', { command: 'cat /root/.claude/skills/adr/SKILL.md' }]])), 'adr').loaded, true);
});

test('output_contains is case-sensitive, as in SkillEvaluator', () => {
  const lower = trajectoryOf(agentStep('Plan: docgen, per adr-0003.'));

  const scored = scoreTrial({ trajectory: lower, evalCase: planningCase, skillName: 'adr', arm: 'without-skill' });

  assert.deepEqual(scored.facts.map((fact) => fact.passed), [true, false]);
});

test('every trajectory check has to pass for the source to count as opened', () => {
  const twoPlaces = { ...planningCase, trajectory_checks: [{ name: 'adr', pattern: '\\.adr\\b' }, { name: 'log', pattern: 'git log' }] };

  const scored = scoreTrial({ trajectory: goodRun, evalCase: twoPlaces, skillName: 'adr', arm: 'with-skill' });

  assert.deepEqual(scored.consulted.map((check) => check.passed), [true, false]);
  assert.equal(scored.sourceConsulted, false);
});

test('finalReply reads a message made of content parts', () => {
  const parts = trajectoryOf({ source: 'agent', message: [{ type: 'text', text: 'Plan: use ' }, { type: 'image' }, { type: 'text', text: 'docgen.' }] });

  assert.equal(finalReply(parts), 'Plan: use docgen.');
});

test('summarise counts opened sources apart from reflected facts', () => {
  const summary = summarise([
    trial('6', 'with-skill', false, { sourceConsulted: true }),
    trial('6', 'with-skill', true, { sourceConsulted: false }),
    trial('6', 'with-skill', false, { sourceConsulted: true }),
  ]);

  assert.deepEqual(
    { opened: summary.totals['with-skill'].sourceConsulted, facts: summary.totals['with-skill'].factsReflected },
    { opened: 2, facts: 1 },
  );
});

test('an invalid attempt stays out of the loaded-only row even when the skill was loaded', () => {
  const summary = summarise([
    trial('6', 'with-skill', true),
    { caseId: '6', arm: 'with-skill', status: 'invalid', factsReflected: null, sourceConsulted: null, loaded: true },
  ]);

  assert.deepEqual(
    { scored: summary.totals['with-skill, loaded'].scored, invalid: summary.totals['with-skill, loaded'].invalid },
    { scored: 1, invalid: 0 },
  );
});

test('a reply check ignores typographic dashes and spaces the model put in the token', () => {
  // Nemotron writes "win‑build‑03" with U+2011 non-breaking hyphens and "ADR 0005" with U+202F.
  const typeset = trajectoryOf(agentStep('Run it on win‑build‑03 and follow ADR‑0003 via DocGen render_jobs.'));
  const runnerCase = {
    ...planningCase,
    checks: [
      { type: 'output_matches', pattern: 'win-build-03' },
      { type: 'output_contains', text: 'ADR-0003' },
      { type: 'output_matches', pattern: '(?i)docgen render_jobs' },
    ],
  };

  const scored = scoreTrial({ trajectory: typeset, evalCase: runnerCase, skillName: 'adr', arm: 'without-skill' });

  assert.deepEqual(scored.facts.map((fact) => fact.passed), [true, true, true]);
});
