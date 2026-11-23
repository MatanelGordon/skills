#!/usr/bin/env node
/**
 * Scores a SkillEvaluator Tier 3 run folder without a grader model.
 *
 * For every attempt it reads the recorded trajectory and answers three things:
 * was the skill loaded, did the agent open the place the planted fact lives in,
 * and does the final reply reflect that fact. The fact checks are the case's own
 * `checks` (the ones SkillEvaluator applies to the final reply); the "opened
 * the place" checks are the case's `trajectory_checks`, which only this script
 * reads. See README.md beside this file.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { isEntryPoint } from '../../install/entry-point.mjs';

const ARMS = Object.freeze(['with-skill', 'without-skill']);
const LOADED_ONLY = 'with-skill, loaded';
const REPLY_CHECK_TYPES = Object.freeze(['output_matches', 'output_contains']);
const LEADING_IGNORE_CASE = '(?i)';
const INLINE_FLAG = /\(\?[a-zA-Z]+\)/;

/** A check pattern as SkillEvaluator would read it, for the subset JavaScript shares with Python. */
export function compilePattern(pattern) {
  const ignoreCase = pattern.startsWith(LEADING_IGNORE_CASE);
  const body = ignoreCase ? pattern.slice(LEADING_IGNORE_CASE.length) : pattern;
  if (INLINE_FLAG.test(body)) {
    throw new Error(`pattern ${JSON.stringify(pattern)} uses an inline flag other than a leading (?i)`);
  }
  return new RegExp(body, ignoreCase ? 'i' : '');
}

const stepsOf = (trajectory) => (Array.isArray(trajectory?.steps) ? trajectory.steps : []);
const textOf = (message) => (typeof message === 'string' ? message : '');

/** The last agent message that has text: what the user would read as the answer. */
export function finalReply(trajectory) {
  const replies = stepsOf(trajectory)
    .filter((step) => step.source === 'agent' && textOf(step.message).trim() !== '')
    .map((step) => step.message.trim());
  return replies.length ? replies[replies.length - 1] : '';
}

const toolCallsOf = (trajectory) => stepsOf(trajectory).flatMap((step) =>
  (step.tool_calls ?? []).map((call) => ({
    name: call.function_name ?? '',
    args: call.arguments ?? {},
    text: `${call.function_name ?? ''} ${JSON.stringify(call.arguments ?? {})}`,
  })));

/** Whether the skill's instructions reached the agent, and by which route. */
export function skillLoad(trajectory, skillName) {
  const calls = toolCallsOf(trajectory);
  const invoked = calls.some((call) => call.name === 'Skill'
    && (call.args.skill === skillName || String(call.args.skill ?? '').endsWith(`:${skillName}`)));
  if (invoked) return { loaded: true, via: 'Skill tool' };

  const skillFile = new RegExp(`skills/${skillName}/SKILL\\.md`);
  if (calls.some((call) => skillFile.test(call.text))) return { loaded: true, via: 'read SKILL.md' };
  return { loaded: false, via: null };
}

const describeCheck = (check) => (check.type === 'output_contains' ? check.text : check.pattern);

function replyCheckPasses(check, reply) {
  if (check.type === 'output_contains') return reply.includes(check.text);
  return compilePattern(check.pattern).test(reply);
}

/** One attempt: loaded, source consulted, facts reflected. */
export function scoreTrial({ trajectory, evalCase, skillName, arm }) {
  const checks = Array.isArray(evalCase.checks) ? evalCase.checks : [];
  const replyChecks = checks.filter((check) => REPLY_CHECK_TYPES.includes(check.type));
  const skippedChecks = checks.filter((check) => !REPLY_CHECK_TYPES.includes(check.type)).map((check) => check.type);
  const load = arm === 'with-skill' ? skillLoad(trajectory, skillName) : { loaded: null, via: null };
  const base = { loaded: load.loaded, loadedVia: load.via, skippedChecks };
  const unscored = { ...base, facts: [], factsReflected: null, consulted: [], sourceConsulted: null };

  if (replyChecks.length === 0) return { ...unscored, status: 'no-checks' };

  const reply = finalReply(trajectory);
  if (reply === '') return { ...unscored, status: 'invalid', reason: 'the agent gave no reply' };

  const facts = replyChecks.map((check) => ({ check: describeCheck(check), passed: replyCheckPasses(check, reply) }));
  const callText = toolCallsOf(trajectory).map((call) => call.text);
  const consulted = (evalCase.trajectory_checks ?? []).map((check) => {
    const pattern = compilePattern(check.pattern);
    return { name: check.name, passed: callText.some((text) => pattern.test(text)) };
  });

  return {
    ...base,
    status: 'scored',
    facts,
    factsReflected: facts.every((fact) => fact.passed),
    consulted,
    sourceConsulted: consulted.length ? consulted.every((check) => check.passed) : null,
  };
}

const emptyCount = () => ({
  scored: 0, invalid: 0, factsReflected: 0, consultable: 0, sourceConsulted: 0, loaded: 0,
});

// `consultable` counts the scored attempts whose case says where its fact lives.
const addTrial = (count, trial) => (trial.status === 'invalid'
  ? { ...count, invalid: count.invalid + 1 }
  : {
    ...count,
    scored: count.scored + 1,
    factsReflected: count.factsReflected + (trial.factsReflected ? 1 : 0),
    consultable: count.consultable + (trial.sourceConsulted === null ? 0 : 1),
    sourceConsulted: count.sourceConsulted + (trial.sourceConsulted ? 1 : 0),
    loaded: count.loaded + (trial.loaded ? 1 : 0),
  });

const compareCaseIds = (left, right) => left.localeCompare(right, 'en', { numeric: true });

/** Counts per case and arm, per arm, and for the with-skill attempts that loaded the skill. */
export function summarise(trials) {
  const counted = trials.filter((trial) => trial.status === 'scored' || trial.status === 'invalid');
  const caseIds = [...new Set(counted.map((trial) => trial.caseId))].sort(compareCaseIds);

  const cases = caseIds.flatMap((caseId) => ARMS
    .map((arm) => ({ caseId, arm, trials: counted.filter((trial) => trial.caseId === caseId && trial.arm === arm) }))
    .filter((group) => group.trials.length > 0)
    .map((group) => ({ caseId: group.caseId, arm: group.arm, ...group.trials.reduce(addTrial, emptyCount()) })));

  const totalFor = (keep) => counted.filter(keep).reduce(addTrial, emptyCount());
  const totals = {
    'with-skill': totalFor((trial) => trial.arm === 'with-skill'),
    [LOADED_ONLY]: totalFor((trial) => trial.arm === 'with-skill' && trial.status === 'scored' && trial.loaded),
    'without-skill': totalFor((trial) => trial.arm === 'without-skill'),
  };
  return { cases, totals };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadCases(runDir, casesPath) {
  if (casesPath) {
    const doc = await readJson(casesPath);
    return { skill: doc.skill_name, cases: doc.evals };
  }
  const snapshot = await readJson(join(runDir, 'dataset_snapshot.json'));
  const cases = snapshot.dataset ?? [];
  return { skill: cases[0]?.evaluated_skill ?? cases[0]?.expected_skill ?? null, cases };
}

async function trialFolders(runDir, arm) {
  const root = join(runDir, 'claude-code', arm, 'trials');
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/**
 * Scores every attempt in a Tier 3 run folder. The cases come from the run's
 * own snapshot, or from `casesPath` to score a finished run against newer checks.
 */
export async function scoreRun(runDir, { casesPath } = {}) {
  const { skill, cases } = await loadCases(runDir, casesPath);
  if (!skill) throw new Error(`cannot tell which skill ${runDir} evaluated`);
  const caseById = new Map(cases.map((evalCase) => [String(evalCase.id), evalCase]));

  const trials = [];
  for (const arm of ARMS) {
    for (const name of await trialFolders(runDir, arm)) {
      const caseId = name.split('__')[0];
      const evalCase = caseById.get(caseId);
      if (!evalCase) throw new Error(`case ${caseId} of trial ${arm}/${name} is not in the dataset`);

      const trajectoryPath = join(runDir, 'claude-code', arm, 'trials', name, 'trajectory.json');
      const identity = { caseId, arm, trial: name };
      if (!existsSync(trajectoryPath)) {
        const hasChecks = (evalCase.checks ?? []).some((check) => REPLY_CHECK_TYPES.includes(check.type));
        trials.push({
          ...identity,
          status: hasChecks ? 'invalid' : 'no-checks',
          reason: 'the attempt left no trajectory',
          loaded: null,
          factsReflected: null,
          sourceConsulted: null,
        });
        continue;
      }
      const trajectory = await readJson(trajectoryPath);
      trials.push({ ...identity, ...scoreTrial({ trajectory, evalCase, skillName: skill, arm }) });
    }
  }
  return { skill, runDir, trials, summary: summarise(trials) };
}

const ratio = (count, of) => `${count}/${of}`;

const NOT_APPLICABLE = 'n/a';

function row(label, arm, count) {
  const loaded = arm === 'without-skill' ? NOT_APPLICABLE : ratio(count.loaded, count.scored);
  const opened = count.consultable ? ratio(count.sourceConsulted, count.consultable) : NOT_APPLICABLE;
  return `| ${label} | ${arm} | ${count.scored} | ${loaded} | ${opened} | ${ratio(count.factsReflected, count.scored)} |`
    + (count.invalid ? ` ${count.invalid} invalid |` : '');
}

const scoredIn = (trials, caseId, arm) => trials
  .filter((trial) => trial.caseId === caseId && trial.arm === arm && trial.status === 'scored');

/** One row per reply check: how many scored attempts passed it in each arm. */
function checkRows(trials) {
  const caseIds = [...new Set(trials.filter((trial) => trial.status === 'scored').map((trial) => trial.caseId))]
    .sort(compareCaseIds);
  return caseIds.flatMap((caseId) => {
    const sample = trials.find((trial) => trial.caseId === caseId && trial.status === 'scored');
    return sample.facts.map((fact, index) => {
      const cell = (arm) => {
        const scored = scoredIn(trials, caseId, arm);
        return scored.length ? ratio(scored.filter((trial) => trial.facts[index].passed).length, scored.length) : 'not run';
      };
      const check = fact.check.replaceAll('|', '\\|');
      return `| ${caseId} | \`${check}\` | ${cell('with-skill')} | ${cell('without-skill')} |`;
    });
  });
}

/** The report as Markdown: one row per case and arm, the totals, then each reply check. */
export function renderMarkdown(report) {
  const { cases, totals } = report.summary;
  const lines = [
    `### ${report.skill}`,
    '',
    '| Case | Arm | Scored attempts | Skill loaded | Source opened | Facts reflected |',
    '| --- | --- | --- | --- | --- | --- |',
    ...cases.map((count) => row(count.caseId, count.arm, count)),
    ...Object.entries(totals).map(([arm, count]) => row('all', arm, count)),
    '',
    '| Case | Reply check | with-skill | without-skill |',
    '| --- | --- | --- | --- |',
    ...checkRows(report.trials),
  ];
  const unscored = report.trials.filter((trial) => trial.status === 'no-checks').length;
  if (unscored) lines.push('', `${unscored} attempt(s) belong to cases without reply checks and are not counted.`);
  return `${lines.join('\n')}\n`;
}

const USAGE = 'Usage: node tools/planning-eval/score.mjs <tier3-run-dir>... [--cases <evals.json>] [--json]';

export class UsageError extends Error {}

/** Command-line arguments as { runDirs, casesPath, asJson }. */
export function parseArgs(args) {
  const parsed = args.reduce((state, arg) => {
    if (state.expectsCases) return { ...state, casesPath: arg, expectsCases: false };
    if (arg === '--json') return { ...state, asJson: true };
    if (arg === '--cases') return { ...state, expectsCases: true };
    if (arg.startsWith('--')) throw new UsageError(`unknown flag '${arg}'`);
    return { ...state, runDirs: [...state.runDirs, arg] };
  }, { runDirs: [], casesPath: undefined, asJson: false, expectsCases: false });

  if (parsed.expectsCases) throw new UsageError('--cases needs a path');
  if (parsed.runDirs.length === 0) throw new UsageError('give at least one Tier 3 run folder');
  return { runDirs: parsed.runDirs, casesPath: parsed.casesPath, asJson: parsed.asJson };
}

async function main(args) {
  const { runDirs, casesPath, asJson } = parseArgs(args);
  const reports = [];
  for (const runDir of runDirs) reports.push(await scoreRun(runDir, { casesPath }));
  console.log(asJson ? JSON.stringify(reports, null, 2) : reports.map(renderMarkdown).join('\n'));
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    if (error instanceof UsageError) console.error(USAGE);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
