/**
 * The eval format standard (EVALS.md) as pure functions.
 *
 * One evals.json has to load, as committed, in three runners that disagree on
 * field names and fixture paths. `normalizeEvalDocument` rewrites a parsed
 * document into the one shape all three accept and lists the fixture files that
 * have to be written, copied or moved for it. `checkEvalDocument` says what is
 * still wrong. Neither touches the disk: the caller passes `lookup(path)`,
 * which describes a path relative to the skill folder as
 * `{ kind: 'file' | 'dir' | 'other' | 'missing', bytes, isText }`.
 */

export const CASE_KEY_ORDER = Object.freeze([
  'id', 'prompt', 'expected_output', 'files', 'assertions', 'expectations', 'expected_skill', 'checks',
]);
export const FIXTURE_ROOT = 'evals/files';
export const MIN_CASES = 6;
export const MAX_FIXTURE_BYTES = 64 * 1024;

const SHARED_FOLDER = 'shared';
const NAME_KEYS = Object.freeze(['skill_name', 'agent_name']);
// A `files` string longer than a file name can be, or spanning lines, is fixture text someone inlined.
const MAX_PATH_LENGTH = 255;
const FOLDER_SAFE_ID = /^[A-Za-z0-9._-]+$/;
const MISSING = Object.freeze({ kind: 'missing' });
const nothingExists = () => MISSING;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const sameList = (left, right) => (
  isStringList(left) && isStringList(right) && left.length === right.length && left.every((item, index) => item === right[index])
);
const isInlineText = (entry) => entry.includes('\n') || entry.length > MAX_PATH_LENGTH;
const isSafeRelativePath = (path) => (
  path.length > 0
  && !path.startsWith('/')
  && !path.includes('\\')
  && !/^[A-Za-z]:/.test(path)
  && !path.split('/').includes('..')
);
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);
const caseLabel = (evaluation, index) => (
  isObject(evaluation) && evaluation.id !== undefined && evaluation.id !== null
    ? `eval ${evaluation.id}`
    : `eval at position ${index + 1}`
);
const isNegativeCase = (evaluation) => (
  isObject(evaluation) && Object.hasOwn(evaluation, 'expected_skill') && evaluation.expected_skill === null
);

export const serializeEvalDocument = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

const orderKeys = (source, firstKeys) => {
  const ordered = {};
  for (const key of firstKeys) if (Object.hasOwn(source, key)) ordered[key] = source[key];
  for (const key of Object.keys(source)) if (!Object.hasOwn(ordered, key)) ordered[key] = source[key];
  return ordered;
};

/** What one `files` entry needs: kept as a path, or a fixture written, moved or copied into evals/files. */
function planFileEntry(entry, entryIndex, lookup) {
  const where = `files[${entryIndex}]`;
  if (isObject(entry)) {
    const usable = typeof entry.path === 'string' && typeof entry.content === 'string' && isSafeRelativePath(entry.path);
    return usable
      ? { step: 'write', rest: entry.path, source: `text:${entry.content}`, content: entry.content }
      : { step: 'problem', message: `${where} must be { path, content } with a relative path inside the case folder` };
  }
  if (typeof entry !== 'string') return { step: 'problem', message: `${where} must be a path string` };
  if (isInlineText(entry)) {
    return { step: 'write', rest: `fixture-${entryIndex + 1}.txt`, source: `text:${entry}`, content: entry };
  }
  if (!isSafeRelativePath(entry)) {
    return { step: 'problem', message: `${where} ${JSON.stringify(entry)} must be a relative path with no ".." or backslash` };
  }
  if (entry.startsWith(`${FIXTURE_ROOT}/`)) return { step: 'keep', path: entry };

  const parts = entry.split('/');
  const existsFromSkill = lookup(entry).kind === 'file';
  if (parts[0] === 'evals' && existsFromSkill) {
    return { step: 'move', from: entry, source: entry, rest: parts.slice(2).join('/') || baseName(entry) };
  }
  const fromEvals = `evals/${entry}`;
  if (lookup(fromEvals).kind === 'file') {
    return parts[0] === 'files'
      ? { step: 'keep', path: fromEvals }
      : { step: 'move', from: fromEvals, source: fromEvals, rest: parts.slice(1).join('/') || baseName(entry) };
  }
  if (existsFromSkill) return { step: 'copy', from: entry, source: entry, rest: baseName(entry) };
  return { step: 'problem', message: `${where} ${JSON.stringify(entry)} does not name a file in the skill` };
}

function planCaseFiles(evaluation, lookup, kind) {
  const raw = evaluation.files;
  if (raw === undefined || raw === null) return { entries: [], plans: [] };
  const entries = typeof raw === 'string' ? [raw] : raw;
  if (!Array.isArray(entries)) return { entries: raw, plans: null, message: 'files must be a list of paths' };
  if (kind === 'agent' && entries.length > 0) {
    return { entries: raw, plans: null, message: 'agent evals cannot carry fixture files; files must be []' };
  }
  const plans = entries.map((entry, index) => planFileEntry(entry, index, lookup));
  const needsFolder = plans.some((plan) => plan.step !== 'keep' && plan.step !== 'problem');
  if (needsFolder && !FOLDER_SAFE_ID.test(String(evaluation.id))) {
    return { entries: raw, plans: null, message: 'id cannot name a fixture folder; give the case an integer id first' };
  }
  return { entries, plans };
}

/** Sources that more than one case moves: those go to the shared folder instead of a case folder. */
function sharedMoveSources(casePlans) {
  const users = new Map();
  casePlans.forEach((casePlan, caseIndex) => {
    for (const plan of casePlan?.plans ?? []) {
      if (plan.step !== 'move') continue;
      users.set(plan.from, (users.get(plan.from) ?? new Set()).add(caseIndex));
    }
  });
  return new Set([...users].filter(([, cases]) => cases.size > 1).map(([source]) => source));
}

const targetOf = (plan, evaluation, shared) => {
  const folder = plan.step === 'move' && shared.has(plan.from) ? SHARED_FOLDER : String(evaluation.id);
  return `${FIXTURE_ROOT}/${folder}/${plan.rest}`;
};

function syncAssertions(evaluation, label, problems) {
  const hasAssertions = evaluation.assertions !== undefined;
  const hasExpectations = evaluation.expectations !== undefined;
  if (hasAssertions && !hasExpectations && isStringList(evaluation.assertions)) {
    return { ...evaluation, expectations: [...evaluation.assertions] };
  }
  if (hasExpectations && !hasAssertions && isStringList(evaluation.expectations)) {
    return { ...evaluation, assertions: [...evaluation.expectations] };
  }
  if (hasAssertions && hasExpectations && !sameList(evaluation.assertions, evaluation.expectations)) {
    problems.push(`${label}: assertions and expectations differ; edit assertions, then make expectations the same list`);
  }
  return evaluation;
}

/**
 * Rewrite a parsed evals document into the standard shape.
 * Returns a new document, the fixture actions it depends on, and what could not be repaired.
 * Unrepairable parts are left exactly as written so nothing is lost.
 */
export function normalizeEvalDocument(doc, lookup = nothingExists, { kind = 'skill' } = {}) {
  if (!isObject(doc) || !Array.isArray(doc.evals)) {
    return { doc, actions: [], problems: ['evals must be a list of cases'] };
  }

  const problems = [];
  const casePlans = doc.evals.map((evaluation, index) => {
    if (!isObject(evaluation)) {
      problems.push(`${caseLabel(evaluation, index)} is not an object`);
      return null;
    }
    const plan = planCaseFiles(evaluation, lookup, kind);
    if (plan.message) problems.push(`${caseLabel(evaluation, index)}: ${plan.message}`);
    for (const filePlan of plan.plans ?? []) {
      if (filePlan.step === 'problem') problems.push(`${caseLabel(evaluation, index)}: ${filePlan.message}`);
    }
    return plan;
  });

  const shared = sharedMoveSources(casePlans);
  const sourcesByTarget = new Map();
  casePlans.forEach((casePlan, caseIndex) => {
    for (const plan of casePlan?.plans ?? []) {
      if (plan.step === 'keep' || plan.step === 'problem') continue;
      const target = targetOf(plan, doc.evals[caseIndex], shared);
      sourcesByTarget.set(target, (sourcesByTarget.get(target) ?? new Set()).add(plan.source));
    }
  });
  const contested = new Set([...sourcesByTarget].filter(([, sources]) => sources.size > 1).map(([target]) => target));
  for (const target of contested) problems.push(`two different fixtures would both become ${target}; rename one of them`);

  const actions = new Map();
  const evals = doc.evals.map((evaluation, caseIndex) => {
    const casePlan = casePlans[caseIndex];
    if (casePlan === null) return evaluation;

    const files = casePlan.plans === null ? casePlan.entries : casePlan.plans.map((plan, entryIndex) => {
      if (plan.step === 'keep') return plan.path;
      if (plan.step === 'problem') return casePlan.entries[entryIndex];
      const target = targetOf(plan, evaluation, shared);
      if (contested.has(target)) return casePlan.entries[entryIndex];
      actions.set(target, plan.step === 'write'
        ? { type: 'write', path: target, content: plan.content }
        : { type: plan.step, from: plan.from, to: target });
      return target;
    });

    const synced = syncAssertions({ ...evaluation, files }, caseLabel(evaluation, caseIndex), problems);
    return orderKeys(synced, CASE_KEY_ORDER);
  });

  return { doc: orderKeys({ ...doc, evals }, [...NAME_KEYS, 'evals']), actions: [...actions.values()], problems };
}

function fixtureErrors(path, entryIndex, lookup) {
  const where = `files[${entryIndex}] ${JSON.stringify(path)}`;
  if (!path.startsWith(`${FIXTURE_ROOT}/`)) return [`${where} must start with ${FIXTURE_ROOT}/`];
  if (path.split('/').includes('..')) return [`${where} must not contain ..`];
  const found = lookup(path);
  if (found.kind === 'missing') return [`${where} does not exist`];
  if (found.kind !== 'file') return [`${where} is not a regular file`];
  if (found.bytes > MAX_FIXTURE_BYTES) return [`${where} is larger than 64 KB`];
  if (!found.isText) return [`${where} is not text`];
  return [];
}

function caseErrors(evaluation, lookup, kind) {
  const errors = [];
  if (!Number.isInteger(evaluation.id)) errors.push('id must be an integer');

  if (!Array.isArray(evaluation.files)) {
    errors.push('files must be a list of paths ([] when the case has no fixture)');
  } else if (kind === 'agent') {
    if (evaluation.files.length > 0) errors.push('agent evals cannot carry fixture files; files must be []');
  } else {
    evaluation.files.forEach((entry, index) => {
      if (typeof entry !== 'string') errors.push(`files[${index}] must be a path string`);
      else errors.push(...fixtureErrors(entry, index, lookup));
    });
  }

  const { assertions } = evaluation;
  const hasAssertions = isStringList(assertions) && assertions.length > 0 && assertions.every((line) => line.trim());
  if (!hasAssertions) errors.push('assertions must be a non-empty list of sentences');
  else if (!sameList(assertions, evaluation.expectations)) errors.push('expectations must be the same list as assertions');

  if (Object.hasOwn(evaluation, 'expected_skill')) {
    const value = evaluation.expected_skill;
    const isNameOrNull = value === null || (typeof value === 'string' && value.trim().length > 0);
    if (!isNameOrNull) errors.push('expected_skill must be null or a skill name');
  }
  return errors;
}

/**
 * What stops a document from loading in all three runners (errors), and where
 * it falls short of the standard's size rules (warnings).
 */
export function checkEvalDocument(doc, lookup = nothingExists, { kind = 'skill' } = {}) {
  if (!isObject(doc) || !Array.isArray(doc.evals)) {
    return { errors: ['evals must be a list of cases'], warnings: [] };
  }
  const errors = doc.evals.flatMap((evaluation, index) => {
    const label = caseLabel(evaluation, index);
    if (!isObject(evaluation)) return [`${label} is not an object`];
    return caseErrors(evaluation, lookup, kind).map((message) => `${label}: ${message}`);
  });

  const warnings = [];
  if (kind === 'skill') {
    const count = doc.evals.length;
    if (count < MIN_CASES) {
      warnings.push(`${count} ${count === 1 ? 'case' : 'cases'}; the standard asks for at least ${MIN_CASES}`);
    }
    if (!doc.evals.some(isNegativeCase)) {
      warnings.push('no negative case (a case with "expected_skill": null)');
    }
  }
  return { errors, warnings };
}
