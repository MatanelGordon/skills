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
  tool_calls: toolCalls.map(([name, args]) => ({ function_name: name, arguments: args })),
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

async function writeRun(root, trials) {
  await writeFile(
    join(root, 'dataset_snapshot.json'),
    JSON.stringify({ dataset: [{ ...planningCase, id: '6', evaluated_skill: 'adr' }] }),
  );
  for (const [arm, name, trajectory] of trials) {
    const directory = join(root, 'claude-code', arm, 'trials', name);
    await mkdir(directory, { recursive: true });
    if (trajectory) await writeFile(join(directory, 'trajectory.json'), JSON.stringify(trajectory));
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
  assert.match(markdown, /\| 6 \| with-skill \| 2 \| 1\/2 \| 1\/2 \| 1\/2 \|/);
  assert.match(markdown, /\| 6 \| without-skill \| 1 \| n\/a \| 0\/1 \| 0\/1 \|/);
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
  assert.match(renderMarkdown(report), /\| 6 \| with-skill \| 1 \| 1\/1 \| n\/a \| 1\/1 \|/);
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
