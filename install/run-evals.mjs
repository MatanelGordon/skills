#!/usr/bin/env node
/** Execute skill eval cases against a candidate command and an independent judge. */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

async function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolvePromise) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      let complete = false;
      const finish = (fallback = false) => {
        if (complete) return;
        complete = true;
        clearTimeout(deadline);
        if (fallback) child.kill('SIGKILL');
        resolvePromise();
      };
      const deadline = setTimeout(() => {
        killer.kill('SIGKILL');
        finish(true);
      }, 5_000);
      killer.once('error', () => finish(true));
      killer.once('close', (code) => finish(code !== 0));
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') child.kill('SIGKILL');
  }
}

function runProcess(command, input, timeoutMs, label) {
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string')) {
    throw new TypeError(`${label} command must be a non-empty string array`);
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const removeSignalHandlers = () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    };
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeSignalHandlers();
      callback();
    };
    const forwardSignal = (signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeSignalHandlers();
      void terminateProcessTree(child).finally(() => process.kill(process.pid, signal));
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeSignalHandlers();
      void terminateProcessTree(child)
        .finally(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(() => reject(new Error(`${label} failed to start: ${error.message}`))));
    child.on('close', (code, signal) => finish(() => {
      if (code !== 0) {
        const detail = stderr.trim() || `signal ${signal ?? 'unknown'}`;
        reject(new Error(`${label} exited ${code ?? 'without a code'}: ${detail}`));
      } else {
        resolvePromise(stdout.trim());
      }
    }));
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') finish(() => reject(new Error(`${label} stdin failed: ${error.message}`)));
    });
    child.stdin.end(input);
  });
}

function candidatePrompt(skillText, evaluation) {
  return [
    'Apply the following skill instructions to the evaluation request.',
    'Return only the response you would give the user.',
    '',
    '<skill>',
    skillText,
    '</skill>',
    '',
    '<evaluation>',
    evaluation.prompt,
    '</evaluation>',
    evaluation.files?.length ? `\nReferenced files: ${JSON.stringify(evaluation.files)}` : '',
  ].join('\n');
}

function judgePrompt(doc, evaluation, output) {
  return JSON.stringify({
    instruction: 'Judge the candidate only against the expected output and expectations. Return only JSON: {"pass":boolean,"details":string}.',
    skill_name: doc.skill_name,
    id: evaluation.id,
    prompt: evaluation.prompt,
    expected_output: evaluation.expected_output,
    expectations: evaluation.expectations,
    output,
  });
}

export async function runEvalCases({ skillText, doc, candidate, judge, timeoutMs = 120_000 }) {
  if (!doc || !Array.isArray(doc.evals) || doc.evals.length === 0) {
    throw new TypeError('eval document must contain at least one case');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be positive');

  const results = [];
  for (const evaluation of doc.evals) {
    const output = await runProcess(candidate, candidatePrompt(skillText, evaluation), timeoutMs, `candidate for eval ${evaluation.id}`);
    const rawJudge = await runProcess(judge, judgePrompt(doc, evaluation, output), timeoutMs, `judge for eval ${evaluation.id}`);
    let verdict;
    try {
      verdict = JSON.parse(rawJudge);
    } catch {
      throw new Error(`judge for eval ${evaluation.id} did not return valid JSON`);
    }
    if (typeof verdict.pass !== 'boolean' || typeof verdict.details !== 'string') {
      throw new Error(`judge for eval ${evaluation.id} did not return valid JSON with pass and details`);
    }
    results.push({ id: evaluation.id, output, judge: verdict });
  }

  const passed = results.filter((result) => result.judge.pass).length;
  return { passed, failed: results.length - passed, results };
}

export class EvalUsageError extends Error {}

export function parseEvalArgs(args) {
  const options = { candidate: [], judge: [], timeoutMs: 120_000 };
  const scalar = new Set();
  const take = (index, token) => {
    const equals = token.indexOf('=');
    if (equals !== -1) return [token.slice(equals + 1), index];
    if (index + 1 >= args.length) throw new EvalUsageError(`${token} requires a value`);
    return [args[index + 1], index + 1];
  };

  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (!token.startsWith('--')) throw new EvalUsageError(`unexpected argument '${token}'`);
    const key = token.split('=', 1)[0];
    const [value, consumed] = take(index, token);
    index = consumed;
    if (!value) throw new EvalUsageError(`${key} requires a value`);

    if (key === '--candidate-arg') options.candidate.push(value);
    else if (key === '--judge-arg') options.judge.push(value);
    else {
      if (!['--skill', '--id', '--candidate', '--judge', '--timeout-ms'].includes(key)) {
        throw new EvalUsageError(`unknown flag '${key}'`);
      }
      if (scalar.has(key)) throw new EvalUsageError(`duplicate flag '${key}'`);
      scalar.add(key);
      if (key === '--skill') options.skill = value;
      else if (key === '--id') options.id = Number(value);
      else if (key === '--candidate') options.candidate.unshift(value);
      else if (key === '--judge') options.judge.unshift(value);
      else options.timeoutMs = Number(value);
    }
  }

  if (!options.skill || options.candidate.length === 0 || options.judge.length === 0) {
    throw new EvalUsageError('--skill, --candidate, and --judge are required');
  }
  if (options.id !== undefined && (!Number.isInteger(options.id) || options.id < 0)) {
    throw new EvalUsageError('--id must be a non-negative integer');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new EvalUsageError('--timeout-ms must be positive');
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseEvalArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof EvalUsageError)) throw error;
    console.error(error.message);
    console.error('Usage: node install/run-evals.mjs --skill NAME [--id N] --candidate CMD [--candidate-arg ARG ...] --judge CMD [--judge-arg ARG ...] [--timeout-ms MS]');
    process.exitCode = 2;
    return;
  }

  const skillDir = join(DEFAULT_ROOT, 'skills', options.skill);
  try {
    const skillText = await readFile(join(skillDir, 'SKILL.md'), 'utf8');
    const completeDoc = JSON.parse(await readFile(join(skillDir, 'evals', 'evals.json'), 'utf8'));
    const selected = options.id === undefined
      ? completeDoc.evals
      : completeDoc.evals.filter((evaluation) => evaluation.id === options.id);
    if (selected.length === 0) throw new Error(`eval ${options.id} was not found for ${options.skill}`);
    const result = await runEvalCases({
      skillText,
      doc: { ...completeDoc, evals: selected },
      candidate: options.candidate,
      judge: options.judge,
      timeoutMs: options.timeoutMs,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
