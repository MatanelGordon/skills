#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'calculator-cli');
const npmExecPath = process.env.npm_execpath;
const npmCli = npmExecPath && basename(npmExecPath) === 'npx-cli.js'
  ? join(dirname(npmExecPath), 'npm-cli.js')
  : npmExecPath;

const [nodeMajor, nodeMinor, nodePatch] = process.versions.node.split('.').map(Number);
const supportedNode = nodeMajor > 22
  || (nodeMajor === 22 && (nodeMinor > 22 || (nodeMinor === 22 && nodePatch >= 2)));
if (!supportedNode) {
  throw new Error(`Calculator mutation smoke requires Node 22.22.2+, got ${process.version}.`);
}
if (!npmCli) {
  throw new Error('Run through npm so npm_execpath is available for the isolated fixture install.');
}

const run = (command, args, cwd, extraEnv = {}) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...extraEnv },
});

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function hashTree(root) {
  const hash = createHash('sha256');
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        hash.update(path.slice(root.length));
        hash.update(await readFile(path));
      }
    }
  }
  await walk(root);
  return hash.digest('hex');
}

function reportMutants(report) {
  return Object.values(report.files ?? {}).flatMap((file) => file.mutants ?? []);
}

async function stageTest(project, sourceName, targetName) {
  const text = await readFile(join(project, 'stages', sourceName), 'utf8');
  await writeFile(join(project, 'test', targetName), text);
}

const scratch = await mkdtemp(join(tmpdir(), 'skills-calculator-mutation-'));
const project = join(scratch, 'calculator-cli');

try {
  await cp(fixture, project, { recursive: true });
  await mkdir(join(project, '.mutation-tmp'), { recursive: true });

  run(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], project);
  const vitest = join(project, 'node_modules', 'vitest', 'vitest.mjs');
  const stryker = join(project, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');

  const originalProductionHash = await hashTree(join(project, 'src'));
  run(process.execPath, [vitest, 'run'], project);
  assert.equal(run(process.execPath, ['src/cli.js', 'divide', '8', '2'], project).trim(), '4');

  // Stage 1: post-implementation hardening adds a distinct public edge case.
  await stageTest(project, 'test-hardening.fixture.js', 'test-hardening.test.js');
  run(process.execPath, [vitest, 'run'], project);
  assert.equal(await hashTree(join(project, 'src')), originalProductionHash, 'test hardening changed production code');

  // Freeze green, then discover a different exact-boundary survivor.
  const discoveryReportPath = join(project, '.mutation-tmp', 'discovery.json');
  run(process.execPath, [stryker, 'run', 'stryker.config.mjs'], project, {
    MUTATION_REPORT: '.mutation-tmp/discovery.json',
  });
  const discoveryReportBytes = await readFile(discoveryReportPath);
  const discoveryReportHash = hashBytes(discoveryReportBytes);
  const firstReport = JSON.parse(discoveryReportBytes.toString('utf8'));
  const firstMutants = reportMutants(firstReport);
  const boundarySurvivor = firstMutants.find((mutant) => (
    mutant.status === 'Survived' && mutant.replacement.includes('<') && !mutant.replacement.includes('<=')
  ));
  assert.ok(
    boundarySurvivor,
    `expected the <= to < display-boundary mutant to survive before remediation: ${JSON.stringify(firstMutants)}`,
  );
  assert.equal(await hashTree(join(project, 'src')), originalProductionHash, 'first mutation run changed production code');

  // Stage 2: test-only remediation must kill that same boundary mutation.
  await stageTest(project, 'mutation-remediation.fixture.js', 'mutation-remediation.test.js');
  run(process.execPath, [vitest, 'run'], project);
  const verificationReportPath = join(project, '.mutation-tmp', 'verification.json');
  run(process.execPath, [stryker, 'run', 'stryker.config.mjs'], project, {
    MUTATION_REPORT: '.mutation-tmp/verification.json',
  });
  const verificationReportBytes = await readFile(verificationReportPath);
  const verificationReportHash = hashBytes(verificationReportBytes);
  const secondReport = JSON.parse(verificationReportBytes.toString('utf8'));
  const remediated = reportMutants(secondReport).find((mutant) => (
    mutant.mutatorName === boundarySurvivor.mutatorName
    && mutant.replacement === boundarySurvivor.replacement
    && JSON.stringify(mutant.location) === JSON.stringify(boundarySurvivor.location)
  ));
  assert.ok(remediated, 'the exact display-boundary mutant was not present in the verification run');
  assert.equal(remediated.status, 'Killed', 'the exact display-boundary mutant was not killed');
  assert.equal(hashBytes(await readFile(discoveryReportPath)), discoveryReportHash, 'discovery evidence was overwritten');
  assert.equal(await hashTree(join(project, 'src')), originalProductionHash, 'mutation remediation changed production code');

  process.stdout.write(JSON.stringify({
    fixture: 'calculator-cli',
    node: process.version,
    hardeningCase: 'division-by-zero',
    remediatedMutant: {
      id: remediated.id,
      mutatorName: remediated.mutatorName,
      replacement: remediated.replacement,
      status: remediated.status,
    },
    reports: {
      discoverySha256: discoveryReportHash,
      verificationSha256: verificationReportHash,
    },
    productionHash: originalProductionHash,
    result: 'passed',
  }, null, 2));
  process.stdout.write('\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
