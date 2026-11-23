#!/usr/bin/env node
/**
 * Rewrite every evals.json into the standard format (EVALS.md), and check that they are in it.
 *
 * This is the file layer over install/eval-format.mjs: it finds the eval files,
 * answers "what is at this path", applies the fixture writes, copies and moves the
 * normaliser asks for, and rewrites the JSON. Running it twice changes nothing
 * the second time, so it is safe to rerun after any merge.
 */
import { closeSync, lstatSync, openSync, readSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from './entry-point.mjs';
import { checkEvalDocument, normalizeEvalDocument, serializeEvalDocument } from './eval-format.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEXT_PROBE_BYTES = 4096;
const EXIT_PROBLEMS = 1;
const EXIT_USAGE = 2;
const LAYOUT_HINT = 'not in the standard layout; run "npm run normalize-evals"';

export class EvalFileError extends Error {}

const toRepositoryPath = (root, path) => relative(root, path).replaceAll('\\', '/');
const inside = (baseDir, relativePath) => join(baseDir, ...relativePath.split('/'));
const withUnixNewlines = (text) => text.replace(/\r\n/g, '\n');

async function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

/** The first bytes of a file hold no NUL: the same test agent-skills-eval uses to call a fixture text. */
function looksLikeText(path, bytes) {
  const probe = Buffer.alloc(Math.min(bytes, TEXT_PROBE_BYTES));
  const descriptor = openSync(path, 'r');
  try {
    readSync(descriptor, probe, 0, probe.length, 0);
  } finally {
    closeSync(descriptor);
  }
  return !probe.includes(0);
}

/** Describe a path relative to `baseDir` without following a symlink, so a link can never pass as a fixture. */
export const lookupIn = (baseDir) => (relativePath) => {
  let stats;
  try {
    stats = lstatSync(inside(baseDir, relativePath));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { kind: 'missing' };
    throw error;
  }
  if (stats.isDirectory()) return { kind: 'dir' };
  if (!stats.isFile()) return { kind: 'other' };
  return { kind: 'file', bytes: stats.size, isText: looksLikeText(inside(baseDir, relativePath), stats.size) };
};

/** Every eval file in the repository: one per skill, one per agent. */
export async function findEvalFiles(root) {
  const skillsRoot = join(root, 'skills');
  if (!(await exists(skillsRoot))) throw new EvalFileError(`no skills/ folder under ${root}`);

  const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const skillFiles = [];
  for (const name of skillDirs) {
    const file = join(skillsRoot, name, 'evals', 'evals.json');
    if (await exists(file)) skillFiles.push({ file, kind: 'skill', scope: name, baseDir: join(skillsRoot, name) });
  }

  const agentsRoot = join(root, 'agents');
  const agentNames = (await exists(agentsRoot))
    ? (await readdir(agentsRoot)).filter((name) => name.endsWith('.evals.json')).sort()
    : [];
  const agentFiles = agentNames.map((name) => (
    { file: join(agentsRoot, name), kind: 'agent', scope: `agents/${name}`, baseDir: agentsRoot }
  ));
  return [...skillFiles, ...agentFiles];
}

async function readEvalFile(target, root) {
  const raw = await readFile(target.file, 'utf8');
  try {
    return { raw, doc: JSON.parse(raw) };
  } catch (error) {
    throw new EvalFileError(`${toRepositoryPath(root, target.file)}: invalid JSON: ${error.message}`);
  }
}

const sourceText = async (baseDir, action) => (
  action.type === 'write' ? action.content : readFile(inside(baseDir, action.from), 'utf8')
);
const destinationOf = (action) => (action.type === 'write' ? action.path : action.to);

/** Why an action cannot be applied, or null. Checked for every action before any is applied. */
async function blockerFor(baseDir, action) {
  const destination = destinationOf(action);
  const destinationPath = inside(baseDir, destination);
  if (!(await exists(destinationPath))) return null;
  const found = lookupIn(baseDir)(destination);
  const sameContent = found.kind === 'file'
    && (await readFile(destinationPath, 'utf8')) === (await sourceText(baseDir, action));
  return sameContent ? null : `${destination} already exists with different content; it was not overwritten`;
}

/** Remove folders a move emptied, walking up but never past evals/. */
async function pruneEmptyFolders(baseDir, relativeFolder) {
  const stopAt = inside(baseDir, 'evals');
  let folder = inside(baseDir, relativeFolder);
  while (folder.startsWith(stopAt) && folder !== stopAt) {
    if ((await readdir(folder)).length > 0) return;
    await rmdir(folder);
    folder = dirname(folder);
  }
}

async function applyAction(baseDir, action) {
  const destinationPath = inside(baseDir, destinationOf(action));
  const destinationExists = await exists(destinationPath);
  if (!destinationExists) await mkdir(dirname(destinationPath), { recursive: true });

  if (action.type === 'write' && !destinationExists) await writeFile(destinationPath, action.content);
  if (action.type === 'copy' && !destinationExists) await copyFile(inside(baseDir, action.from), destinationPath);
  if (action.type === 'move') {
    const sourcePath = inside(baseDir, action.from);
    if (destinationExists) await rm(sourcePath);
    else await rename(sourcePath, destinationPath);
    await pruneEmptyFolders(baseDir, action.from.slice(0, action.from.lastIndexOf('/')));
  }
}

/**
 * Normalise one eval file. With `write: false` nothing on disk changes and
 * `changed` says whether a real run would change something.
 */
export async function normalizeEvalFile(target, { root = DEFAULT_ROOT, write = true } = {}) {
  const { raw, doc } = await readEvalFile(target, root);
  const result = normalizeEvalDocument(doc, lookupIn(target.baseDir), { kind: target.kind });
  const text = serializeEvalDocument(result.doc);
  const changed = text !== withUnixNewlines(raw) || result.actions.length > 0;
  const report = { scope: target.scope, file: toRepositoryPath(root, target.file), changed, actions: result.actions };
  if (!write || !changed) return { ...report, problems: result.problems };

  const blockers = (await Promise.all(result.actions.map((action) => blockerFor(target.baseDir, action)))).filter(Boolean);
  // A dataset must never be rewritten to point at a fixture this run did not put there.
  if (blockers.length > 0) return { ...report, problems: [...result.problems, ...blockers] };

  for (const action of result.actions) await applyAction(target.baseDir, action);
  await writeFile(target.file, text);
  return { ...report, problems: result.problems };
}

export async function normalizeRepository(root = DEFAULT_ROOT, { write = true } = {}) {
  const absoluteRoot = resolve(root);
  const targets = await findEvalFiles(absoluteRoot);
  const results = [];
  for (const target of targets) results.push(await normalizeEvalFile(target, { root: absoluteRoot, write }));
  return results;
}

/**
 * The validator's view of every eval file: `errors` stop a runner from loading
 * or grading the file, `warnings` are shortfalls against the standard.
 * A file that cannot be read or parsed is skipped; the validator reports it itself.
 */
export async function checkRepositoryEvals(root = DEFAULT_ROOT) {
  const absoluteRoot = resolve(root);
  const errors = [];
  const warnings = [];
  for (const target of await findEvalFiles(absoluteRoot)) {
    let parsed;
    try {
      parsed = await readEvalFile(target, absoluteRoot);
    } catch (error) {
      if (error instanceof EvalFileError) continue;
      throw error;
    }
    const lookup = lookupIn(target.baseDir);
    const checked = checkEvalDocument(parsed.doc, lookup, { kind: target.kind });
    for (const message of checked.errors) errors.push({ scope: target.scope, message });
    for (const message of checked.warnings) warnings.push({ scope: target.scope, message });

    const normalized = normalizeEvalDocument(parsed.doc, lookup, { kind: target.kind });
    const isStandardLayout = normalized.actions.length === 0
      && serializeEvalDocument(normalized.doc) === withUnixNewlines(parsed.raw);
    if (!isStandardLayout) warnings.push({ scope: target.scope, message: LAYOUT_HINT });
  }
  return { errors, warnings };
}

class UsageError extends Error {}

export function parseArgs(args) {
  const options = { check: false, root: DEFAULT_ROOT };
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (token === '--check') options.check = true;
    else if (token === '--root') {
      if (index + 1 >= args.length) throw new UsageError('--root requires a folder');
      options.root = args[++index];
    } else throw new UsageError(`unknown argument '${token}'`);
  }
  return options;
}

async function main() {
  let options;
  let results;
  try {
    options = parseArgs(process.argv.slice(2));
    results = await normalizeRepository(options.root, { write: !options.check });
  } catch (error) {
    if (!(error instanceof UsageError) && !(error instanceof EvalFileError)) throw error;
    console.error(error.message);
    if (error instanceof UsageError) console.error('Usage: node install/normalize-evals.mjs [--check] [--root DIR]');
    process.exitCode = EXIT_USAGE;
    return;
  }

  const changed = results.filter((result) => result.changed);
  const problemCount = results.reduce((total, result) => total + result.problems.length, 0);
  for (const result of changed) {
    const fixtures = result.actions.length ? ` (${result.actions.length} fixture ${result.actions.length === 1 ? 'file' : 'files'})` : '';
    console.log(`${options.check ? 'would rewrite' : 'rewrote'} ${result.file}${fixtures}`);
  }
  for (const result of results) {
    for (const problem of result.problems) console.error(`  ✖ ${result.scope}: ${problem}`);
  }
  const verb = options.check ? 'would be rewritten' : 'rewritten';
  console.log(`${results.length} eval files checked, ${changed.length} ${verb}, ${problemCount} ${problemCount === 1 ? 'problem' : 'problems'}`);
  if (problemCount > 0 || (options.check && changed.length > 0)) process.exitCode = EXIT_PROBLEMS;
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) await main();
