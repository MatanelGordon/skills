#!/usr/bin/env node
/**
 * Checks a plan folder written by the visual-plan skill: plan.md for the agent,
 * review.md for the user, and the SVG diagrams the review links.
 *
 * Usage: node check-review.mjs <plan-folder> [--json] [--max-words <n>]
 * Exit:  0 clean, 1 findings, 64 bad invocation, 70 the folder could not be read.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countWords,
  hasInlineSvg,
  imageTargets,
  leadingQuestionIds,
  linksPlan,
  mentionsId,
  normaliseNewlines,
  planIds,
} from './lib/markdown.mjs';
import { findSvgProblems } from './lib/svg.mjs';

export { countWords, findSvgProblems, imageTargets, leadingQuestionIds, planIds };

export const DEFAULT_MAX_WORDS = 500;

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 64;
const EXIT_UNREADABLE = 70;

class UsageError extends Error {}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const finding = (code, message) => ({ code, message });
const readText = (path) => (existsSync(path) && statSync(path).isFile() ? normaliseNewlines(readFileSync(path, 'utf8')) : null);
const isRemoteTarget = (target) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);

const decodeTarget = (target) => {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

/** True when `path` resolves, through any symlinks, to a place inside `root`. */
const staysInside = (root, path) => {
  try {
    const real = realpathSync(path);
    const realRoot = realpathSync(root);
    return real === realRoot || real.startsWith(realRoot + sep);
  } catch {
    return true;
  }
};

/** Where a local image target points, relative to the plan folder, in POSIX form. */
const locateTarget = (dir, target) => {
  const path = decodeTarget(target.trim().replace(/[?#].*$/, ''));
  const location = relative(dir, resolve(dir, path)).split(sep).join('/');
  const lexicallyInside = !path.startsWith('/') && location !== '' && !location.startsWith('..') && !isAbsolute(location);
  const inside = lexicallyInside && staysInside(dir, join(dir, location));
  return { target, location, inside, backslash: target.includes('\\') };
};

const svgFilesIn = (dir) => (existsSync(dir) && statSync(dir).isDirectory()
  ? readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name.toLowerCase().endsWith('.svg') && (entry.isFile() || entry.isSymbolicLink()))
    .map((entry) => `diagrams/${entry.name}`)
    .sort()
  : []);

function diagramFindings(dir, review) {
  const targets = imageTargets(review);
  const remote = targets.filter(isRemoteTarget);
  const located = targets.filter((target) => !isRemoteTarget(target)).map((target) => locateTarget(dir, target));
  const backslashed = located.filter((image) => image.backslash);
  const outside = located.filter((image) => !image.backslash && !image.inside);
  const linked = [...new Set(located
    .filter((image) => !image.backslash && image.inside && image.location.toLowerCase().endsWith('.svg'))
    .map((image) => image.location))];
  const missing = linked.filter((location) => readText(join(dir, location)) === null);
  const unlinked = svgFilesIn(join(dir, 'diagrams')).filter((location) => !linked.includes(location));
  const invalid = linked
    .filter((location) => !missing.includes(location))
    .map((location) => ({ location, problems: findSvgProblems(readText(join(dir, location))) }))
    .filter((diagram) => diagram.problems.length > 0);
  return {
    linked,
    findings: [
      ...(hasInlineSvg(review)
        ? [finding('inline-svg', 'review.md contains inline <svg>: GitHub strips it. Save the diagram as diagrams/<name>.svg and link it with ![what it shows](diagrams/<name>.svg)')]
        : []),
      ...remote.map((target) => finding('diagram-remote', `image ${target.slice(0, 60)} is not a file in this folder: save it under diagrams/ and link it by relative path`)),
      ...backslashed.map((image) => finding('diagram-path', `image ${image.target} uses a backslash: write the path with forward slashes, as diagrams/<name>.svg`)),
      ...outside.map((image) => finding('diagram-outside', `image ${image.target} points outside the plan folder: keep diagrams in diagrams/ beside review.md`)),
      ...(linked.length === 0 ? [finding('no-diagram', 'review.md links no SVG diagram: add at least one, as ![what it shows](diagrams/<name>.svg)')] : []),
      ...missing.map((location) => finding('diagram-missing', `review.md links ${location}, which does not exist`)),
      ...unlinked.map((location) => finding('diagram-unlinked', `${location} is not linked from review.md: link it or delete it`)),
      ...invalid.map((diagram) => finding('svg-invalid', `${diagram.location}: ${diagram.problems.join('; ')}`)),
    ],
  };
}

function idFindings(plan, review) {
  const { questions, decisions } = planIds(plan);
  const ids = [...questions, ...decisions];
  const uncovered = ids.filter((id) => !mentionsId(review, id));
  const unknown = leadingQuestionIds(review).filter((id) => !questions.includes(id));
  return {
    ids,
    findings: [
      ...(uncovered.length > 0
        ? [finding('id-uncovered', `review.md does not mention ${uncovered.join(', ')}: every question and ADR in plan.md appears in the review under the same id`)]
        : []),
      ...(unknown.length > 0
        ? [finding('id-unknown', `review.md lists ${unknown.join(', ')}, which plan.md does not: add the question to plan.md under "Risks and unknowns" first, or drop it`)]
        : []),
    ],
  };
}

/** Checks one plan folder against the visual-plan contract. Throws UsageError when it is not a folder. */
export function checkPlanDir(dir, { maxWords = DEFAULT_MAX_WORDS } = {}) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`${dir} is not a folder`);
  const plan = readText(join(dir, 'plan.md'));
  const review = readText(join(dir, 'review.md'));
  const hasPlan = Boolean(plan?.trim());
  const hasReview = Boolean(review?.trim());
  const fileFindings = [
    ...(hasPlan ? [] : [finding('plan-missing', 'plan.md is missing or empty: it is the file the implementing agent follows')]),
    ...(hasReview ? [] : [finding('review-missing', 'review.md is missing or empty: it is the file the user reads')]),
  ];
  if (!hasReview) return { ok: false, findings: fileFindings, words: 0, maxWords, diagrams: [], ids: [] };
  const matched = hasPlan ? idFindings(plan, review) : { ids: [], findings: [] };

  const diagrams = diagramFindings(dir, review);
  const words = countWords(review);
  const findings = [
    ...fileFindings,
    ...(linksPlan(review) ? [] : [finding('plan-link', 'review.md does not link the full plan: add [plan.md](plan.md) near the top')]),
    ...diagrams.findings,
    ...(words > maxWords ? [finding('word-budget', `review.md has ${words} words; the budget is ${maxWords}. Keep the gist and leave the detail in plan.md`)] : []),
    ...matched.findings,
  ];
  return { ok: findings.length === 0, findings, words, maxWords, diagrams: diagrams.linked, ids: matched.ids };
}

// --- CLI --------------------------------------------------------------------

const USAGE = 'usage: node check-review.mjs <plan-folder> [--json] [--max-words <n>]';

function parseArguments(argv) {
  const parsed = argv.reduce((state, argument) => {
    if (state.expectsMaxWords) return { ...state, expectsMaxWords: false, maxWords: argument };
    if (argument === '--json') return { ...state, json: true };
    if (argument === '--max-words') return { ...state, expectsMaxWords: true };
    if (argument.startsWith('--')) throw new UsageError(`unknown option ${argument}`);
    if (state.dir !== null) throw new UsageError('give one plan folder');
    return { ...state, dir: argument };
  }, { dir: null, json: false, maxWords: String(DEFAULT_MAX_WORDS), expectsMaxWords: false });
  if (parsed.dir === null) throw new UsageError('no plan folder given');
  if (parsed.expectsMaxWords || !/^[1-9]\d*$/.test(parsed.maxWords)) throw new UsageError('--max-words needs a whole number above zero');
  return { dir: parsed.dir, json: parsed.json, maxWords: Number(parsed.maxWords) };
}

const report = (dir, result) => (result.ok
  ? `✔ ${dir}: plan.md + review.md, ${plural(result.diagrams.length, 'diagram')}, ${result.words}/${result.maxWords} words, ${plural(result.ids.length, 'id')} matched`
  : [
    ...result.findings.map((entry) => `✖ [${entry.code}] ${entry.message}`),
    `${plural(result.findings.length, 'problem')} in ${dir}`,
  ].join('\n'));

function main(argv) {
  try {
    const { dir, json, maxWords } = parseArguments(argv);
    const result = checkPlanDir(dir, { maxWords });
    process.stdout.write(`${json ? JSON.stringify({ dir, ...result }, null, 2) : report(dir, result)}\n`);
    process.exitCode = result.ok ? EXIT_OK : EXIT_FINDINGS;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`check-review: ${error.message}\n${USAGE}\n`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    process.stderr.write(`check-review: could not read the plan folder: ${error.message}\n`);
    process.exitCode = EXIT_UNREADABLE;
  }
}

function isEntryPoint(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    // A symlinked skill install leaves the link in argv[1], while import.meta.url names the real file.
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    return resolve(argvPath) === modulePath;
  }
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2));
