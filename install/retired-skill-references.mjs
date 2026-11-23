/**
 * Retired-skill references: a current file must not name a skill that used to
 * live under skills/ and no longer does. Removing or renaming a skill without
 * sweeping its references leaves README rows, cross-references and installer
 * links pointing at nothing.
 *
 * "Retired" comes from git: every skills/<name>/SKILL.md in HEAD's history,
 * minus the skills present now. That covers committed and uncommitted removals
 * and the old side of a rename, with no list to keep up to date. Without git
 * history (not a repository, or a shallow clone) the set is empty and nothing
 * is reported. CI checks out with full history, and a shallow clone under CI is
 * reported as a problem so the check cannot pass by having nothing to compare.
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

function gitLines(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split(/\0|\r?\n/).filter(Boolean);
}

/** Skill names that were ever in HEAD's history and are not among `currentSkills`. */
export function retiredSkillNames(root, currentSkills) {
  const paths = gitLines(root, ['log', '--no-renames', '--format=', '--name-only', '-z', 'HEAD', '--', 'skills/']);
  if (!paths) return [];
  const current = new Set(currentSkills);
  const ever = new Set(paths.map((path) => SKILL_FILE.exec(path)?.[1]).filter(Boolean));
  return [...ever].filter((name) => !current.has(name)).sort();
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
export async function findRetiredSkillReferences(root, currentSkills) {
  const retired = retiredSkillNames(root, currentSkills);
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
 * What `npm run validate` reports, as { scope, message }: each reference to a
 * retired skill, and, in CI, a shallow clone, where the check could not work.
 */
export async function retiredSkillProblems(root, currentSkills, env = process.env) {
  const problems = [];
  if (env.CI && isShallow(root)) {
    problems.push({
      scope: 'repository',
      message: 'git history is shallow, so removed skills cannot be found; check out with fetch-depth: 0',
    });
  }
  for (const { file, line, name } of await findRetiredSkillReferences(root, currentSkills)) {
    problems.push({ scope: file, message: `line ${line} names '${name}', which is no longer a skill under skills/` });
  }
  return problems;
}
