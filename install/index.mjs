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
 *   install-skills --help
 */
import { readdir, readFile, mkdir, symlink, rm, lstat, readlink, cp, chmod, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import prompts from 'prompts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SKILLS_DIR = join(ROOT, 'skills');
const HOME = homedir();

// Running out of the npx cache: symlinks would dangle when npm prunes it.
const EPHEMERAL = ROOT.includes(`_npx`) || ROOT.includes(join('.npm', '_cacache'));

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

const platformOk = (skill) => !skill.platform || skill.platform === process.platform;

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

async function installOne(skill, targetDir, mode) {
  const dest = join(targetDir, skill.name);
  await mkdir(targetDir, { recursive: true });
  try { await lstat(dest); await rm(dest, { recursive: true, force: true }); } catch {}
  if (mode !== 'copy') {
    try { await symlink(skill.path, dest, 'dir'); return 'linked'; } catch {}
  }
  await cp(skill.path, dest, { recursive: true });
  return mode === 'copy' ? 'copied' : 'copied (symlink unavailable)';
}

/** Classify what sits at <platform>/<name>: absent | linked | stale-link | copy. */
async function classify(dir, name) {
  const dest = join(dir, name);
  let st;
  try { st = await lstat(dest); } catch { return { state: 'absent' }; }
  if (st.isSymbolicLink()) {
    const target = await readlink(dest).catch(() => '?');
    if (!existsSync(dest)) return { state: 'broken-link', target };            // dangling
    const ours = resolve(target) === resolve(join(SKILLS_DIR, name));
    return { state: ours ? 'linked' : 'foreign-link', target };
  }
  return { state: 'copy' };
}

// ---------------------------------------------------------------- subcommands

async function cmdList(skills) {
  for (const p of PLATFORMS) {
    if (!existsSync(p.detect)) continue;
    log.title(`${p.label}  ${chalk.gray(p.dir.replace(HOME, '~'))}`);
    for (const s of skills) {
      const c = await classify(p.dir, s.name);
      if (c.state === 'absent') log.skip(`${s.name} — not installed`);
      else if (c.state === 'linked') log.ok(`${s.name} ${chalk.gray('→ this repo')}`);
      else if (c.state === 'copy') log.ok(`${s.name} ${chalk.gray('(copy — will not follow git pull)')}`);
      else if (c.state === 'broken-link') log.err(`${s.name} — BROKEN link → ${c.target}`);
      else log.warn(`${s.name} — links elsewhere: ${c.target}`);
    }
  }
  console.log();
}

async function cmdDoctor() {
  let problems = 0;
  for (const p of PLATFORMS) {
    if (!existsSync(p.dir)) continue;
    for (const e of await readdir(p.dir, { withFileTypes: true }).catch(() => [])) {
      const full = join(p.dir, e.name);
      const st = await lstat(full).catch(() => null);
      if (!st?.isSymbolicLink()) continue;
      if (!existsSync(full)) {
        const target = await readlink(full).catch(() => '?');
        log.err(`${p.label}: ${e.name} → ${target} ${chalk.red('(dangling)')}`);
        log.info(`fix: rm '${full.replace(HOME, '~')}' then re-run the installer`);
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
      const c = await classify(p.dir, s.name);
      if (c.state === 'absent' || c.state === 'foreign-link') continue;
      if (c.state === 'copy' && !YES) {
        const a = await prompts({ type: 'confirm', name: 'y', initial: false,
          message: `${s.name} at ${p.label} is a copy (may have local edits) — remove?` });
        if (!a.y) { log.skip(`${s.name} — kept`); continue; }
      }
      await rm(join(p.dir, s.name), { recursive: true, force: true });
      log.ok(`${s.name} removed`);
      removed++;
    }
  }
  log.title('Done'); log.info(`${removed} removed.`); console.log();
}

async function installSweatDreamsCli(YES) {
  if (process.platform !== 'darwin') return;
  const src = join(SKILLS_DIR, 'sweat-dreams', 'scripts', 'sweat-dreams');
  if (!existsSync(src)) return;
  const destDir = join(HOME, '.local', 'bin');
  const dest = join(destDir, 'sweat-dreams');
  let doIt = YES;
  if (!YES) {
    const a = await prompts({ type: 'confirm', name: 'y', initial: true,
      message: `sweat-dreams needs its CLI on PATH — install to ${dest.replace(HOME, '~')}?` });
    doIt = !!a.y;
  }
  if (!doIt) { log.skip('sweat-dreams CLI not installed — the skill references scripts/sweat-dreams by path'); return; }
  await mkdir(destDir, { recursive: true });
  await copyFile(src, dest);
  await chmod(dest, 0o755);
  log.ok(`sweat-dreams CLI → ${dest.replace(HOME, '~')}`);
  if (!process.env.PATH?.split(':').includes(destDir)) log.warn(`~/.local/bin is not on your PATH — add it to your shell profile`);
}

async function cmdInstall(skills, YES) {
  const detected = PLATFORMS.filter((p) => existsSync(p.detect));
  log.title('Detected agents');
  for (const p of PLATFORMS) {
    existsSync(p.detect)
      ? log.ok(`${p.label} ${chalk.gray(p.dir.replace(HOME, '~'))}`)
      : log.skip(`${p.label} — not installed`);
  }
  if (!detected.length && !process.argv.includes('--all')) {
    log.err('No supported agent found. Install one, or pass --all to force.');
    process.exit(1);
  }
  if (EPHEMERAL) log.warn('Running from a temporary npx cache — installing copies (symlinks would break when the cache is pruned).');

  let answers;
  if (YES) {
    answers = {
      platforms: detected.map((p) => p.id),
      skills: skills.filter(platformOk).map((s) => s.name),
      mode: EPHEMERAL || process.argv.includes('--copy') ? 'copy' : 'link',
    };
    log.info('--yes: all applicable skills into all detected agents');
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

  const { selection, added } = withDependencies(answers.skills, skills);
  for (const name of added) log.warn(`${name} added — required by something you selected`);

  const chosen = skills.filter((s) => selection.includes(s.name));
  let count = 0;
  for (const pid of answers.platforms) {
    const p = PLATFORMS.find((x) => x.id === pid);
    log.title(p.label);
    for (const s of chosen) {
      try {
        const how = await installOne(s, p.dir, answers.mode);
        log.ok(`${chalk.bold(s.name)} ${chalk.gray(how)}`);
        count++;
      } catch (e) { log.err(`${s.name} — ${e.message}`); }
    }
  }

  if (chosen.some((s) => s.name === 'sweat-dreams')) await installSweatDreamsCli(YES);

  const tied = chosen.filter((s) => s.requires);
  if (tied.length) {
    log.title('Heads up — these assume specific tooling');
    for (const s of tied) { log.warn(chalk.bold(s.name)); log.info(s.requires); }
  }

  log.title('Done');
  log.info(`${count} installation${count === 1 ? '' : 's'} across ${answers.platforms.length} agent(s).`);
  if (answers.mode === 'link') log.info('Symlinked — `git pull` in this repo updates every agent.');
  else if (EPHEMERAL) log.info('Copied. For symlinked installs that track git, clone the repo and run the installer from the clone.');
  if (answers.platforms.includes('tabnine')) log.info('Tabnine: run `tabnine skills list` to pick them up.');
  if (answers.platforms.includes('copilot')) log.info('Copilot: run `copilot skill list` to verify.');
  console.log();
}

// ----------------------------------------------------------------------- main
async function main() {
  console.log(chalk.bold.magenta('\n  skills') + chalk.gray('  ·  github.com/MatanelGordon/skills'));
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('-')) ?? 'install';
  const YES = args.includes('--yes') || args.includes('-y');

  if (args.includes('--help') || args.includes('-h') || cmd === 'help') {
    console.log(`
  ${chalk.bold('install-skills')}                interactive install (default)
  ${chalk.bold('install-skills --yes')} [--copy] everything, into every detected agent
  ${chalk.bold('install-skills list')}           what is installed where, and how
  ${chalk.bold('install-skills doctor')}         find broken or stale symlinks
  ${chalk.bold('install-skills uninstall')} [-y] remove this repo's skills from your agents
`);
    return;
  }

  const skills = await readSkills();
  if (!skills.length) { log.err('No skills found in ./skills'); process.exit(1); }

  if (cmd === 'list') return cmdList(skills);
  if (cmd === 'doctor') return cmdDoctor();
  if (cmd === 'uninstall') return cmdUninstall(skills, YES);
  return cmdInstall(skills, YES);
}

main().catch((e) => { log.err(e.stack ?? String(e)); process.exit(1); });
