#!/usr/bin/env node
/**
 * Skill installer — one source of truth, installed into every agent you use.
 *
 * The Agent Skills format (agentskills.io) is identical across platforms; only
 * the discovery directory differs. So install = link (or copy) the same folder
 * into each platform's path.
 *
 *   install-skills                interactive install (default)
 *   install-skills --yes [--copy] everything, into every detected agent
 *   install-skills list           what is installed where, and how
 *   install-skills doctor         find broken or stale symlinks
 *   install-skills uninstall      remove this repo's skills from your agents
 *
 * install and uninstall also remove links into this repo's skills/ (and
 * agents/) whose target is gone, left by a skill that was removed or renamed.
 *   install-skills --help
 */
import {
  readdir,
  readFile,
  mkdir,
  symlink,
  rm,
  lstat,
  readlink,
  cp,
  copyFile,
  rename,
  realpath,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import prompts from 'prompts';
import { isEntryPoint } from './entry-point.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SKILLS_DIR = join(ROOT, 'skills');
const AGENTS_DIR = join(ROOT, 'agents');
const HOME = homedir();
// Agents are Claude Code subagent files; only Claude consumes them today.
const AGENT_TARGET = { label: 'Claude Code agents', dir: join(HOME, '.claude', 'agents'), detect: join(HOME, '.claude') };

// Running out of the npx cache: symlinks would dangle when npm prunes it.
const EPHEMERAL = ROOT.includes(`_npx`) || ROOT.includes(join('.npm', '_cacache'));
const OWNER = 'github.com/MatanelGordon/skills';
const DIR_MARKER = '.matanelgordon-skills-install.json';
const FILE_MARKER_SUFFIX = '.matanelgordon-skills-install.json';

/** Verified 2026-08: personal-scope skill directories per platform. */
const PLATFORMS = [
  { id: 'claude',  label: 'Claude Code',    dir: join(HOME, '.claude', 'skills'),           detect: join(HOME, '.claude') },
  { id: 'codex',   label: 'OpenAI Codex',   dir: join(HOME, '.codex', 'skills'),            detect: join(HOME, '.codex') },
  { id: 'copilot', label: 'GitHub Copilot', dir: join(HOME, '.copilot', 'skills'),          detect: join(HOME, '.copilot') },
  { id: 'tabnine', label: 'Tabnine',        dir: join(HOME, '.tabnine', 'agent', 'skills'), detect: join(HOME, '.tabnine') },
  // Shared convention read by Copilot, Tabnine, OpenCode, Cursor, Gemini CLI…
  { id: 'agents',  label: 'Shared (~/.agents/skills)', dir: join(HOME, '.agents', 'skills'), detect: join(HOME, '.agents') },
];

const log = {
  title: (s) => console.log('\n' + chalk.bold.cyan(s)),
  ok:    (s) => console.log(chalk.green('  ✔ ') + s),
  skip:  (s) => console.log(chalk.gray('  – ') + chalk.gray(s)),
  warn:  (s) => console.log(chalk.yellow('  ! ') + s),
  err:   (s) => console.log(chalk.red('  ✖ ') + s),
  info:  (s) => console.log(chalk.gray('    ' + s)),
};

const meta = (fm, key) => new RegExp(`^\\s{2}${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim() ?? null;

async function readAgents() {
  if (!existsSync(AGENTS_DIR)) return [];
  return (await readdir(AGENTS_DIR)).filter((n) => n.endsWith('.md'))
    .map((n) => ({ name: n.replace(/\.md$/, ''), file: n, path: join(AGENTS_DIR, n) }));
}

const markerPath = (dest, kind) => kind === 'dir' ? join(dest, DIR_MARKER) : `${dest}${FILE_MARKER_SUFFIX}`;

async function readMarker(dest, kind) {
  try {
    const marker = JSON.parse(await readFile(markerPath(dest, kind), 'utf8'));
    return marker.owner === OWNER && marker.kind === kind ? marker : null;
  } catch {
    return null;
  }
}

async function sameContent(source, dest, kind) {
  if (kind === 'file') {
    try {
      const [left, right] = await Promise.all([readFile(source), readFile(dest)]);
      return left.equals(right);
    } catch {
      return false;
    }
  }

  const compareDir = async (leftDir, rightDir) => {
    let leftEntries;
    let rightEntries;
    try {
      [leftEntries, rightEntries] = await Promise.all([
        readdir(leftDir, { withFileTypes: true }),
        readdir(rightDir, { withFileTypes: true }),
      ]);
    } catch {
      return false;
    }
    rightEntries = rightEntries.filter((entry) => entry.name !== DIR_MARKER);
    const sort = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name));
    sort(leftEntries);
    sort(rightEntries);
    if (leftEntries.length !== rightEntries.length) return false;
    for (let i = 0; i < leftEntries.length; i++) {
      const left = leftEntries[i];
      const right = rightEntries[i];
      if (left.name !== right.name) return false;
      const leftPath = join(leftDir, left.name);
      const rightPath = join(rightDir, right.name);
      if (left.isDirectory() !== right.isDirectory()
        || left.isFile() !== right.isFile()
        || left.isSymbolicLink() !== right.isSymbolicLink()) return false;
      if (left.isDirectory()) {
        if (!await compareDir(leftPath, rightPath)) return false;
      } else if (left.isSymbolicLink()) {
        const [leftTarget, rightTarget] = await Promise.all([readlink(leftPath), readlink(rightPath)]);
        if (leftTarget !== rightTarget) return false;
      } else {
        const [leftBytes, rightBytes] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
        if (!leftBytes.equals(rightBytes)) return false;
      }
    }
    return true;
  };
  return compareDir(source, dest);
}

/** Classify a destination without mutating it. */
export async function classifyDestination(source, dest, kind) {
  let st;
  try {
    st = await lstat(dest);
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'absent' };
    throw error;
  }

  if (st.isSymbolicLink()) {
    const target = await readlink(dest);
    const resolvedTarget = resolve(dirname(dest), target);
    const ours = resolvedTarget === resolve(source);
    const broken = !existsSync(dest);
    return {
      state: broken
        ? (ours ? 'broken-owned-link' : 'broken-foreign-link')
        : (ours ? 'owned-link' : 'foreign-link'),
      target,
    };
  }

  const expectedType = kind === 'dir' ? st.isDirectory() : st.isFile();
  const marker = expectedType ? await readMarker(dest, kind) : null;
  const identical = expectedType ? await sameContent(source, dest, kind) : false;
  if (identical) return { state: marker ? 'owned-copy' : 'identical-copy' };
  if (marker) return { state: 'edited-copy' };
  return { state: 'foreign-copy' };
}

const safeStates = new Set(['absent', 'owned-link', 'broken-owned-link', 'owned-copy']);

const backupStamp = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');

async function nextBackupPath(dest, now) {
  const base = `${dest}.backup-${backupStamp(now)}`;
  let candidate = base;
  let suffix = 2;
  while (existsSync(candidate) || existsSync(`${candidate}${FILE_MARKER_SUFFIX}`)) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function removeManagedDestination(dest, kind) {
  await rm(dest, { recursive: kind === 'dir', force: true });
  if (kind === 'file') await rm(markerPath(dest, kind), { force: true });
}

async function backUpDestination(dest, kind, now) {
  const backup = await nextBackupPath(dest, now);
  await rename(dest, backup);
  if (kind === 'file' && existsSync(markerPath(dest, kind))) {
    await rename(markerPath(dest, kind), markerPath(backup, kind));
  }
  return backup;
}

async function writeMarker(dest, source, kind) {
  const marker = {
    owner: OWNER,
    kind,
    source: resolve(source),
    installed_at: new Date().toISOString(),
  };
  await writeFile(markerPath(dest, kind), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

/** Install one directory or file after ownership-aware conflict handling. */
export async function installPath({
  source,
  dest,
  kind,
  mode,
  onConflict = 'skip',
  now = new Date(),
}) {
  await mkdir(dirname(dest), { recursive: true });
  const classification = await classifyDestination(source, dest, kind);
  let backup = null;
  if (!safeStates.has(classification.state)) {
    const decision = typeof onConflict === 'function'
      ? await onConflict({ ...classification, source, dest, kind })
      : onConflict;
    if (decision !== 'backup') {
      return { status: 'conflict', previousState: classification.state };
    }
    backup = await backUpDestination(dest, kind, now);
  } else if (classification.state !== 'absent') {
    await removeManagedDestination(dest, kind);
  }

  if (mode !== 'copy') {
    try {
      const linkType = kind === 'dir' && process.platform === 'win32' ? 'junction' : kind;
      await symlink(source, dest, linkType);
      return { status: 'linked', previousState: classification.state, ...(backup ? { backup } : {}) };
    } catch (error) {
      // A concurrent writer may have claimed the destination after classification.
      // Never turn a symlink failure into a recursive copy over their content.
      const current = await classifyDestination(source, dest, kind);
      if (current.state !== 'absent') {
        return {
          status: 'conflict',
          previousState: current.state,
          ...(backup ? { backup } : {}),
        };
      }
      // Filesystems without symlink support safely fall back to a managed copy.
      if (!error?.code) throw error;
    }
  }

  if (kind === 'dir') await cp(source, dest, { recursive: true, errorOnExist: true, force: false });
  else await copyFile(source, dest, constants.COPYFILE_EXCL);
  await writeMarker(dest, source, kind);
  return {
    status: mode === 'copy' ? 'copied' : 'copied (symlink unavailable)',
    previousState: classification.state,
    ...(backup ? { backup } : {}),
  };
}

async function conflictPolicy(label, YES) {
  if (YES) return 'skip';
  return async ({ state }) => {
    const answer = await prompts({
      type: 'confirm',
      name: 'backup',
      initial: false,
      message: `${label} is ${state.replaceAll('-', ' ')}. Back it up and replace it?`,
    });
    return answer.backup ? 'backup' : 'skip';
  };
}

async function installAgents(mode, { YES = false, force = false } = {}) {
  const agents = await readAgents();
  if (!agents.length || (!force && !existsSync(AGENT_TARGET.detect))) return { installed: 0, conflicts: 0 };
  log.title(AGENT_TARGET.label);
  await mkdir(AGENT_TARGET.dir, { recursive: true });
  let installed = 0;
  let conflicts = 0;
  for (const a of agents) {
    const dest = join(AGENT_TARGET.dir, a.file);
    try {
      const result = await installPath({
        source: a.path,
        dest,
        kind: 'file',
        mode,
        onConflict: await conflictPolicy(`${a.name} at ${AGENT_TARGET.label}`, YES),
      });
      if (result.status === 'conflict') {
        log.warn(`${a.name} — conflict (${result.previousState}); kept existing file`);
        conflicts++;
      } else {
        const backup = result.backup ? `; backup: ${result.backup.replace(HOME, '~')}` : '';
        log.ok(`${chalk.bold(a.name)} ${chalk.gray(result.status + backup)}`);
        installed++;
      }
    } catch (error) {
      log.err(`${a.name} — ${error.message}`);
      conflicts++;
    }
  }
  return { installed, conflicts };
}

async function readSkills() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const md = join(SKILLS_DIR, e.name, 'SKILL.md');
    if (!existsSync(md)) continue;
    const text = await readFile(md, 'utf8');
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    const desc = (/description:\s*>[\s\S]*?\n((?:\s{2,}.*\n?)+)/.exec(fm)?.[1] ?? '')
      .split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
    out.push({
      name: e.name,
      path: join(SKILLS_DIR, e.name),
      summary: desc.slice(0, 100),
      requires: meta(fm, 'requires'),
      platform: meta(fm, 'platform'),
      depends: (meta(fm, 'depends') ?? '').split(',').map((d) => d.trim()).filter(Boolean),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const platformOk = (skill, platform = process.platform) => !skill.platform || skill.platform === platform;

/** Expand a selection to include everything it depends on. Returns added names. */
function withDependencies(selection, skills) {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const chosen = new Set(selection);
  const added = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...chosen]) {
      for (const dep of byName.get(name)?.depends ?? []) {
        if (byName.has(dep) && !chosen.has(dep)) { chosen.add(dep); added.push(dep); grew = true; }
      }
    }
  }
  return { selection: [...chosen], added };
}

export function resolveSkillSelection(selection, skills, platform = process.platform) {
  const expanded = withDependencies(selection, skills);
  for (const name of expanded.selection) {
    const skill = skills.find((candidate) => candidate.name === name);
    if (skill && !platformOk(skill, platform)) {
      throw new Error(`${name} is ${skill.platform}-only and cannot run on ${platform}`);
    }
  }
  return expanded;
}

async function installOne(skill, targetDir, mode, onConflict) {
  return installPath({
    source: skill.path,
    dest: join(targetDir, skill.name),
    kind: 'dir',
    mode,
    onConflict,
  });
}

async function classify(dir, skill) {
  return classifyDestination(skill.path, join(dir, skill.name), 'dir');
}

const isInside = (path, dir) => {
  const rel = relative(dir, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * The target of `path` when it is a symlink into one of `roots` whose target is
 * missing; null for anything else. The OS resolves a relative target against
 * the folder's real location, so that is what is checked. Only "not found" counts
 * as missing: a target that exists but cannot be read is left alone.
 */
async function missingTargetInside(path, realDir, roots) {
  const st = await lstat(path).catch(() => null);
  if (!st?.isSymbolicLink()) return null;
  const target = await readlink(path);
  if (!roots.some((root) => isInside(resolve(realDir, target), root))) return null;
  try {
    await stat(path);
    return null;
  } catch (error) {
    return ['ENOENT', 'ENOTDIR'].includes(error?.code) ? target : null;
  }
}

/**
 * Remove the symlinks in `dir` that point into `sourceRoot` and whose target is
 * gone: what a skill removed or renamed in this repo leaves behind in an
 * agent's folder. A real file or folder, a live link, and a link anywhere else
 * are never touched, and `unlink` cannot delete a real folder. Returns
 * { pruned: [{ name, target }], failed: [{ name, error }] }.
 */
export async function pruneStaleLinks(dir, sourceRoot) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (error?.code === 'ENOENT') return { pruned: [], failed: [] };
    throw error;
  }
  const realDir = await realpath(dir);
  const roots = [resolve(sourceRoot)];
  const realRoot = await realpath(sourceRoot).catch(() => null);
  if (realRoot && realRoot !== roots[0]) roots.push(realRoot);
  const pruned = [];
  const failed = [];
  for (const name of entries.sort()) {
    const path = join(dir, name);
    try {
      const target = await missingTargetInside(path, realDir, roots);
      if (target === null) continue;
      // Check again right before removing: the entry may have been replaced meanwhile.
      if (await missingTargetInside(path, realDir, roots) !== target) continue;
      await unlink(path);
      pruned.push({ name, target });
    } catch (error) {
      failed.push({ name, error });
    }
  }
  return { pruned, failed };
}

/** Every folder this installer links into, with the repo folder its links point at. */
const linkFolders = () => [
  ...PLATFORMS.map((p) => ({ id: p.id, label: p.label, dir: p.dir, sourceRoot: SKILLS_DIR })),
  { id: 'claude', label: AGENT_TARGET.label, dir: AGENT_TARGET.dir, sourceRoot: AGENTS_DIR },
];

/** Prune stale links in each folder and print every removal. Returns counts. */
async function pruneStaleInstalls(folders) {
  let pruned = 0;
  let failed = 0;
  for (const { label, dir, sourceRoot } of folders) {
    let result;
    try {
      result = await pruneStaleLinks(dir, sourceRoot);
    } catch (error) {
      log.err(`${label}: could not prune stale links in ${dir.replace(HOME, '~')} — ${error.message}`);
      failed++;
      continue;
    }
    if (!result.pruned.length && !result.failed.length) continue;
    log.title(`${label} — links to skills no longer in this repo`);
    for (const { name, target } of result.pruned) {
      log.ok(`pruned ${chalk.bold(name)} ${chalk.gray(`→ ${target.replace(HOME, '~')} (target gone)`)}`);
    }
    for (const { name, error } of result.failed) log.err(`${name} — could not prune: ${error.message}`);
    pruned += result.pruned.length;
    failed += result.failed.length;
  }
  return { pruned, failed };
}

// ---------------------------------------------------------------- subcommands

async function cmdList(skills) {
  const agents = await readAgents();
  if (agents.length && existsSync(AGENT_TARGET.dir)) {
    log.title(`${AGENT_TARGET.label}  ${chalk.gray(AGENT_TARGET.dir.replace(HOME, '~'))}`);
    for (const a of agents) {
      const dest = join(AGENT_TARGET.dir, a.file);
      const state = (await classifyDestination(a.path, dest, 'file')).state;
      if (state === 'absent') log.skip(`${a.name} — not installed`);
      else if (state === 'owned-link') log.ok(`${a.name} ${chalk.gray('→ this repo')}`);
      else if (state === 'owned-copy') log.ok(`${a.name} ${chalk.gray('(managed copy)')}`);
      else if (state === 'edited-copy') log.warn(`${a.name} — managed copy has local edits`);
      else log.warn(`${a.name} — conflict (${state})`);
    }
  }
  for (const p of PLATFORMS) {
    if (!existsSync(p.detect)) continue;
    log.title(`${p.label}  ${chalk.gray(p.dir.replace(HOME, '~'))}`);
    for (const s of skills) {
      const c = await classify(p.dir, s);
      if (c.state === 'absent') log.skip(`${s.name} — not installed`);
      else if (c.state === 'owned-link') log.ok(`${s.name} ${chalk.gray('→ this repo')}`);
      else if (c.state === 'owned-copy') {
        log.ok(`${s.name} ${chalk.gray('(copy — will not follow git pull)')}`);
      } else if (c.state === 'broken-owned-link') log.err(`${s.name} — BROKEN link → ${c.target}`);
      else if (c.state === 'edited-copy') log.warn(`${s.name} — managed copy has local edits`);
      else log.warn(`${s.name} — conflict (${c.state})${c.target ? `: ${c.target}` : ''}`);
    }
  }
  console.log();
}

async function cmdDoctor() {
  let problems = 0;
  for (const p of linkFolders()) {
    if (!existsSync(p.dir)) continue;
    for (const e of await readdir(p.dir, { withFileTypes: true }).catch(() => [])) {
      const full = join(p.dir, e.name);
      const st = await lstat(full).catch(() => null);
      if (!st?.isSymbolicLink()) continue;
      if (!existsSync(full)) {
        const target = await readlink(full).catch(() => '?');
        log.err(`${p.label}: ${e.name} → ${target} ${chalk.red('(dangling)')}`);
        log.info(isInside(resolve(p.dir, target), p.sourceRoot)
          ? 'fix: re-run the installer; it prunes links into this repo whose target is gone'
          : `fix: rm '${full.replace(HOME, '~')}' then re-run the installer`);
        problems++;
      }
    }
  }
  if (!problems) log.ok('No broken skill links found across any agent.');
  else log.warn(`${problems} broken link(s). Common cause: this repo was moved or an npx cache was pruned.`);
  console.log();
  process.exitCode = problems ? 1 : 0;
}

async function cmdUninstall(skills, YES) {
  const targets = PLATFORMS.filter((p) => existsSync(p.dir));
  let picked = targets.map((t) => t.id);
  if (!YES) {
    const a = await prompts({
      type: 'multiselect', name: 'p', message: 'Remove this repo\'s skills from which agents?',
      choices: targets.map((t) => ({ title: t.label, value: t.id, selected: true })),
    }, { onCancel: () => process.exit(0) });
    picked = a.p ?? [];
  }
  let removed = 0;
  for (const pid of picked) {
    const p = PLATFORMS.find((x) => x.id === pid);
    log.title(p.label);
    for (const s of skills) {
      const c = await classify(p.dir, s);
      if (c.state === 'absent') continue;
      if (['foreign-link', 'broken-foreign-link', 'foreign-copy', 'identical-copy'].includes(c.state)) {
        log.skip(`${s.name} — kept (${c.state})`);
        continue;
      }
      if (c.state === 'edited-copy') {
        if (YES) {
          log.skip(`${s.name} — kept (managed copy has local edits)`);
          continue;
        }
        const answer = await prompts({
          type: 'confirm', name: 'remove', initial: false,
          message: `${s.name} at ${p.label} is a managed copy with local edits — remove it?`,
        });
        if (!answer.remove) { log.skip(`${s.name} — kept`); continue; }
      }
      await removeManagedDestination(join(p.dir, s.name), 'dir');
      log.ok(`${s.name} removed`);
      removed++;
    }
  }
  const agents = await readAgents();
  if (agents.length && existsSync(AGENT_TARGET.dir) && picked.includes('claude')) {
    log.title(AGENT_TARGET.label);
    for (const a of agents) {
      const dest = join(AGENT_TARGET.dir, a.file);
      const c = await classifyDestination(a.path, dest, 'file');
      if (c.state === 'absent') continue;
      if (['foreign-link', 'broken-foreign-link', 'foreign-copy', 'identical-copy'].includes(c.state)) {
        log.skip(`${a.name} — kept (${c.state})`);
        continue;
      }
      if (c.state === 'edited-copy') {
        if (YES) {
          log.skip(`${a.name} — kept (managed copy has local edits)`);
          continue;
        }
        const answer = await prompts({
          type: 'confirm', name: 'remove', initial: false,
          message: `${a.name} is a managed agent copy with local edits — remove it?`,
        });
        if (!answer.remove) { log.skip(`${a.name} — kept`); continue; }
      }
      await removeManagedDestination(dest, 'file');
      log.ok(`${a.name} removed`); removed++;
    }
  }
  const stale = await pruneStaleInstalls(linkFolders().filter((folder) => picked.includes(folder.id)));
  removed += stale.pruned;
  if (stale.failed) process.exitCode = 1;
  log.title('Done'); log.info(`${removed} removed.`); console.log();
}


async function cmdInstall(skills, options) {
  const { yes: YES, copy: COPY, all: ALL } = options;
  const detected = PLATFORMS.filter((p) => existsSync(p.detect));
  const available = ALL ? PLATFORMS : detected;
  log.title('Detected agents');
  for (const p of PLATFORMS) {
    existsSync(p.detect)
      ? log.ok(`${p.label} ${chalk.gray(p.dir.replace(HOME, '~'))}`)
      : log.skip(`${p.label} — not installed`);
  }
  if (!available.length) {
    log.err('No supported agent found. Install one, or pass --all to force.');
    process.exitCode = 1;
    return;
  }
  if (EPHEMERAL) log.warn('Running from a temporary npx cache — installing copies (symlinks would break when the cache is pruned).');

  let answers;
  if (YES) {
    answers = {
      platforms: available.map((p) => p.id),
      skills: skills.filter(platformOk).map((s) => s.name),
      mode: EPHEMERAL || COPY ? 'copy' : 'link',
    };
    log.info(`--yes: all applicable skills into ${ALL ? 'all supported' : 'all detected'} agents`);
    const skipped = skills.filter((s) => !platformOk(s));
    for (const s of skipped) log.skip(`${s.name} — skipped (${s.platform}-only, this is ${process.platform})`);
  } else {
    answers = await prompts([
      {
        type: 'multiselect', name: 'platforms', message: 'Install into which agents?',
        choices: PLATFORMS.map((p) => ({
          title: p.label, value: p.id,
          description: p.dir.replace(HOME, '~'),
          selected: existsSync(p.detect),
        })),
        min: 1, hint: '— space to toggle, enter to confirm',
      },
      {
        type: 'multiselect', name: 'skills', message: 'Which skills?',
        choices: skills.map((s) => ({
          title: platformOk(s)
            ? (s.requires ? `${s.name} ${chalk.yellow('•')}` : s.name)
            : `${s.name} ${chalk.red(`(${s.platform}-only)`)}`,
          value: s.name, description: s.summary,
          selected: platformOk(s),
          disabled: platformOk(s) ? false : `${s.platform}-only on ${process.platform}`,
        })),
        min: 1, hint: '— space to toggle, enter to confirm',
      },
      {
        type: 'select', name: 'mode', message: 'How should they be installed?',
        choices: [
          ...(EPHEMERAL ? [] : [{ title: 'Symlink (recommended)', value: 'link', description: 'git pull updates every agent at once' }]),
          { title: 'Copy', value: 'copy', description: 'independent copies you can edit per agent' },
        ],
        initial: 0,
      },
    ], { onCancel: () => { console.log(chalk.gray('\n  cancelled\n')); process.exit(0); } });
  }
  if (!answers.platforms?.length || !answers.skills?.length) return;

  let selection;
  let added;
  try {
    ({ selection, added } = resolveSkillSelection(answers.skills, skills));
  } catch (error) {
    log.err(error.message);
    process.exitCode = 2;
    return;
  }
  for (const name of added) log.warn(`${name} added — required by something you selected`);

  // Links left behind by a skill that was removed or renamed here point at nothing.
  const stale = await pruneStaleInstalls(linkFolders().filter((folder) => answers.platforms.includes(folder.id)));

  const chosen = skills.filter((s) => selection.includes(s.name));
  let count = 0;
  let conflicts = stale.failed;
  for (const pid of answers.platforms) {
    const p = PLATFORMS.find((x) => x.id === pid);
    log.title(p.label);
    for (const s of chosen) {
      try {
        const result = await installOne(
          s,
          p.dir,
          answers.mode,
          await conflictPolicy(`${s.name} at ${p.label}`, YES),
        );
        if (result.status === 'conflict') {
          log.warn(`${s.name} — conflict (${result.previousState}); kept existing destination`);
          conflicts++;
        } else {
          const backup = result.backup ? `; backup: ${result.backup.replace(HOME, '~')}` : '';
          log.ok(`${chalk.bold(s.name)} ${chalk.gray(result.status + backup)}`);
          count++;
        }
      } catch (e) {
        log.err(`${s.name} — ${e.message}`);
        conflicts++;
      }
    }
  }

  if (answers.platforms.includes('claude')) {
    const agentResult = await installAgents(answers.mode, { YES, force: ALL });
    conflicts += agentResult.conflicts;
  }

  const tied = chosen.filter((s) => s.requires);
  if (tied.length) {
    log.title('Heads up — these assume specific tooling');
    for (const s of tied) { log.warn(chalk.bold(s.name)); log.info(s.requires); }
  }

  log.title('Done');
  log.info(`${count} installation${count === 1 ? '' : 's'} across ${answers.platforms.length} agent(s).`);
  if (stale.pruned) log.info(`${stale.pruned} stale link${stale.pruned === 1 ? '' : 's'} pruned.`);
  if (conflicts) {
    log.warn(`${conflicts} conflict${conflicts === 1 ? '' : 's'} kept unchanged.`);
    process.exitCode = 1;
  }
  if (answers.mode === 'link') log.info('Symlinked — `git pull` in this repo updates every agent.');
  else if (EPHEMERAL) log.info('Copied. For symlinked installs that track git, clone the repo and run the installer from the clone.');
  if (answers.platforms.includes('tabnine')) log.info('Tabnine: run `tabnine skills list` to pick them up.');
  if (answers.platforms.includes('copilot')) log.info('Copilot: run `copilot skill list` to verify.');
  console.log();
}

// ----------------------------------------------------------------------- main
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export function parseArgs(args) {
  const commands = new Set(['install', 'list', 'doctor', 'uninstall', 'help']);
  const knownFlags = new Set(['--yes', '-y', '--copy', '--all', '--help', '-h']);
  const positionals = [];
  const seenFlags = new Set();
  const canonicalFlag = (arg) => arg === '-y' ? '--yes' : arg === '-h' ? '--help' : arg;
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (!knownFlags.has(arg)) throw new UsageError(`Unknown flag: ${arg}`);
      const canonical = canonicalFlag(arg);
      if (seenFlags.has(canonical)) throw new UsageError(`Duplicate flag: ${canonical}`);
      seenFlags.add(canonical);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) throw new UsageError(`Expected one command, received: ${positionals.join(', ')}`);
  const command = positionals[0] ?? 'install';
  if (!commands.has(command)) throw new UsageError(`Unknown command: ${command}`);

  const help = command === 'help' || args.includes('--help') || args.includes('-h');
  const yes = args.includes('--yes') || args.includes('-y');
  const copy = args.includes('--copy');
  const all = args.includes('--all');
  if (!help) {
    if (command === 'install') {
      if (copy && !yes) throw new UsageError('--copy requires --yes');
      if (all && !yes) throw new UsageError('--all requires --yes');
    } else if (command === 'uninstall') {
      if (copy || all) throw new UsageError(`${copy ? '--copy' : '--all'} is not valid with uninstall`);
    } else if (yes || copy || all) {
      const flag = yes ? '--yes' : copy ? '--copy' : '--all';
      throw new UsageError(`${flag} is not valid with ${command}`);
    }
  }
  return { command: help ? (command === 'help' ? 'help' : command) : command, yes, copy, all, help };
}

function printHelp() {
  console.log(`
  ${chalk.bold('install-skills')}                       interactive install (default)
  ${chalk.bold('install-skills --yes')} [--copy] [--all] install every applicable skill
  ${chalk.bold('install-skills list')}                  what is installed where, and how
  ${chalk.bold('install-skills doctor')}                find broken or stale symlinks
  ${chalk.bold('install-skills uninstall')} [-y]        remove this repo's owned skills

  Existing foreign links, foreign files, and edited copies are never replaced
  noninteractively. Interactive installs can back them up before replacement.
  install and uninstall remove links into this repo whose target is gone.
`);
}

async function main() {
  console.log(chalk.bold.magenta('\n  skills') + chalk.gray('  ·  github.com/MatanelGordon/skills'));
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const skills = await readSkills();
  if (!skills.length) { log.err('No skills found in ./skills'); process.exitCode = 1; return; }

  if (options.command === 'list') return cmdList(skills);
  if (options.command === 'doctor') return cmdDoctor();
  if (options.command === 'uninstall') return cmdUninstall(skills, options.yes);
  return cmdInstall(skills, options);
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof UsageError) {
      log.err(error.message);
      printHelp();
      process.exitCode = 2;
      return;
    }
    log.err(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
