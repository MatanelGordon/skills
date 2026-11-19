#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PHASES,
  WORKFLOW_VERSION,
  auditHtml,
  buildAgentPacket,
  createWorkflow,
  formatAuditMarkdown,
  inspectPng,
  isPathContained,
  resolveWithin,
  transitionWorkflow,
} from './lib/core.mjs';
import { captureScreenshots, findBrowser } from './capture.mjs';
import { ensureSafeDirectory } from './lib/filesystem.mjs';

const DEFAULT_STATE = '.impeccable-lite/session.json';

const HELP = `Impeccable Lite — dependency-free local design workflow

Commands:
  init --brief <brief.json> [--root <dir>] [--state <path>]
  status [--root <dir>] [--state <path>] [--json true]
  advance --to <phase> [--note <text>] [--owned <path> ...] [--evidence <path> ...] [--review <path>]
  packet --role <direction|builder|reviewer> [--audit <report>] [--evidence <path> ...] [--out <path>]
  audit [--file <html>] [--out <report-base>]
  capture [--entry <html>] [--out <directory>] [--browser <path>]
  doctor [--json true]

All paths are relative to --root. No command browses, installs, downloads,
updates, emits telemetry, or invokes a model.\n`;

const parseOptions = (tokens) => {
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf('=');
    const key = token.slice(2, equals > 0 ? equals : undefined);
    const value = equals > 0 ? token.slice(equals + 1) : tokens[index + 1];
    if (!key || value === undefined || (equals < 0 && value.startsWith('--'))) {
      throw new Error(`Option --${key || '?'} requires a value.`);
    }
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(value);
    if (equals < 0) index += 1;
  }
  return Object.freeze({
    one: (key, fallback = '') => values.get(key)?.at(-1) ?? fallback,
    many: (key) => Object.freeze(values.get(key) || []),
  });
};

const rejectPromptControlCharacters = (value, label) => {
  if (/[\0\r\n]/.test(value)) throw new Error(`${label} contains unsupported control characters.`);
  return value;
};

const existingPath = async (root, requested) => {
  rejectPromptControlCharacters(requested, 'Path');
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const physical = await realpath(lexical.value);
  if (!isPathContained(root, physical)) throw new Error(`Path escapes the project root: ${requested}`);
  return physical;
};

const writablePath = async (root, requested) => {
  rejectPromptControlCharacters(requested, 'Output path');
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const physicalParent = await ensureSafeDirectory(root, relative(root, dirname(lexical.value)));
  return join(physicalParent, basename(lexical.value));
};

const syncDirectory = async (path) => {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'EISDIR', 'EPERM', 'ENOTSUP'].includes(error.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
};

const writeAtomic = async (path, content, { exclusive = false } = {}) => {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  let published = false;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if (exclusive) {
      await link(temporary, path);
      await unlink(temporary);
    } else {
      await rename(temporary, path);
    }
    published = true;
    await syncDirectory(dirname(path));
  } finally {
    await handle?.close().catch(() => {});
    if (!published) await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const hashFile = async (path) => sha256(await readFile(path));

const contextFrom = async (options) => {
  const root = await realpath(resolve(options.one('root', '.')));
  const stateName = options.one('state', DEFAULT_STATE);
  return Object.freeze({ root, stateName });
};

const withStateLock = async (context, action) => {
  const lockPath = await writablePath(context.root, `${context.stateName}.lock`);
  const recoveryPath = await writablePath(context.root, `${context.stateName}.lock.recovery`);
  const lockToken = `${process.pid} ${randomUUID()} ${new Date().toISOString()}\n`;
  const temporaryLock = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  let ownsLock = false;
  try {
    const temporaryHandle = await open(temporaryLock, 'wx', 0o600);
    try {
      await temporaryHandle.writeFile(lockToken, 'utf8');
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    for (let attempt = 0; attempt < 3 && !ownsLock; attempt += 1) {
      try {
        await link(temporaryLock, lockPath);
        ownsLock = true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let ownsRecovery = false;
        try {
          try {
            await link(temporaryLock, recoveryPath);
            ownsRecovery = true;
          } catch (recoveryError) {
            if (recoveryError.code === 'EEXIST') {
              throw new Error(`Session lock recovery is already in progress: ${relative(context.root, recoveryPath)}`);
            }
            throw recoveryError;
          }
          let observed;
          try {
            const observedHandle = await open(lockPath, 'r');
            try {
              const metadata = await observedHandle.stat();
              const content = await observedHandle.readFile('utf8');
              observed = Object.freeze({ content, dev: metadata.dev, ino: metadata.ino });
            } finally {
              await observedHandle.close();
            }
          } catch (readError) {
            if (readError.code === 'ENOENT') continue;
            throw readError;
          }
          const lockMatch = observed.content.match(/^(\d+) ([a-f0-9-]{36}) (\S+)\n$/i);
          if (!lockMatch) throw new Error(`Session is locked by another process: ${relative(context.root, lockPath)}`);
          const ownerPid = Number.parseInt(lockMatch[1], 10);
          let ownerAlive = Number.isInteger(ownerPid) && ownerPid > 0;
          if (ownerAlive) {
            try {
              process.kill(ownerPid, 0);
            } catch (ownerError) {
              ownerAlive = ownerError.code !== 'ESRCH';
            }
          }
          if (ownerAlive) {
            throw new Error(`Session is locked by another process: ${relative(context.root, lockPath)}`);
          }
          let current;
          try {
            const metadata = await lstat(lockPath);
            current = Object.freeze({ content: await readFile(lockPath, 'utf8'), dev: metadata.dev, ino: metadata.ino });
          } catch (currentError) {
            if (currentError.code === 'ENOENT') continue;
            throw currentError;
          }
          if (current.content !== observed.content || current.dev !== observed.dev || current.ino !== observed.ino) continue;
          await unlink(lockPath);
        } finally {
          if (ownsRecovery) {
            let recoveryToken = '';
            try {
              recoveryToken = await readFile(recoveryPath, 'utf8');
            } catch (recoveryReadError) {
              if (recoveryReadError.code !== 'ENOENT') throw recoveryReadError;
            }
            if (recoveryToken === lockToken) await unlink(recoveryPath).catch((unlinkError) => {
              if (unlinkError.code !== 'ENOENT') throw unlinkError;
            });
          }
        }
      }
    }
    if (!ownsLock) throw new Error(`Could not acquire session lock: ${relative(context.root, lockPath)}`);
    await syncDirectory(dirname(lockPath));
    return await action();
  } finally {
    await unlink(temporaryLock).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (ownsLock) {
      let current = '';
      try {
        current = await readFile(lockPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (current === lockToken) await unlink(lockPath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
};

const loadState = async (context) => {
  const statePath = await existingPath(context.root, context.stateName);
  const stored = await readJson(statePath);
  const legacyPhases = new Set(['brief', 'direction', 'build', 'audit', 'review', 'complete']);
  const state = stored?.version === 2 && legacyPhases.has(stored.phase) && Array.isArray(stored.history)
    ? Object.freeze({
      ...stored,
      version: WORKFLOW_VERSION,
      phase: stored.phase === 'review' ? 'audit' : stored.phase,
      history: stored.phase === 'review'
        ? Object.freeze([...stored.history, Object.freeze({
          at: new Date().toISOString(),
          from: 'review',
          to: 'audit',
          note: 'Migrated legacy review state to the v3 audit boundary.',
          evidence: Object.freeze([]),
        })])
        : stored.history,
    })
    : stored;
  if (state.version !== WORKFLOW_VERSION
    || !/^[a-f0-9-]{36}$/i.test(state.sessionId || '')
    || !PHASES.includes(state.phase)
    || !state.brief
    || !Array.isArray(state.history)) {
    throw new Error('Session state is malformed or unsupported.');
  }
  try {
    createWorkflow(state.brief, { sessionId: state.sessionId, now: state.history[0]?.at });
  } catch {
    throw new Error('Session brief is malformed or unsupported.');
  }
  return Object.freeze({ state, statePath });
};

const runInit = async (options) => {
  const context = await contextFrom(options);
  const briefName = options.one('brief');
  if (!briefName) throw new Error('init requires --brief <brief.json>.');
  const brief = await readJson(await existingPath(context.root, briefName));
  for (const [label, value] of Object.entries(brief)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === 'string') rejectPromptControlCharacters(item, `Brief field ${label}`);
    }
  }
  const state = createWorkflow(brief);
  const statePath = await withStateLock(context, async () => {
    const output = await writablePath(context.root, context.stateName);
    try {
      await writeAtomic(output, `${JSON.stringify(state, null, 2)}\n`, { exclusive: true });
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Session already exists: ${relative(context.root, output)}`);
      throw error;
    }
    return output;
  });
  process.stdout.write(`Initialized ${relative(context.root, statePath)} at phase brief.\n`);
};

const nextActions = Object.freeze({
  brief: 'Select a direction, then advance to direction.',
  direction: 'Implement the selected direction, then advance to build.',
  build: 'Run audit, then advance to audit.',
  audit: 'Use a fresh reviewer packet; revise via build or complete with current audit, capture, and ship evidence.',
  complete: 'Workflow is complete.',
});

const runStatus = async (options) => {
  const context = await contextFrom(options);
  const { state } = await loadState(context);
  if (options.one('json') === 'true') process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  else process.stdout.write(`Phase: ${state.phase}\nArtifact: ${state.brief.artifact}\nNext: ${nextActions[state.phase]}\n`);
};

const normalizeEvidence = async (context, requestedPaths) => Promise.all(requestedPaths.map(async (requested) => {
  const physical = await existingPath(context.root, requested);
  return Object.freeze({ physical, relative: relative(context.root, physical) });
}));

const prospectiveOwnedPath = async (context, requested) => {
  rejectPromptControlCharacters(requested, 'Owned path');
  const lexical = resolveWithin(context.root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const owned = relative(context.root, lexical.value);
  if (!owned) throw new Error('Owned path must name a file or directory below the project root.');

  let current = context.root;
  const segments = owned.split(sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return owned;
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`Owned path contains a symbolic link: ${relative(context.root, current)}`);
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new Error(`Owned path ancestor is not a directory: ${relative(context.root, current)}`);
    }
    const physical = await realpath(current);
    if (!isPathContained(context.root, physical)) throw new Error(`Owned path escapes the project root: ${requested}`);
  }
  return owned;
};

const normalizeOwnedPaths = async (context, requestedPaths) => Object.freeze([
  ...new Set(await Promise.all(requestedPaths.map((requested) => prospectiveOwnedPath(context, requested)))),
]);

const auditIdentity = (report) => JSON.stringify({
  ok: report?.ok,
  source: report?.source,
  summary: report?.summary,
  findings: report?.findings,
  artifactHash: report?.artifactHash,
  inputs: report?.inputs,
});

const auditPassed = async (item, expectedSource, context) => {
  if (extname(item.physical).toLowerCase() === '.json') {
    try {
      const report = await readJson(item.physical);
      if (report.ok !== true || report.source !== expectedSource) return false;
      const input = await existingPath(context.root, expectedSource);
      const recomputed = await buildAuditReport(context, input);
      return auditIdentity(report) === auditIdentity(recomputed);
    } catch {
      return false;
    }
  }
  return false;
};

const requirePassingAudit = async (evidence, expectedSource, context) => {
  for (const item of evidence) if (await auditPassed(item, expectedSource, context)) return item;
  throw new Error(`This transition requires passing audit evidence JSON for \`${expectedSource}\`.`);
};

const requireCaptures = async (evidence, expectedEntry, context) => {
  const byName = new Map(evidence.map((item) => [basename(item.relative).toLowerCase(), item]));
  const desktop = byName.get('desktop.png');
  const mobile = byName.get('mobile.png');
  const manifest = byName.get('capture.json');
  if (!desktop || !mobile || !manifest) {
    throw new Error('Review requires one valid capture generation: `capture.json`, `desktop.png`, and `mobile.png`.');
  }
  let report;
  try {
    report = await readJson(manifest.physical);
  } catch {
    throw new Error('Capture manifest is not valid JSON.');
  }
  const generationDirectory = dirname(manifest.physical);
  const captureByName = new Map(
    (Array.isArray(report.captures) ? report.captures : []).map((capture) => [capture?.name, capture]),
  );
  const expected = Object.freeze({
    desktop: Object.freeze({ item: desktop, width: 1440, height: 1000 }),
    mobile: Object.freeze({ item: mobile, width: 390, height: 844 }),
  });
  const validCaptures = await Promise.all(Object.entries(expected).map(async ([name, expectedCapture]) => {
    const { item, width, height } = expectedCapture;
    const record = captureByName.get(name);
    if (!record
      || record.width !== width
      || record.height !== height
      || record.cssWidth !== width
      || record.cssHeight !== height
      || record.overflow !== false
      || !Array.isArray(record.blockedRequests)
      || record.blockedRequests.length !== 0
      || !/^[a-f0-9]{64}$/i.test(record.sha256 || '')) return false;
    let recordedPath;
    try {
      recordedPath = await realpath(record.path);
    } catch {
      return false;
    }
    if (recordedPath !== item.physical || dirname(recordedPath) !== generationDirectory) return false;
    const bytes = await readFile(item.physical);
    const png = inspectPng(bytes);
    return png.ok && png.value.width === width && png.value.height === height && sha256(bytes) === record.sha256;
  }));
  const resources = Array.isArray(report.resources) ? report.resources : [];
  const resourcePaths = new Set(resources.map((resource) => resource?.path));
  const validResources = resources.length > 0
    && resourcePaths.size === resources.length
    && (await Promise.all(resources.map(async (resource) => {
      if (!resource || typeof resource.path !== 'string' || !/^[a-f0-9]{64}$/i.test(resource.sha256 || '')) return false;
      try {
        return await hashFile(await existingPath(context.root, resource.path)) === resource.sha256;
      } catch {
        return false;
      }
    }))).every(Boolean);
  const artifactResource = resources.find((resource) => resource.path === expectedEntry);
  const validManifest = report.ok === true
    && report.entry === expectedEntry
    && artifactResource?.sha256 === report.artifactHash
    && report.artifactHash === await hashFile(await existingPath(context.root, expectedEntry))
    && report.generation === basename(generationDirectory)
    && validResources
    && validCaptures.every(Boolean);
  let recordedReportPath;
  try {
    recordedReportPath = await realpath(report.reportPath || '');
  } catch {
    recordedReportPath = '';
  }
  if (!validManifest || recordedReportPath !== manifest.physical) {
    throw new Error(`Capture evidence does not belong to \`${expectedEntry}\` or one clean generation.`);
  }
  return Object.freeze({ manifest, generation: report.generation });
};

const requireShipReview = async (context, requested, sessionId, evidenceGeneration) => {
  if (!requested) throw new Error('Completion requires --review <strict-review-output>.');
  const item = (await normalizeEvidence(context, [requested]))[0];
  const metadata = await stat(item.physical);
  if (metadata.size > 65_536) throw new Error('Reviewer output exceeds 64 KiB.');
  const lines = (await readFile(item.physical, 'utf8')).trimEnd().split(/\r?\n/);
  const valid = lines.length === 5
    && lines[0] === 'disposition: ship'
    && lines[1] === 'material_findings: none'
    && /^keep:\s+\S/.test(lines[2])
    && lines[3] === `session_id: ${sessionId}`
    && lines[4] === `evidence_generation: ${evidenceGeneration}`;
  if (!valid) throw new Error('Completion requires an exact `disposition: ship` reviewer return with no material findings.');
  return item;
};

const runAdvance = async (options) => {
  const context = await contextFrom(options);
  const completed = await withStateLock(context, async () => {
    const { state, statePath } = await loadState(context);
    const target = options.one('to').toLowerCase();
    const ownedFiles = await normalizeOwnedPaths(context, options.many('owned'));
    const evidenceItems = [...await normalizeEvidence(context, options.many('evidence'))];
    const needsArtifact = (state.phase === 'build' && target === 'audit')
      || (state.phase === 'audit' && target === 'complete');
    let expectedEntry = state.brief.artifact;
    if (needsArtifact) {
      const artifact = await existingPath(context.root, state.brief.artifact);
      expectedEntry = relative(context.root, artifact);
    }
    if (state.phase === 'build' && target === 'audit') await requirePassingAudit(evidenceItems, expectedEntry, context);
    if (state.phase === 'audit' && target === 'complete') {
      await requirePassingAudit(evidenceItems, expectedEntry, context);
      const capture = await requireCaptures(evidenceItems, expectedEntry, context);
      evidenceItems.push(await requireShipReview(
        context,
        options.one('review'),
        state.sessionId,
        capture.generation,
      ));
    }
    const userNote = options.one('note');
    const note = state.phase === 'audit' && target === 'complete'
      ? `Reviewer disposition: ship.${userNote ? ` ${userNote}` : ''}`
      : userNote;
    const transition = transitionWorkflow(state, target, {
      note,
      evidence: evidenceItems.map((item) => item.relative),
      ownedFiles,
    });
    if (!transition.ok) throw new Error(transition.error);
    await writeAtomic(statePath, `${JSON.stringify(transition.value, null, 2)}\n`);
    return Object.freeze({ from: state.phase, to: transition.value.phase });
  });
  process.stdout.write(`Advanced ${completed.from} → ${completed.to}.\n`);
};

const runPacket = async (options) => {
  const context = await contextFrom(options);
  const { state } = await loadState(context);
  const role = options.one('role').toLowerCase();
  const evidenceItems = await normalizeEvidence(context, options.many('evidence'));
  const auditName = options.one('audit');
  const auditItems = auditName ? await normalizeEvidence(context, [auditName]) : [];
  let evidenceGeneration = '';
  if (role === 'builder') {
    const direction = [...state.history].reverse().find((entry) => entry.to === 'direction');
    if (Array.isArray(direction?.ownedFiles)) await normalizeOwnedPaths(context, direction.ownedFiles);
  }
  if (role === 'reviewer') {
    if (auditItems.length === 0) throw new Error('Reviewer packet requires --audit <passing-audit-path>.');
    const artifact = await existingPath(context.root, state.brief.artifact);
    const expectedEntry = relative(context.root, artifact);
    await requirePassingAudit(auditItems, expectedEntry, context);
    const capture = await requireCaptures(evidenceItems, expectedEntry, context);
    evidenceGeneration = capture.generation;
  }
  const packet = buildAgentPacket(state, role, {
    root: context.root,
    evidence: evidenceItems.map((item) => item.relative),
    auditReport: auditItems[0]?.relative || '',
    evidenceGeneration,
  });
  if (!packet.ok) throw new Error(packet.error);
  const outputName = options.one('out');
  if (outputName) {
    const output = await writablePath(context.root, outputName);
    await writeAtomic(output, packet.value);
    process.stdout.write(`Wrote ${relative(context.root, output)}.\n`);
  } else {
    process.stdout.write(packet.value);
  }
};

const attributeValue = (attributes, name) => {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:(["'])(.*?)\\1|([^\\s"'=<>` + '`' + `]+))`, 'i');
  const match = attributes.match(pattern);
  return (match?.[2] || match?.[3] || '').trim();
};

const localAssetReferences = (html) => {
  const found = new Map();
  for (const match of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const kind = match[1].toLowerCase();
    const attributes = match[2];
    if (kind === 'link' && attributeValue(attributes, 'rel').toLowerCase() !== 'stylesheet') continue;
    const raw = attributeValue(attributes, kind === 'script' ? 'src' : 'href');
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    let decoded;
    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      throw new Error(`Malformed local asset reference: ${raw}`);
    }
    const item = Object.freeze({
      kind,
      path: decoded.replace(/^\/+/, ''),
      rootRelative: decoded.startsWith('/'),
    });
    found.set(`${item.rootRelative ? 'root' : 'local'}:${item.path}`, item);
  }
  if (found.size > 32) throw new Error('Audit refuses more than 32 directly referenced local script/style assets.');
  return [...found.values()];
};

const mergeAuditReports = (primary, assetFindings) => {
  const findings = Object.freeze([...primary.findings, ...assetFindings]);
  const summary = findings.reduce((counts, item) => ({
    ...counts,
    [item.severity]: counts[item.severity] + 1,
  }), { blocking: 0, major: 0, minor: 0 });
  return Object.freeze({
    ...primary,
    ok: summary.blocking === 0 && summary.major === 0,
    summary: Object.freeze(summary),
    findings,
  });
};

const buildAuditReport = async (context, input) => {
  const htmlBytes = await readFile(input);
  const html = htmlBytes.toString('utf8');
  const source = relative(context.root, input);
  const assetFindings = [];
  const styleSources = [];
  const inputs = [{ path: source, sha256: sha256(htmlBytes) }];
  const inputDirectory = relative(context.root, dirname(input));
  for (const reference of localAssetReferences(html)) {
    const requested = reference.rootRelative ? reference.path : join(inputDirectory, reference.path);
    const asset = await existingPath(context.root, requested);
    const metadata = await stat(asset);
    if (metadata.size > 1_048_576) throw new Error(`Audit asset exceeds 1 MiB: ${relative(context.root, asset)}`);
    const assetBytes = await readFile(asset);
    const assetText = assetBytes.toString('utf8');
    inputs.push({ path: relative(context.root, asset), sha256: sha256(assetBytes) });
    if (reference.kind === 'link') styleSources.push(assetText);
    const auditedAssetText = reference.kind === 'link'
      ? assetText.replace(/\/\*[\s\S]*?\*\//g, ' ')
      : assetText;
    const assetReport = auditHtml(auditedAssetText, { source: relative(context.root, asset) });
    assetFindings.push(...assetReport.findings.filter((item) => item.id.startsWith('offline-')));
  }
  const merged = mergeAuditReports(
    auditHtml(html, { source, styleText: styleSources.join('\n') }),
    assetFindings,
  );
  return Object.freeze({
    ...merged,
    artifactHash: sha256(htmlBytes),
    inputs: Object.freeze(inputs.map(Object.freeze)),
  });
};

const runAudit = async (options) => {
  const context = await contextFrom(options);
  let fileName = options.one('file');
  if (!fileName) {
    const { state } = await loadState(context);
    fileName = state.brief.artifact;
  }
  const input = await existingPath(context.root, fileName);
  const report = await buildAuditReport(context, input);
  const outputBase = options.one('out', '.impeccable-lite/reports/audit');
  const jsonPath = await writablePath(context.root, `${outputBase}.json`);
  const markdownPath = await writablePath(context.root, `${outputBase}.md`);
  await writeAtomic(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(markdownPath, formatAuditMarkdown(report));
  process.stdout.write(`${report.ok ? 'PASS' : 'NEEDS WORK'} — ${report.summary.blocking} blocking, ${report.summary.major} major, ${report.summary.minor} minor.\n`);
  if (!report.ok) process.exitCode = 1;
};

const runCapture = async (options) => {
  const context = await contextFrom(options);
  let entry = options.one('entry');
  if (!entry) {
    const { state } = await loadState(context);
    entry = state.brief.artifact;
  }
  const report = await captureScreenshots({
    root: context.root,
    entry,
    outDir: options.one('out', '.impeccable-lite/evidence'),
    browserPath: options.one('browser'),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
};

const runDoctor = async (options) => {
  const report = Object.freeze({
    node: process.version,
    compatible: Number(process.versions.node.split('.')[0]) >= 18,
    browser: await findBrowser(),
    dependencies: 'Node.js built-ins only',
    network: 'never required',
  });
  if (options.one('json') === 'true') process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Node ${report.node}: ${report.compatible ? 'ready' : 'unsupported'}\nBrowser: ${report.browser || 'not found (static audit still works)'}\nDependencies: ${report.dependencies}\nNetwork: ${report.network}\n`);
  if (!report.compatible) process.exitCode = 1;
};

export const main = async (argv) => {
  const [command = 'help', ...tokens] = argv;
  if (['help', '--help', '-h'].includes(command)) {
    process.stdout.write(HELP);
    return;
  }
  const options = parseOptions(tokens);
  const commands = Object.freeze({
    init: runInit,
    status: runStatus,
    advance: runAdvance,
    packet: runPacket,
    audit: runAudit,
    capture: runCapture,
    doctor: runDoctor,
  });
  if (!commands[command]) throw new Error(`Unknown command: ${command}.\n\n${HELP}`);
  await commands[command](options);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`impeccable-lite: ${error.message}\n`);
    process.exitCode = 64;
  });
}
