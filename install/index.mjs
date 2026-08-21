#!/usr/bin/env node
/**
 * Skill installer — installs SKILL.md folders into every agent you have.
 *
 * The Agent Skills format (agentskills.io) is the same everywhere; only the
 * discovery directory differs. So this just links the same folder into each
 * platform's path — one source of truth, edits propagate, uninstall is clean.
 */
import { readdir, readFile, mkdir, symlink, rm, lstat, cp } from 'node:fs/promises';
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

/** Verified 2026-08: personal-scope skill directories per platform. */
const PLATFORMS = [
  { id: 'claude',  label: 'Claude Code',   dir: join(HOME, '.claude', 'skills'),            detect: join(HOME, '.claude') },
  { id: 'codex',   label: 'OpenAI Codex',  dir: join(HOME, '.codex', 'skills'),             detect: join(HOME, '.codex') },
  { id: 'copilot', label: 'GitHub Copilot',dir: join(HOME, '.copilot', 'skills'),           detect: join(HOME, '.copilot') },
  { id: 'tabnine', label: 'Tabnine',       dir: join(HOME, '.tabnine', 'agent', 'skills'),  detect: join(HOME, '.tabnine') },
  // Shared alias honoured by Copilot and Tabnine; harmless for the others.
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
      requires: /requires:\s*(.+)/.exec(fm)?.[1]?.trim() ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Symlink by default; copy when the filesystem refuses (Windows without dev mode). */
async function install(skill, targetDir, mode) {
  const dest = join(targetDir, skill.name);
  await mkdir(targetDir, { recursive: true });
  try { await lstat(dest); await rm(dest, { recursive: true, force: true }); } catch {}
  if (mode === 'copy') {
    await cp(skill.path, dest, { recursive: true });
    return 'copied';
  }
  try {
    await symlink(skill.path, dest, 'dir');
    return 'linked';
  } catch {
    await cp(skill.path, dest, { recursive: true });
    return 'copied (symlink unavailable)';
  }
}

async function main() {
  console.log(chalk.bold.magenta('\n  skills') + chalk.gray('  ·  github.com/MatanelGordon/skills'));
  console.log(chalk.gray('  Agent Skills that install into every agent you use.\n'));

  const skills = await readSkills();
  if (!skills.length) return log.err('No skills found in ./skills');

  const detected = PLATFORMS.filter((p) => existsSync(p.detect));
  log.title('Detected agents');
  for (const p of PLATFORMS) {
    existsSync(p.detect)
      ? log.ok(`${p.label} ${chalk.gray(p.dir.replace(HOME, '~'))}`)
      : log.skip(`${p.label} — not installed`);
  }
  if (!detected.length) {
    log.err('No supported agent found. Install one, or pass --all to force.');
    if (!process.argv.includes('--all')) process.exit(1);
  }

  // Non-interactive: --yes installs everything into every detected agent.
  const YES = process.argv.includes('--yes') || process.argv.includes('-y');
  const answers = YES
    ? { platforms: detected.map((p) => p.id), skills: skills.map((s) => s.name),
        mode: process.argv.includes('--copy') ? 'copy' : 'link' }
    : await prompts([
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
        title: s.requires ? `${s.name} ${chalk.yellow('(has requirements)')}` : s.name,
        value: s.name, description: s.summary, selected: true,
      })),
      min: 1, hint: '— space to toggle, enter to confirm',
    },
    {
      type: 'select', name: 'mode', message: 'How should they be installed?',
      choices: [
        { title: 'Symlink (recommended)', value: 'link', description: 'git pull updates every agent at once' },
        { title: 'Copy', value: 'copy', description: 'independent copies you can edit per agent' },
      ],
      initial: 0,
    },
  ], { onCancel: () => { console.log(chalk.gray('\n  cancelled\n')); process.exit(0); } });
  if (YES) log.info('--yes: installing all skills into all detected agents');

  if (!answers.platforms?.length || !answers.skills?.length) return;

  const chosen = skills.filter((s) => answers.skills.includes(s.name));
  let count = 0;
  for (const pid of answers.platforms) {
    const p = PLATFORMS.find((x) => x.id === pid);
    log.title(p.label);
    for (const s of chosen) {
      try {
        const how = await install(s, p.dir, answers.mode);
        log.ok(`${chalk.bold(s.name)} ${chalk.gray(how)}`);
        count++;
      } catch (e) {
        log.err(`${s.name} — ${e.message}`);
      }
    }
  }

  const tied = chosen.filter((s) => s.requires);
  if (tied.length) {
    log.title('Heads up — these assume specific tooling');
    for (const s of tied) { log.warn(chalk.bold(s.name)); log.info(s.requires); }
  }

  log.title('Done');
  log.info(`${count} installation${count === 1 ? '' : 's'} across ${answers.platforms.length} agent(s).`);
  if (answers.mode === 'link') log.info('Symlinked — `git pull` in this repo updates every agent.');
  if (answers.platforms.includes('tabnine')) log.info('Tabnine: run `tabnine skills list` to pick them up.');
  if (answers.platforms.includes('copilot')) log.info('Copilot: run `copilot skill list` to verify.');
  console.log();
}

main().catch((e) => { log.err(e.stack ?? String(e)); process.exit(1); });
