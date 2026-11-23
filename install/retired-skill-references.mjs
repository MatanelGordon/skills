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
 * is reported, which is why CI checks out with full history.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKILL_FILE = /^skills\/([^/]+)\/SKILL\.md$/;
// History files record what was true then; naming a retired skill there is correct.
const HISTORY_DIRS = ['.plan/', '.adr/'];
const isHistoryFile = (path) => (
  HISTORY_DIRS.some((dir) => path.startsWith(dir)) || /(^|\/)CHANGELOG\.md$/i.test(path)
);
const NAME_CHAR = '[A-Za-z0-9_-]';
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
 * How a skill is named in this repo: `name`, skills/name/..., **name**, [name].
 * A hyphenated name is distinctive enough to count in plain prose too; a single
 * word such as "rank" is not, so it counts only in those formatted forms.
 */
function namePattern(name) {
  const n = escapeRegex(name);
  const formatted = [`\`${n}\``, `(?<!${NAME_CHAR})skills/${n}(?!${NAME_CHAR})`, `\\*\\*${n}\\*\\*`, `\\[${n}\\]`];
  if (name.includes('-')) formatted.push(`(?<!${NAME_CHAR})${n}(?!${NAME_CHAR})`);
  return new RegExp(formatted.join('|'));
}

/** Every line of `text` that names one of `names`, as { line, name } (1-based lines). */
export function scanText(text, names) {
  const patterns = names.map((name) => ({ name, pattern: namePattern(name) }));
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
    for (const hit of scanText(bytes.toString('utf8'), retired)) references.push({ file, ...hit });
  }
  return references;
}
