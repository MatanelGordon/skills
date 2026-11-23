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
export const MIN_ASSERTIONS = 2;
export const MAX_ASSERTIONS = 5;
export const MAX_FIXTURE_BYTES = 64 * 1024;

const SHARED_FOLDER = 'shared';
const NAME_KEYS = Object.freeze(['skill_name', 'agent_name']);
// A `files` string longer than a file name can be, or spanning lines, is fixture text someone inlined.
const MAX_PATH_LENGTH = 255;
const LEGACY_FIXTURE_ROOT = 'evals/fixtures/';
// Files SkillEvaluator reads to run the evaluation itself; it refuses to stage them as task input.
const EVALUATOR_CONTROL_ROOTS = new Set(['environment', 'harbor', 'results', 'tests']);
const EVALUATOR_CONTROL_FILES = new Set([
  'evals.json', 'evals.jsonl', 'evals.yaml', 'evals.yml', 'config.yml', 'config.yaml', 'eval.md', 'grader.py', 'grader.sh',
]);
// CI also checks the repository out on Windows, where one such name fails the whole checkout.
// eslint-disable-next-line no-control-regex
const WINDOWS_FORBIDDEN_CHARACTERS = /[<>:"|?*\\\u0000-\u001f]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// install/run-tests.mjs runs every *.test.mjs under skills/, fixtures included.
const REPO_TEST_FILE = /\.test\.mjs$/;
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
const isPortableName = (segment) => (
  !WINDOWS_FORBIDDEN_CHARACTERS.test(segment) && !WINDOWS_RESERVED_NAME.test(segment) && !/[. ]$/.test(segment)
);
const isFolderId = (id) => Number.isInteger(id) && id >= 0;
const isEvaluatorControl = (pathUnderEvals) => {
  const parts = pathUnderEvals.split('/');
  return EVALUATOR_CONTROL_ROOTS.has(parts[0].toLowerCase())
    || (parts.length === 1 && EVALUATOR_CONTROL_FILES.has(parts[0].toLowerCase()));
};
const caseLabel = (evaluation, index) => (
  isObject(evaluation) && evaluation.id !== undefined && evaluation.id !== null
    ? `eval ${evaluation.id}`
    : `eval at position ${index + 1}`
);
const isNegativeCase = (evaluation) => (
  isObject(evaluation) && Object.hasOwn(evaluation, 'expected_skill') && evaluation.expected_skill === null
);

export const serializeEvalDocument = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/**
 * Keys that appear twice in one JSON object, anywhere in the text. JSON.parse keeps the last
 * one silently, so a rewrite would drop the other: a merge that left both must be resolved by hand.
 */
export function duplicateKeys(text) {
  const found = [];
  const objects = [];
  let index = 0;
  const readString = () => {
    let value = '';
    index++;
    while (index < text.length && text[index] !== '"') {
      if (text[index] === '\\') index++;
      value += text[index];
      index++;
    }
    index++;
    return value;
  };
  while (index < text.length) {
    const char = text[index];
    if (char === '{') {
      objects.push({ keys: new Set(), expectKey: true });
      index++;
    } else if (char === '[') {
      objects.push(null);
      index++;
    } else if (char === '}' || char === ']') {
      objects.pop();
      index++;
    } else if (char === ',') {
      const top = objects[objects.length - 1];
      if (top) top.expectKey = true;
      index++;
    } else if (char === '"') {
      const top = objects[objects.length - 1];
      const value = readString();
      if (top && top.expectKey) {
        if (top.keys.has(value) && !found.includes(value)) found.push(value);
        top.keys.add(value);
        top.expectKey = false;
      }
    } else {
      index++;
    }
  }
  return found;
}

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

  const existsFromSkill = lookup(entry).kind === 'file';
  if (entry.startsWith('evals/') && existsFromSkill) return planUnderEvals(entry, where);
  const fromEvals = `evals/${entry}`;
  if (lookup(fromEvals).kind === 'file') {
    return fromEvals.startsWith(`${FIXTURE_ROOT}/`) ? { step: 'keep', path: fromEvals } : planUnderEvals(fromEvals, where);
  }
  if (existsFromSkill) return { step: 'copy', from: entry, source: entry, rest: baseName(entry) };
  return { step: 'problem', message: `${where} ${JSON.stringify(entry)} does not name a file in the skill` };
}

/**
 * A file elsewhere under evals/: a legacy fixture moves into evals/files/, an evaluator control
 * file is refused, and anything else is copied so whatever else reads it keeps finding it.
 */
function planUnderEvals(path, where) {
  const underEvals = path.slice('evals/'.length);
  if (isEvaluatorControl(underEvals)) {
    return { step: 'problem', message: `${where} ${JSON.stringify(path)} is an evaluator control file; list a copy under ${FIXTURE_ROOT}/ instead` };
  }
  if (path.startsWith(LEGACY_FIXTURE_ROOT)) {
    return { step: 'move', from: path, source: path, rest: path.slice(LEGACY_FIXTURE_ROOT.length) };
  }
  return { step: 'copy', from: path, source: path, rest: baseName(path) };
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
  if (needsFolder && !isFolderId(evaluation.id)) {
    return { entries: raw, plans: null, message: 'id cannot name a fixture folder; give the case a non-negative integer id first' };
  }
  return { entries, plans };
}

/** Paths that a case left unrepaired still names: a move would pull the file out from under it. */
function pathsStillNamed(casePlans, evals) {
  const named = new Set();
  const add = (entry) => {
    if (typeof entry !== 'string') return;
    named.add(entry);
    named.add(`evals/${entry}`);
  };
  casePlans.forEach((casePlan, caseIndex) => {
    if (casePlan === null) {
      const files = evals[caseIndex]?.files;
      (Array.isArray(files) ? files : [files]).forEach(add);
      return;
    }
    if (casePlan.plans === null) {
      (Array.isArray(casePlan.entries) ? casePlan.entries : [casePlan.entries]).forEach(add);
      return;
    }
    casePlan.plans.forEach((plan, entryIndex) => {
      if (plan.step === 'problem') add(casePlan.entries[entryIndex]);
    });
  });
  return named;
}

const keepSourcesNamed = (casePlans, named) => casePlans.map((casePlan) => (
  casePlan?.plans
    ? { ...casePlan, plans: casePlan.plans.map((plan) => (plan.step === 'move' && named.has(plan.from) ? { ...plan, step: 'copy' } : plan)) }
    : casePlan
));

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
export function normalizeEvalDocument(doc, lookup = nothingExists, { kind = 'skill', raw } = {}) {
  const duplicated = typeof raw === 'string' ? duplicateKeys(raw) : [];
  if (duplicated.length > 0) {
    const problems = duplicated.map((key) => `duplicate key ${JSON.stringify(key)} in one object; JSON keeps only the last, so resolve it by hand`);
    return { doc: null, actions: [], problems };
  }
  if (!isObject(doc) || !Array.isArray(doc.evals)) {
    return { doc, actions: [], problems: ['evals must be a list of cases'] };
  }

  const problems = [];
  const plannedCases = doc.evals.map((evaluation, index) => {
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
  const casePlans = keepSourcesNamed(plannedCases, pathsStillNamed(plannedCases, doc.evals));

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
  if (!path.split('/').every(isPortableName)) return [`${where} is not a valid file name on Windows`];
  if (REPO_TEST_FILE.test(path)) return [`${where} would be run by npm test; rename it (for example add .txt)`];
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
    doc.evals.forEach((evaluation, index) => {
      const count = isObject(evaluation) && Array.isArray(evaluation.assertions) ? evaluation.assertions.length : 0;
      if (count > 0 && (count < MIN_ASSERTIONS || count > MAX_ASSERTIONS)) {
        warnings.push(`${caseLabel(evaluation, index)}: ${count} ${count === 1 ? 'assertion' : 'assertions'}; the standard asks for ${MIN_ASSERTIONS} to ${MAX_ASSERTIONS}`);
      }
    });
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
