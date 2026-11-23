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
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { isEntryPoint } from '../../install/entry-point.mjs';
import { renderMarkdown, summarise } from './report.mjs';

export { renderMarkdown, summarise };

const ARMS = Object.freeze(['with-skill', 'without-skill']);
const REPLY_CHECK_TYPES = Object.freeze(['output_matches', 'output_contains']);
const FILE_READING_TOOLS = Object.freeze(['Read', 'Bash']);
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

/** A message's text: a string as it is, or the text parts of a content-part list joined. */
const textOf = (message) => {
  if (typeof message === 'string') return message;
  if (!Array.isArray(message)) return '';
  return message.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('');
};

/** The last agent message that has text: what the user would read as the answer. */
export function finalReply(trajectory) {
  const replies = stepsOf(trajectory)
    .filter((step) => step.source === 'agent')
    .map((step) => textOf(step.message).trim())
    .filter((text) => text !== '');
  return replies.length ? replies[replies.length - 1] : '';
}

const failedCallIds = (step) => new Set((step.observation?.results ?? [])
  .filter((result) => result?.extra?.tool_result_is_error === true)
  .map((result) => result.source_call_id));

const toolCallsOf = (trajectory) => stepsOf(trajectory).flatMap((step) => {
  const failed = failedCallIds(step);
  return (step.tool_calls ?? []).map((call) => ({
    name: call.function_name ?? '',
    args: call.arguments ?? {},
    text: `${call.function_name ?? ''} ${JSON.stringify(call.arguments ?? {})}`,
    failed: failed.has(call.tool_call_id),
  }));
});

/** Whether the skill's instructions reached the agent, and by which route. */
export function skillLoad(trajectory, skillName) {
  const calls = toolCallsOf(trajectory).filter((call) => !call.failed);
  const namesSkill = (value) => value === skillName || String(value ?? '').endsWith(`:${skillName}`);
  if (calls.some((call) => call.name === 'Skill' && namesSkill(call.args.skill))) {
    return { loaded: true, via: 'Skill tool' };
  }

  const skillFile = new RegExp(`skills/${skillName}/SKILL\\.md`);
  if (calls.some((call) => FILE_READING_TOOLS.includes(call.name) && skillFile.test(call.text))) {
    return { loaded: true, via: 'read SKILL.md' };
  }

  // A slash command (or a Skill call) makes Claude Code add the skill's text as a
  // user message that starts with this line; a slash command leaves no tool call.
  const injected = new RegExp(`^Base directory for this skill: \\S*/skills/${skillName}\\s`);
  const userTexts = stepsOf(trajectory).filter((step) => step.source === 'user').map((step) => textOf(step.message));
  if (userTexts.some((text) => injected.test(text))) return { loaded: true, via: 'skill text injected' };
  return { loaded: false, via: null };
}

const describeCheck = (check) => (check.type === 'output_contains' ? check.text : check.pattern);
const replyChecksOf = (evalCase) => (Array.isArray(evalCase.checks) ? evalCase.checks : [])
  .filter((check) => REPLY_CHECK_TYPES.includes(check.type));

function replyCheckPasses(check, reply) {
  if (check.type === 'output_contains') return reply.includes(check.text);
  return compilePattern(check.pattern).test(reply);
}

/** One attempt: loaded, source consulted, facts reflected. */
export function scoreTrial({ trajectory, evalCase, skillName, arm }) {
  const checks = Array.isArray(evalCase.checks) ? evalCase.checks : [];
  const replyChecks = replyChecksOf(evalCase);
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

async function readJson(path) {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}

async function loadCases(runDir, casesPath) {
  const snapshotPath = join(runDir, 'dataset_snapshot.json');
  const snapshotCases = existsSync(snapshotPath) ? ((await readJson(snapshotPath)).dataset ?? []) : [];
  const runSkill = snapshotCases[0]?.evaluated_skill ?? snapshotCases[0]?.expected_skill ?? null;
  if (!casesPath) return { skill: runSkill, cases: snapshotCases };

  const doc = await readJson(casesPath);
  if (!Array.isArray(doc.evals)) throw new Error(`${casesPath}: no "evals" list`);
  if (runSkill && doc.skill_name !== runSkill) {
    throw new Error(`${casesPath} holds cases for '${doc.skill_name}', but ${runDir} evaluated '${runSkill}'`);
  }
  return { skill: doc.skill_name, cases: doc.evals };
}

async function trialFolders(runDir, arm) {
  const root = join(runDir, 'claude-code', arm, 'trials');
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** Harbor cuts a trial folder's name to 32 characters; the task path in config.json keeps the whole case id. */
async function caseIdOf(trialDir, folderName) {
  const configPath = join(trialDir, 'config.json');
  const taskPath = existsSync(configPath) ? (await readJson(configPath).catch(() => null))?.task?.path : null;
  return typeof taskPath === 'string' ? basename(taskPath) : folderName.split('__')[0];
}

/** Why an attempt cannot be scored, or null when its trajectory can be read. */
async function unscorableReason(trialDir) {
  const failurePath = join(trialDir, 'failure.json');
  if (existsSync(failurePath)) {
    const failure = await readJson(failurePath).catch(() => ({}));
    return { reason: `SkillEvaluator recorded the attempt as failed: ${failure.error?.type ?? 'unknown error'}` };
  }
  const trajectoryPath = join(trialDir, 'trajectory.json');
  if (!existsSync(trajectoryPath)) return { reason: 'the attempt left no trajectory' };
  try {
    return { trajectory: await readJson(trajectoryPath) };
  } catch (error) {
    return { reason: `unreadable trajectory: ${error.message}` };
  }
}

async function scoreFolder({ runDir, arm, name, caseById, skill }) {
  const trialDir = join(runDir, 'claude-code', arm, 'trials', name);
  const caseId = await caseIdOf(trialDir, name);
  const evalCase = caseById.get(caseId);
  if (!evalCase) throw new Error(`case ${caseId} of trial ${arm}/${name} is not in the dataset`);

  const identity = { caseId, arm, trial: name, negative: evalCase.expected_skill === null };
  const { trajectory, reason } = await unscorableReason(trialDir);
  if (trajectory) return { ...identity, ...scoreTrial({ trajectory, evalCase, skillName: skill, arm }) };

  const status = replyChecksOf(evalCase).length ? 'invalid' : 'no-checks';
  return { ...identity, status, reason, loaded: null, factsReflected: null, sourceConsulted: null, skippedChecks: [] };
}

/**
 * Scores every attempt in a Tier 3 run folder. The cases come from the run's
 * own snapshot, or from `casesPath` to score a finished run against newer checks.
 */
export async function scoreRun(runDir, { casesPath } = {}) {
  const { skill, cases } = await loadCases(runDir, casesPath);
  if (!skill) throw new Error(`cannot tell which skill ${runDir} evaluated`);
  const caseById = new Map(cases.map((evalCase) => [String(evalCase.id), evalCase]));

  const folders = (await Promise.all(ARMS.map(async (arm) => (await trialFolders(runDir, arm))
    .map((name) => ({ arm, name }))))).flat();
  const trials = await Promise.all(folders.map(({ arm, name }) => scoreFolder({ runDir, arm, name, caseById, skill })));
  return { skill, runDir, trials, summary: summarise(trials) };
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
  const reports = await Promise.all(runDirs.map((runDir) => scoreRun(runDir, { casesPath })));
  console.log(asJson ? JSON.stringify(reports, null, 2) : reports.map(renderMarkdown).join('\n'));
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    if (error instanceof UsageError) console.error(USAGE);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
