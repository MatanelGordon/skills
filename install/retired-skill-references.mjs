/**
 * Retired-skill references: a current file must not name a skill that used to
 * live under skills/ and no longer does. Removing or renaming a skill without
 * sweeping its references leaves README rows, cross-references and installer
 * links pointing at nothing.
 *
 * "Retired" comes from git: every skills/<name>/SKILL.md in HEAD's history,
 * minus the skills present now. That covers committed and uncommitted removals
 * and the old side of a rename, with no list to keep up to date. Without git
 * history (an export or tarball with no .git, a repository with no commits, no
 * git) the check cannot run, and validate warns that it was skipped and why.
 * A shallow clone gets a warning too; under CI it is a failure, since CI checks
 * out with full history and must not pass by having nothing to compare.
 */
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKILL_FILE = /^skills\/([^/]+)\/SKILL\.md$/;
// History files record what was true then; naming a retired skill there is correct.
const HISTORY_DIRS = ['.plan/', '.adr/'];
const isHistoryFile = (path) => (
  HISTORY_DIRS.some((dir) => path.startsWith(dir)) || /(^|\/)CHANGELOG\.md$/i.test(path)
);
const NAME_CHAR = '[A-Za-z0-9_-]';
// In code, [x](...) is a call on an indexed value, not a link.
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash', '.zsh',
  '.ps1', '.rb', '.go', '.rs', '.cs', '.java', '.kt', '.swift', '.c', '.h', '.cpp', '.php', '.lua', '.pl']);
const isCode = (path) => CODE_EXTENSIONS.has(extname(path).toLowerCase());
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Run git in `root`: { lines } on success, { error } with git's first line of complaint otherwise. */
function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) return { error: result.error.code === 'ENOENT' ? 'git is not installed' : result.error.message };
  if (result.status !== 0) {
    const complaint = result.stderr.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return { error: complaint ?? `git exited with ${result.status}` };
  }
  return { lines: result.stdout.split(/\0|\r?\n/).filter(Boolean) };
}

const gitLines = (root, args) => runGit(root, args).lines ?? null;

/** { names } of skills ever in HEAD's history and not among `currentSkills`, or { error }. */
function readRetiredSkills(root, currentSkills) {
  const log = runGit(root, ['log', '--no-renames', '--format=', '--name-only', '-z', 'HEAD', '--', 'skills/']);
  if (log.error) return { error: log.error };
  const current = new Set(currentSkills);
  const ever = new Set(log.lines.map((path) => SKILL_FILE.exec(path)?.[1]).filter(Boolean));
  return { names: [...ever].filter((name) => !current.has(name)).sort() };
}

/** Skill names that were ever in HEAD's history and are not among `currentSkills`. */
export function retiredSkillNames(root, currentSkills) {
  return readRetiredSkills(root, currentSkills).names ?? [];
}

/**
 * How a skill is named. Anywhere: a path (skills/name, ../name/SKILL.md). A
 * hyphenated name is distinctive enough to count bare as well, which covers
 * `name`, **name** and /name. A single word such as "rank" is not: `rank`,
 * **rank** and GET /rank are ordinary in docs, so it counts only as a path or,
 * in docs, as a [rank](...) link. A single-word name written only as `rank` is
 * the one form this check misses.
 */
function namePattern(name, prose) {
  const n = escapeRegex(name);
  const forms = [`(?<!${NAME_CHAR})skills[\\\\/]${n}(?!${NAME_CHAR})`, `(?<!${NAME_CHAR})${n}/SKILL\\.md`];
  if (name.includes('-')) forms.push(`(?<!${NAME_CHAR})${n}(?!${NAME_CHAR})`);
  else if (prose) forms.push(`\\[${n}\\][(:]`);
  return new RegExp(forms.join('|'));
}

/** Every line of `text` that names one of `names`, as { line, name } (1-based lines). */
export function scanText(text, names, { prose = true } = {}) {
  const patterns = names.map((name) => ({ name, pattern: namePattern(name, prose) }));
  const hits = [];
  text.split(/\r?\n/).forEach((content, index) => {
    for (const { name, pattern } of patterns) {
      if (pattern.test(content)) hits.push({ line: index + 1, name });
    }
  });
  return hits;
}

/** Files a commit would carry: tracked and untracked-but-not-ignored, minus history files. */
function currentFiles(root) {
  const files = gitLines(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']) ?? [];
  return [...new Set(files)].filter((path) => !isHistoryFile(path)).sort();
}

/** References to retired skills in current files, as { file, line, name }. */
export async function findRetiredSkillReferences(root, currentSkills, retired = retiredSkillNames(root, currentSkills)) {
  if (!retired.length) return [];
  const references = [];
  for (const file of currentFiles(root)) {
    let bytes;
    try {
      bytes = await readFile(join(root, file));
    } catch {
      continue; // listed in the index but deleted in the work tree
    }
    if (bytes.includes(0)) continue; // binary
    for (const hit of scanText(bytes.toString('utf8'), retired, { prose: !isCode(file) })) {
      references.push({ file, ...hit });
    }
  }
  return references;
}

const isShallow = (root) => gitLines(root, ['rev-parse', '--is-shallow-repository'])?.[0] === 'true';

/**
 * What `npm run validate` reports: { problems: [{ scope, message }], notice }.
 * Problems are each reference to a retired skill and, under CI, a shallow
 * clone. The notice, when set, says the check was skipped or incomplete, so a
 * green run without git history does not look like a checked one.
 */
export async function checkRetiredSkills(root, currentSkills, env = process.env) {
  const history = readRetiredSkills(root, currentSkills);
  if (history.error) {
    return {
      problems: [],
      notice: `retired-skill check skipped: git history could not be read (${history.error}), `
        + 'so a file that still names a removed skill would not be caught',
    };
  }
  const problems = [];
  let notice = null;
  if (isShallow(root)) {
    const message = 'git history is shallow, so removed skills cannot be found; check out with fetch-depth: 0';
    if (env.CI) problems.push({ scope: 'repository', message });
    else notice = `retired-skill check incomplete: ${message}`;
  }
  for (const { file, line, name } of await findRetiredSkillReferences(root, currentSkills, history.names)) {
    problems.push({ scope: file, message: `line ${line} names '${name}', which is no longer a skill under skills/` });
  }
  return { problems, notice };
}
